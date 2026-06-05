import type { AppEntry } from "./types"
import { describe, expect, it } from "vitest"
import { fuzzyMatch, searchApps } from "./search"

function entry(name: string, kind: AppEntry["kind"] = "win32"): AppEntry {
  return {
    id: `${kind}:${name}`,
    kind,
    name,
    nameLower: name.toLowerCase(),
    target: name,
  }
}

describe("fuzzyMatch", () => {
  it("returns a zero-score empty match for an empty query", () => {
    const result = fuzzyMatch("", "anything")
    expect(result).toEqual({ score: 0, matches: [] })
  })

  it("matches subsequence characters in order", () => {
    const result = fuzzyMatch("vsc", "Visual Studio Code")
    expect(result).not.toBeNull()
    // V (0), s (2 — first lowercase 's' in "Visual"), C (14)
    expect(result!.matches).toEqual([0, 2, 14])
  })

  it("ranks word-boundary matches above mid-word matches", () => {
    const boundary = fuzzyMatch("ps", "Power Shell")
    const midword = fuzzyMatch("ps", "Notepad++ Settings")
    expect(boundary).not.toBeNull()
    expect(midword).not.toBeNull()
    expect(boundary!.score).toBeGreaterThan(midword!.score)
  })

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "Calculator")).toBeNull()
  })
})

describe("searchApps", () => {
  const apps = [
    entry("Visual Studio Code"),
    entry("Code"),
    entry("Notepad"),
    entry("Calculator", "uwp"),
    entry("Code Composer Studio"),
  ]

  it("returns the first slice when the query is empty", () => {
    const results = searchApps(apps, "", { limit: 3 })
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.score === 0)).toBe(true)
  })

  it("orders shorter exact-prefix matches above longer fuzzy matches", () => {
    const results = searchApps(apps, "code")
    expect(results[0].entry.name).toBe("Code")
  })

  it("boosts frequently used apps above slightly better text matches", () => {
    const now = Date.UTC(2026, 5, 5)
    const results = searchApps(apps, "code", {
      now: () => now,
      ranking: {
        getSignals: (key: string) =>
          key === "app:win32:Visual Studio Code"
            ? { launchCount: 12, lastUsedAt: now - 60_000 }
            : undefined,
      },
    })

    expect(results[0].entry.name).toBe("Visual Studio Code")
  })

  it("lets a learned query boost lift a weaker text match on prefix match", () => {
    const now = Date.UTC(2026, 5, 5)
    // "Code Composer Studio" scores below "Code" on text alone, but the user
    // has repeatedly picked it under the query "co".
    const results = searchApps(apps, "co", {
      now: () => now,
      ranking: {
        getSignals: () => undefined,
        getQueryBoost: (query, key) =>
          query === "co" && key === "app:win32:Code Composer Studio" ? 9 : 0,
      },
    })

    expect(results[0].entry.name).toBe("Code Composer Studio")
  })

  it("filters out non-matches entirely", () => {
    const results = searchApps(apps, "zzz")
    expect(results).toHaveLength(0)
  })

  it("respects the limit option", () => {
    const results = searchApps(apps, "c", { limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it("orders empty queries by dynamic ranking before cache order", () => {
    const now = Date.UTC(2026, 5, 5)
    const results = searchApps(apps, "", {
      now: () => now,
      ranking: {
        getSignals: (key: string) =>
          key === "app:uwp:Calculator" ? { launchCount: 1, lastUsedAt: now } : undefined,
      },
    })

    expect(results[0].entry.name).toBe("Calculator")
  })
})
