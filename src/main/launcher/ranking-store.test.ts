import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  launcherRankingFilePath,
  LauncherRankingStore,
  queryBoost,
  rankingBoost,
} from "./ranking-store"

const DAY_MS = 24 * 3_600_000

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-ranking-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("rankingBoost", () => {
  const now = Date.UTC(2026, 5, 5)

  it("returns no boost without signals", () => {
    expect(rankingBoost(undefined, now)).toBe(0)
  })

  it("decays the frequency boost as an entry sits idle", () => {
    // Recency boost is already zero past ~16h, so from one day on the score is
    // purely the decaying frequency component. Comparing two ages exactly one
    // half-life (30 days) apart isolates the decay to an exact factor of 0.5.
    const dayOld = rankingBoost({ launchCount: 50, lastUsedAt: now - DAY_MS }, now)
    const monthLater = rankingBoost({ launchCount: 50, lastUsedAt: now - 31 * DAY_MS }, now)
    const stale = rankingBoost({ launchCount: 50, lastUsedAt: now - 120 * DAY_MS }, now)

    expect(monthLater).toBeCloseTo(dayOld * 0.5, 5)
    expect(stale).toBeLessThan(monthLater)
    // After four months idle the once-popular app is all but forgotten.
    expect(stale).toBeLessThan(1)
  })

  it("does not decay an app that is still used regularly", () => {
    // lastUsedAt resets on every launch, so a daily-used app keeps full boost.
    const justUsed = rankingBoost({ launchCount: 200, lastUsedAt: now }, now)
    expect(justUsed).toBeGreaterThan(20)
  })
})

describe("launcherRankingStore", () => {
  it("normalizes malformed files to an empty ranking", async () => {
    const filePath = launcherRankingFilePath(dir)
    await fs.writeFile(filePath, JSON.stringify({ items: { bad: { launchCount: -1 } } }), "utf-8")
    const store = new LauncherRankingStore(filePath)

    await store.load()

    expect(store.getSignals("bad")).toBeUndefined()
  })

  it("falls back to an empty ranking when the file cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    // A directory at the ranking path makes fs.readFile reject with a
    // non-ENOENT error (EISDIR); startup must not be blocked by it.
    const filePath = launcherRankingFilePath(dir)
    await fs.mkdir(filePath)
    const store = new LauncherRankingStore(filePath)

    await expect(store.load()).resolves.toBeUndefined()

    expect(store.getSignals("anything")).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("records selections with count and recency", async () => {
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()

    await store.recordSelection("app:win32:Code", { now: 100 })
    await store.recordSelection("app:win32:Code", { now: 250 })

    expect(store.getSignals("app:win32:Code")).toEqual({
      launchCount: 2,
      lastUsedAt: 250,
    })
    await expect(fs.readFile(filePath, "utf-8")).resolves.toContain('"launchCount": 2')
  })

  it("persists every selection when many are recorded concurrently", async () => {
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()

    // Fire overlapping writes (same key, same millisecond) without awaiting
    // each — this used to collide on a Date.now()-based temp path and reject
    // with ENOENT on rename.
    await Promise.all(
      Array.from({ length: 25 }, () => store.recordSelection("app:win32:Code", { now: 1000 }))
    )

    expect(store.getSignals("app:win32:Code")?.launchCount).toBe(25)

    // The on-disk state must be valid JSON reflecting the final count, with no
    // orphaned temp files left behind.
    const reloaded = new LauncherRankingStore(filePath)
    await reloaded.load()
    expect(reloaded.getSignals("app:win32:Code")?.launchCount).toBe(25)
    const tempFiles = (await fs.readdir(dir)).filter((name) => name.endsWith(".tmp"))
    expect(tempFiles).toEqual([])
  })

  it("prunes orphaned entries under a prefix and persists the result", async () => {
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()
    await store.recordSelection("app:win32:Code", { now: 100 })
    await store.recordSelection("app:win32:Gone", { now: 100 })
    await store.recordSelection("plugin-command:com.deskit.x:run", { now: 100 })

    await store.prune("app:", ["app:win32:Code"])

    expect(store.getSignals("app:win32:Code")).toBeDefined()
    // Orphaned app entry is gone, but the plugin-command namespace is untouched.
    expect(store.getSignals("app:win32:Gone")).toBeUndefined()
    expect(store.getSignals("plugin-command:com.deskit.x:run")).toBeDefined()

    const reloaded = new LauncherRankingStore(filePath)
    await reloaded.load()
    expect(reloaded.getSignals("app:win32:Gone")).toBeUndefined()
  })

  it("never evicts when the live key set is empty", async () => {
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()
    await store.recordSelection("app:win32:Code", { now: 100 })

    // An empty live set means a failed/empty scan, not "all uninstalled".
    await store.prune("app:", [])

    expect(store.getSignals("app:win32:Code")).toBeDefined()
  })
})

describe("queryBoost", () => {
  const now = Date.UTC(2026, 5, 5)

  it("returns no boost without signals", () => {
    expect(queryBoost(undefined, now)).toBe(0)
  })

  it("is capped so a single learned association can never run away", () => {
    const huge = queryBoost({ count: 10_000, lastUsedAt: now }, now)
    expect(huge).toBeLessThanOrEqual(10)
    expect(huge).toBeGreaterThan(9)
  })

  it("decays as the association sits idle", () => {
    const fresh = queryBoost({ count: 4, lastUsedAt: now }, now)
    const halfLifeLater = queryBoost({ count: 4, lastUsedAt: now - 30 * DAY_MS }, now)
    expect(halfLifeLater).toBeCloseTo(fresh * 0.5, 5)
  })
})

describe("launcherRankingStore query learning", () => {
  it("records the query a selection was made under and boosts it on prefix match", async () => {
    const now = Date.UTC(2026, 5, 5)
    const store = new LauncherRankingStore(launcherRankingFilePath(dir))
    await store.load()

    await store.recordSelection("app:win32:Excel", { query: "ex", now })

    // Conservative prefix match: typing as much as last time (or more) boosts;
    // typing less than the learned query does not.
    expect(store.getQueryBoost("ex", "app:win32:Excel", now)).toBeGreaterThan(0)
    expect(store.getQueryBoost("exc", "app:win32:Excel", now)).toBeGreaterThan(0)
    expect(store.getQueryBoost("e", "app:win32:Excel", now)).toBe(0)
    // No learning for a key that was never picked under that query.
    expect(store.getQueryBoost("ex", "app:win32:Edge", now)).toBe(0)
  })

  it("persists learned queries across reloads", async () => {
    const now = Date.UTC(2026, 5, 5)
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()
    await store.recordSelection("app:win32:Chrome", { query: "ch", now })

    const reloaded = new LauncherRankingStore(filePath)
    await reloaded.load()
    expect(reloaded.getQueryBoost("ch", "app:win32:Chrome", now)).toBeGreaterThan(0)
  })

  it("does not learn from empty or whitespace-only queries", async () => {
    const now = Date.UTC(2026, 5, 5)
    const store = new LauncherRankingStore(launcherRankingFilePath(dir))
    await store.load()

    await store.recordSelection("app:win32:Code", { query: "   ", now })
    await store.recordSelection("app:win32:Code", { now })

    // Global frecency is still recorded; there is just no query bucket to match.
    expect(store.getSignals("app:win32:Code")?.launchCount).toBe(2)
    expect(store.getQueryBoost("anything", "app:win32:Code", now)).toBe(0)
  })

  it("takes the strongest matching prefix rather than stacking them", async () => {
    const now = Date.UTC(2026, 5, 5)
    const store = new LauncherRankingStore(launcherRankingFilePath(dir))
    await store.load()

    // Learn the same key under two overlapping prefixes.
    await store.recordSelection("app:win32:Excel", { query: "e", now })
    await store.recordSelection("app:win32:Excel", { query: "ex", now })

    const combined = store.getQueryBoost("excel", "app:win32:Excel", now)
    const strongest = Math.max(
      queryBoost({ count: 1, lastUsedAt: now }, now),
      queryBoost({ count: 1, lastUsedAt: now }, now)
    )
    expect(combined).toBeCloseTo(strongest, 5)
  })

  it("prunes orphaned keys out of query buckets and drops empty buckets", async () => {
    const now = Date.UTC(2026, 5, 5)
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()
    await store.recordSelection("app:win32:Gone", { query: "go", now })
    await store.recordSelection("app:win32:Code", { query: "co", now })

    await store.prune("app:", ["app:win32:Code"])

    expect(store.getQueryBoost("go", "app:win32:Gone", now)).toBe(0)
    expect(store.getQueryBoost("co", "app:win32:Code", now)).toBeGreaterThan(0)
  })

  it("loads a v1 file (no queries field) without error", async () => {
    const now = Date.UTC(2026, 5, 5)
    const filePath = launcherRankingFilePath(dir)
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        items: { "app:win32:Code": { launchCount: 3, lastUsedAt: now } },
      }),
      "utf-8"
    )
    const store = new LauncherRankingStore(filePath)

    await store.load()

    expect(store.getSignals("app:win32:Code")?.launchCount).toBe(3)
    expect(store.getQueryBoost("co", "app:win32:Code", now)).toBe(0)
  })

  it("keeps only the strongest keys per query, evicting the stalest", async () => {
    const base = Date.UTC(2026, 5, 5)
    const store = new LauncherRankingStore(launcherRankingFilePath(dir))
    await store.load()

    // Nine distinct apps picked under the same query "q", each one millisecond
    // newer than the last, so "app:0" is the stalest (lowest boost) once the
    // bucket overflows its eight-key cap.
    for (let i = 0; i < 9; i++) {
      await store.recordSelection(`app:win32:app${i}`, { query: "q", now: base + i })
    }

    const at = base + 8
    // The stalest entry was evicted; the newest and the rest survive.
    expect(store.getQueryBoost("q", "app:win32:app0", at)).toBe(0)
    expect(store.getQueryBoost("q", "app:win32:app1", at)).toBeGreaterThan(0)
    expect(store.getQueryBoost("q", "app:win32:app8", at)).toBeGreaterThan(0)
  })

  it("does not learn from or boost queries while learning is disabled", async () => {
    const now = Date.UTC(2026, 5, 5)
    const store = new LauncherRankingStore(launcherRankingFilePath(dir))
    await store.load()
    store.setQueryLearningEnabled(false)

    await store.recordSelection("app:win32:Excel", { query: "ex", now })

    // Global frecency is still recorded; only the per-query layer is paused.
    expect(store.getSignals("app:win32:Excel")?.launchCount).toBe(1)
    expect(store.getQueryBoost("ex", "app:win32:Excel", now)).toBe(0)

    // Re-enabling exposes nothing retroactively (nothing was recorded).
    store.setQueryLearningEnabled(true)
    expect(store.getQueryBoost("ex", "app:win32:Excel", now)).toBe(0)
  })

  it("clears learned queries but keeps global usage counts", async () => {
    const now = Date.UTC(2026, 5, 5)
    const filePath = launcherRankingFilePath(dir)
    const store = new LauncherRankingStore(filePath)
    await store.load()
    await store.recordSelection("app:win32:Excel", { query: "ex", now })

    await store.clearQueryLearning()

    expect(store.getQueryBoost("ex", "app:win32:Excel", now)).toBe(0)
    expect(store.getSignals("app:win32:Excel")?.launchCount).toBe(1)

    // The cleared state survives a reload.
    const reloaded = new LauncherRankingStore(filePath)
    await reloaded.load()
    expect(reloaded.getQueryBoost("ex", "app:win32:Excel", now)).toBe(0)
    expect(reloaded.getSignals("app:win32:Excel")?.launchCount).toBe(1)
  })
})
