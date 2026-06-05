import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { launcherRankingFilePath, LauncherRankingStore, rankingBoost } from "./ranking-store"

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

    await store.recordSelection("app:win32:Code", 100)
    await store.recordSelection("app:win32:Code", 250)

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
      Array.from({ length: 25 }, () => store.recordSelection("app:win32:Code", 1000))
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
    await store.recordSelection("app:win32:Code", 100)
    await store.recordSelection("app:win32:Gone", 100)
    await store.recordSelection("plugin-command:com.deskit.x:run", 100)

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
    await store.recordSelection("app:win32:Code", 100)

    // An empty live set means a failed/empty scan, not "all uninstalled".
    await store.prune("app:", [])

    expect(store.getSignals("app:win32:Code")).toBeDefined()
  })
})
