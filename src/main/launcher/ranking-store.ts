import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"

const CURRENT_RANKING_VERSION = 1

// Idle days after which an entry's accumulated frequency boost is halved. The
// decay only kicks in once an app/command stops being used (it resets on every
// launch, since recordSelection refreshes lastUsedAt), so something used daily
// never fades, while something heavily used months ago but since abandoned
// stops dominating the results.
const FREQUENCY_HALF_LIFE_DAYS = 30

export interface LauncherRankingSignals {
  launchCount: number
  lastUsedAt: number
}

export interface LauncherRankingProvider {
  getSignals: (key: string) => LauncherRankingSignals | undefined
}

export interface LauncherRankingRecorder extends LauncherRankingProvider {
  recordSelection: (key: string, now?: number) => Promise<void> | void
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

export class LauncherRankingStore implements LauncherRankingRecorder {
  private items: Record<string, LauncherRankingSignals> = {}
  private loaded = false
  // Serializes writes so overlapping recordSelection calls persist in order
  // and never run write+rename concurrently against the same file.
  private saveChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8")
      this.items = normalizeRankingFile(JSON.parse(raw)).items
    } catch (err) {
      // Ranking is best-effort: a missing file is normal on first run, and a
      // corrupt or unreadable file (bad JSON, permission error) must never
      // block launcher startup. Reset to empty; warn for anything other than
      // the expected not-found case.
      if (!isFileNotFound(err)) {
        console.warn("[launcher-ranking] failed to load ranking file, starting empty", err)
      }
      this.items = {}
    }
    this.loaded = true
  }

  getSignals(key: string): LauncherRankingSignals | undefined {
    this.ensureLoaded()
    const item = this.items[key]
    return item ? { ...item } : undefined
  }

  async recordSelection(key: string, now = Date.now()): Promise<void> {
    this.ensureLoaded()
    const current = this.items[key]
    this.items[key] = {
      launchCount: (current?.launchCount ?? 0) + 1,
      lastUsedAt: now,
    }
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
    if (removed) await this.save()
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
    await fs.writeFile(
      tempPath,
      `${JSON.stringify({ version: CURRENT_RANKING_VERSION, items: this.items }, null, 2)}\n`,
      "utf-8"
    )
    await fs.rename(tempPath, this.filePath)
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error("Launcher ranking store must be loaded before use")
  }
}

function normalizeRankingFile(value: unknown): RankingFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: CURRENT_RANKING_VERSION, items: {} }
  }

  const rawItems = (value as { items?: unknown }).items
  if (!rawItems || typeof rawItems !== "object" || Array.isArray(rawItems)) {
    return { version: CURRENT_RANKING_VERSION, items: {} }
  }

  const items: Record<string, LauncherRankingSignals> = {}
  for (const [key, item] of Object.entries(rawItems)) {
    const normalized = normalizeSignals(item)
    if (normalized) items[key] = normalized
  }
  return { version: CURRENT_RANKING_VERSION, items }
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

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}
