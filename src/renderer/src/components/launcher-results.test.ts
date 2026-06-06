import { describe, expect, it } from "vitest"
import { launcherSegments, mergeLauncherResults } from "@/components/launcher-results"

describe("launcher results", () => {
  it("ranks plugin commands before apps when their score is higher", () => {
    const results = mergeLauncherResults(
      [appResult("calendar", "Calendar", 5)],
      [commandResult("timestamp.convert", "Convert Timestamp", 12)],
      "en"
    )

    expect(results.map((item) => item.value)).toEqual([
      "plugin:com.deskit.timestamp:timestamp.convert",
      "app:calendar",
    ])
  })

  it("ranks apps before plugin commands when their score is higher", () => {
    const results = mergeLauncherResults(
      [appResult("calculator", "Calculator", 18)],
      [commandResult("timestamp.convert", "Convert Timestamp", 7)],
      "en"
    )

    expect(results.map((item) => item.value)).toEqual([
      "app:calculator",
      "plugin:com.deskit.timestamp:timestamp.convert",
    ])
  })

  it("uses plugin commands as the cross-kind tie breaker", () => {
    const results = mergeLauncherResults(
      [appResult("calculator", "Calculator", 10)],
      [commandResult("timestamp.convert", "Convert Timestamp", 10)],
      "en"
    )

    expect(results.map((item) => item.value)).toEqual([
      "plugin:com.deskit.timestamp:timestamp.convert",
      "app:calculator",
    ])
  })
})

describe("launcherSegments", () => {
  it("renders in merged score order so a high-scoring app sits above plugin commands", () => {
    const items = mergeLauncherResults(
      [appResult("calculator", "Calculator", 18)],
      [commandResult("timestamp.convert", "Convert Timestamp", 7)],
      "en"
    )
    const segments = launcherSegments(items)

    // The app segment comes first, and flattening the segments reproduces the
    // exact merged order — the regression was rendering all plugins first.
    expect(segments.map((s) => s.kind)).toEqual(["app", "plugin"])
    expect(segments.flatMap((s) => s.items.map((i) => i.value))).toEqual(items.map((i) => i.value))
  })

  it("splits into multiple same-kind runs when kinds interleave by score", () => {
    const items = mergeLauncherResults(
      [appResult("calculator", "Calculator", 10), appResult("calendar", "Calendar", 8)],
      [commandResult("timestamp.convert", "Convert Timestamp", 9)],
      "en"
    )
    // Sorted: Calculator(10) > Convert(9) > Calendar(8)
    const segments = launcherSegments(items)

    expect(segments.map((s) => s.kind)).toEqual(["app", "plugin", "app"])
    expect(segments.map((s) => s.key)).toEqual(["app-0", "plugin-1", "app-2"])
    expect(segments.flatMap((s) => s.items.map((i) => i.value))).toEqual(items.map((i) => i.value))
  })

  it("returns no segments for an empty result list", () => {
    expect(launcherSegments([])).toEqual([])
  })
})

function appResult(id: string, name: string, score: number): LauncherSearchResult {
  return {
    entry: {
      id,
      kind: "macos",
      name,
      nameLower: name.toLowerCase(),
      target: `/Applications/${name}.app`,
    },
    score,
    matches: [],
  }
}

function commandResult(
  commandId: string,
  title: DeskitLocalizedString,
  score: number
): DeskitPluginCommandResult {
  return {
    kind: "plugin-command",
    pluginId: "com.deskit.timestamp",
    commandId,
    title,
    mode: "view",
    score,
    matches: [],
  }
}
