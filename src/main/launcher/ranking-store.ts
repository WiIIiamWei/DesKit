import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"

// Bumped to 2 when per-query learning (`queries`) was added. v1 files (no
// `queries` field) still load — they just start with an empty query map.
const CURRENT_RANKING_VERSION = 2

// Idle days after which an entry's accumulated frequency boost is halved. The
// decay only kicks in once an app/command stops being used (it resets on every
// launch, since recordSelection refreshes lastUsedAt), so something used daily
// never fades, while something heavily used months ago but since abandoned
// stops dominating the results. Shared by the global and per-query boosts.
const FREQUENCY_HALF_LIFE_DAYS = 30

// Ceiling on the per-query learned boost. Tuned against the fuzzy scorer (a
// first-character match is worth ~7, a word-boundary match ~4): a cap of 10
// lets a learned association overturn a near-tie in text relevance, but cannot
// drag a clearly worse fuzzy match to the top — so a single mis-learned pick
// can never permanently pin the wrong result.
const QUERY_BOOST_CAP = 10
// log2(count+1) * weight: reaches the cap at roughly 7 selections under the
// same query, matching the global launchBoost curve's shape.
const QUERY_FREQ_WEIGHT = 3.5
// Keep at most this many learned keys per query; the weakest (lowest current
// boost) is evicted past the limit so a query bucket stays small and relevant.
const TOP_KEYS_PER_QUERY = 8
// Hard cap on the number of distinct learned queries, evicted LRU, so the file
// cannot grow without bound from one-off searches.
const MAX_QUERIES = 2000
// Queries longer than this are not learned from — long inputs are effectively
// unique, so learning them only bloats the store without ever matching again.
const MAX_LEARN_QUERY_LEN = 64

const DAY_MS = 24 * 3_600_000

export interface LauncherRankingSignals {
  launchCount: number
  lastUsedAt: number
}

export interface QueryRankingSignals {
  count: number
  lastUsedAt: number
}

export interface RecordSelectionOptions {
  /** The launcher search text the selection was made from, for per-query learning. */
  query?: string
  /** Override the timestamp (tests / determinism). Defaults to Date.now(). */
  now?: number
}

export interface LauncherRankingProvider {
  getSignals: (key: string) => LauncherRankingSignals | undefined
  /**
   * Additive boost learned from "when the user typed `currentQuery`, they
   * picked `key`". Optional so lightweight provider stubs (and global-only
   * callers) can omit it.
   */
  getQueryBoost?: (currentQuery: string, key: string, now?: number) => number
}

export interface LauncherRankingRecorder extends LauncherRankingProvider {
  recordSelection: (key: string, options?: RecordSelectionOptions) => Promise<void> | void
  /**
   * Drop stored entries under `keyPrefix` whose key is absent from `liveKeys`,
   * evicting orphans left behind by uninstalled apps / removed commands. A
   * no-op when `liveKeys` is empty, so a failed or not-yet-complete scan can
   * never wipe the rankings.
   */
  prune: (keyPrefix: string, liveKeys: Iterable<string>) => Promise<void> | void
}

interface RankingFile {
  version: number
  items: Record<string, LauncherRankingSignals>
  queries: Record<string, Record<string, QueryRankingSignals>>
}

export function launcherRankingFilePath(userDataDir: string): string {
  return path.join(userDataDir, "launcher-ranking.json")
}

export function appRankingKey(appId: string): string {
  return `app:${appId}`
}

export function pluginCommandRankingKey(pluginId: string, commandId: string): string {
  return `plugin-command:${pluginId}:${commandId}`
}

export function rankingBoost(
  signals: LauncherRankingSignals | undefined,
  now = Date.now()
): number {
  if (!signals) return 0
  const ageMs = Math.max(0, now - signals.lastUsedAt)
  const ageHours = ageMs / 3_600_000
  const ageDays = ageHours / 24
  // Exponentially decay the frequency boost by how long the entry has sat
  // idle so cumulative usage is gradually forgotten instead of boosting an
  // abandoned app forever.
  const frequencyDecay = 0.5 ** (ageDays / FREQUENCY_HALF_LIFE_DAYS)
  const launchBoost = Math.min(14, Math.log2(signals.launchCount + 1) * 3.5) * frequencyDecay
  const recencyBoost = Math.max(0, 8 - ageHours * 0.5)
  return launchBoost + recencyBoost
}

export function queryBoost(signals: QueryRankingSignals | undefined, now = Date.now()): number {
  if (!signals) return 0
  const ageDays = Math.max(0, now - signals.lastUsedAt) / DAY_MS
  const decay = 0.5 ** (ageDays / FREQUENCY_HALF_LIFE_DAYS)
  return Math.min(QUERY_BOOST_CAP, Math.log2(signals.count + 1) * QUERY_FREQ_WEIGHT) * decay
}

export class LauncherRankingStore implements LauncherRankingRecorder {
  private items: Record<string, LauncherRankingSignals> = {}
  private queries: Record<string, Record<string, QueryRankingSignals>> = {}
  private loaded = false
  // Serializes writes so overlapping recordSelection calls persist in order
  // and never run write+rename concurrently against the same file.
  private saveChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8")
      const normalized = normalizeRankingFile(JSON.parse(raw))
      this.items = normalized.items
      this.queries = normalized.queries
    } catch (err) {
      // Ranking is best-effort: a missing file is normal on first run, and a
      // corrupt or unreadable file (bad JSON, permission error) must never
      // block launcher startup. Reset to empty; warn for anything other than
      // the expected not-found case.
      if (!isFileNotFound(err)) {
        console.warn("[launcher-ranking] failed to load ranking file, starting empty", err)
      }
      this.items = {}
      this.queries = {}
    }
    this.loaded = true
  }

  getSignals(key: string): LauncherRankingSignals | undefined {
    this.ensureLoaded()
    const item = this.items[key]
    return item ? { ...item } : undefined
  }

  getQueryBoost(currentQuery: string, key: string, now = Date.now()): number {
    this.ensureLoaded()
    const norm = normalizeQuery(currentQuery)
    if (!norm) return 0
    // Conservative prefix match: only a learned query that is a prefix of (or
    // equal to) what the user has now typed contributes, so learning never
    // reorders results before the user has typed at least as much as last time.
    // Take the strongest matching bucket rather than summing, so overlapping
    // prefixes can't stack into an outsized boost.
    let best = 0
    for (let i = 1; i <= norm.length; i++) {
      const signals = this.queries[norm.slice(0, i)]?.[key]
      if (!signals) continue
      const boost = queryBoost(signals, now)
      if (boost > best) best = boost
    }
    return best
  }

  async recordSelection(key: string, options: RecordSelectionOptions = {}): Promise<void> {
    this.ensureLoaded()
    const now = options.now ?? Date.now()
    const current = this.items[key]
    this.items[key] = {
      launchCount: (current?.launchCount ?? 0) + 1,
      lastUsedAt: now,
    }
    this.recordQuerySelection(key, options.query, now)
    await this.save()
  }

  async prune(keyPrefix: string, liveKeys: Iterable<string>): Promise<void> {
    this.ensureLoaded()
    const live = liveKeys instanceof Set ? liveKeys : new Set(liveKeys)
    // An empty live set almost always means a failed or not-yet-finished scan
    // rather than "everything was uninstalled" — never evict in that case.
    if (live.size === 0) return
    let removed = false
    for (const key of Object.keys(this.items)) {
      if (key.startsWith(keyPrefix) && !live.has(key)) {
        delete this.items[key]
        removed = true
      }
    }
    // Mirror the eviction into the per-query buckets so an uninstalled app's
    // key stops boosting under learned queries; drop buckets left empty.
    for (const [query, bucket] of Object.entries(this.queries)) {
      for (const key of Object.keys(bucket)) {
        if (key.startsWith(keyPrefix) && !live.has(key)) {
          delete bucket[key]
          removed = true
        }
      }
      if (Object.keys(bucket).length === 0) {
        delete this.queries[query]
        removed = true
      }
    }
    if (removed) await this.save()
  }

  private recordQuerySelection(key: string, query: string | undefined, now: number): void {
    const norm = normalizeQuery(query)
    if (!norm) return
    let bucket = this.queries[norm]
    if (!bucket) {
      // Evict before inserting so a brand-new query never pushes the map past
      // the cap.
      this.evictStaleQueriesIfNeeded()
      bucket = this.queries[norm] = {}
    }
    const current = bucket[key]
    bucket[key] = {
      count: Math.min((current?.count ?? 0) + 1, 10_000),
      lastUsedAt: now,
    }
    this.trimQueryBucket(norm, now)
  }

  private trimQueryBucket(query: string, now: number): void {
    const bucket = this.queries[query]
    const keys = Object.keys(bucket)
    if (keys.length <= TOP_KEYS_PER_QUERY) return
    let weakestKey: string | null = null
    let weakest = Infinity
    for (const key of keys) {
      const boost = queryBoost(bucket[key], now)
      if (boost < weakest) {
        weakest = boost
        weakestKey = key
      }
    }
    if (weakestKey) delete bucket[weakestKey]
  }

  private evictStaleQueriesIfNeeded(): void {
    const queries = Object.keys(this.queries)
    if (queries.length < MAX_QUERIES) return
    let oldestKey: string | null = null
    let oldestSeen = Infinity
    for (const query of queries) {
      const seen = bucketLastUsedAt(this.queries[query])
      if (seen < oldestSeen) {
        oldestSeen = seen
        oldestKey = query
      }
    }
    if (oldestKey) delete this.queries[oldestKey]
  }

  private save(): Promise<void> {
    // Queue this write behind any in-flight one. The chain keeps going even if
    // a write rejects (`.catch`), but the rejection still propagates to this
    // caller via `run`.
    const run = this.saveChain.then(() => this.writeFile())
    this.saveChain = run.catch(() => {})
    return run
  }

  private async writeFile(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    // A random suffix keeps the temp path unique across concurrent processes
    // (and same-millisecond writes), so renames never collide.
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    const payload: RankingFile = {
      version: CURRENT_RANKING_VERSION,
      items: this.items,
      queries: this.queries,
    }
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8")
    await fs.rename(tempPath, this.filePath)
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error("Launcher ranking store must be loaded before use")
  }
}

function normalizeQuery(query: string | undefined): string | null {
  if (typeof query !== "string") return null
  const norm = query.trim().toLowerCase()
  if (!norm || norm.length > MAX_LEARN_QUERY_LEN) return null
  return norm
}

function bucketLastUsedAt(bucket: Record<string, QueryRankingSignals>): number {
  let max = 0
  for (const signals of Object.values(bucket)) {
    if (signals.lastUsedAt > max) max = signals.lastUsedAt
  }
  return max
}

function normalizeRankingFile(value: unknown): RankingFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: CURRENT_RANKING_VERSION, items: {}, queries: {} }
  }
  return {
    version: CURRENT_RANKING_VERSION,
    items: normalizeItems((value as { items?: unknown }).items),
    queries: normalizeQueries((value as { queries?: unknown }).queries),
  }
}

function normalizeItems(rawItems: unknown): Record<string, LauncherRankingSignals> {
  if (!rawItems || typeof rawItems !== "object" || Array.isArray(rawItems)) return {}
  const items: Record<string, LauncherRankingSignals> = {}
  for (const [key, item] of Object.entries(rawItems)) {
    const normalized = normalizeSignals(item)
    if (normalized) items[key] = normalized
  }
  return items
}

function normalizeQueries(
  rawQueries: unknown
): Record<string, Record<string, QueryRankingSignals>> {
  if (!rawQueries || typeof rawQueries !== "object" || Array.isArray(rawQueries)) return {}
  const queries: Record<string, Record<string, QueryRankingSignals>> = {}
  for (const [rawQuery, rawBucket] of Object.entries(rawQueries)) {
    const norm = normalizeQuery(rawQuery)
    if (!norm) continue
    if (!rawBucket || typeof rawBucket !== "object" || Array.isArray(rawBucket)) continue
    const bucket: Record<string, QueryRankingSignals> = {}
    for (const [key, signals] of Object.entries(rawBucket)) {
      const normalized = normalizeQuerySignals(signals)
      if (normalized) bucket[key] = normalized
    }
    if (Object.keys(bucket).length > 0) queries[norm] = bucket
  }
  return queries
}

function normalizeSignals(value: unknown): LauncherRankingSignals | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    typeof record.launchCount !== "number" ||
    !Number.isInteger(record.launchCount) ||
    record.launchCount <= 0
  ) {
    return undefined
  }
  if (
    typeof record.lastUsedAt !== "number" ||
    !Number.isFinite(record.lastUsedAt) ||
    record.lastUsedAt <= 0
  ) {
    return undefined
  }
  return {
    launchCount: Math.min(record.launchCount, 10_000),
    lastUsedAt: record.lastUsedAt,
  }
}

function normalizeQuerySignals(value: unknown): QueryRankingSignals | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.count !== "number" || !Number.isInteger(record.count) || record.count <= 0) {
    return undefined
  }
  if (
    typeof record.lastUsedAt !== "number" ||
    !Number.isFinite(record.lastUsedAt) ||
    record.lastUsedAt <= 0
  ) {
    return undefined
  }
  return {
    count: Math.min(record.count, 10_000),
    lastUsedAt: record.lastUsedAt,
  }
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}
