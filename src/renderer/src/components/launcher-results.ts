import { localize } from "@/components/plugins/view-utils"

export type LauncherItem =
  | { kind: "app"; value: string; result: LauncherSearchResult }
  | { kind: "plugin"; value: string; result: DeskitPluginCommandResult }

export function mergeLauncherResults(
  apps: LauncherSearchResult[],
  commands: DeskitPluginCommandResult[],
  locale: string
): LauncherItem[] {
  return [
    ...commands.map((result) => ({
      kind: "plugin" as const,
      value: `plugin:${result.pluginId}:${result.commandId}`,
      result,
    })),
    ...apps.map((result) => ({
      kind: "app" as const,
      value: `app:${result.entry.id}`,
      result,
    })),
  ].sort((a, b) => compareLauncherItems(a, b, locale))
}

export interface LauncherSegment {
  kind: LauncherItem["kind"]
  key: string
  items: LauncherItem[]
}

/**
 * Split the already score-sorted items into contiguous same-kind runs, so the
 * rendered order follows the merged score exactly (a high-scoring app can sit
 * above plugin commands). Headings may repeat when kinds interleave — that is
 * the intended trade-off for honoring cross-type ranking, instead of forcing a
 * fixed plugin-then-app layout that discards the sort.
 */
export function launcherSegments(items: LauncherItem[]): LauncherSegment[] {
  const segments: LauncherSegment[] = []
  for (const item of items) {
    const last = segments.at(-1)
    if (last && last.kind === item.kind) {
      last.items.push(item)
    } else {
      segments.push({ kind: item.kind, key: `${item.kind}-${segments.length}`, items: [item] })
    }
  }
  return segments
}

export function launcherItemTitle(item: LauncherItem, locale: string): string {
  return item.kind === "plugin" ? localize(item.result.title, locale) : item.result.entry.name
}

export function launcherItemScore(item: LauncherItem): number {
  return item.result.score
}

function compareLauncherItems(a: LauncherItem, b: LauncherItem, locale: string): number {
  const scoreDiff = launcherItemScore(b) - launcherItemScore(a)
  if (scoreDiff !== 0) return scoreDiff
  if (a.kind !== b.kind) return a.kind === "plugin" ? -1 : 1
  return launcherItemTitle(a, locale).localeCompare(launcherItemTitle(b, locale))
}
