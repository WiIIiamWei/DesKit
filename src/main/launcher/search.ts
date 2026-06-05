import type { LauncherRankingProvider } from "./ranking-store"
import type { AppEntry, SearchResult } from "./types"
import { appRankingKey, rankingBoost } from "./ranking-store"

// Subsequence fuzzy match (Sublime/VSCode style). Returns null when the
// query is not a subsequence of the candidate. Score rewards consecutive
// matches and matches at word boundaries / start of name so that typing
// "vsc" ranks "Visual Studio Code" above "Voice Recorder Settings Console".
export interface FuzzyMatch {
  score: number
  matches: number[]
}

export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  if (!query) return { score: 0, matches: [] }
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()
  const matches: number[] = []

  let score = 0
  let qi = 0
  let prevMatch = -2

  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] !== q[qi]) continue
    let bonus = 1
    if (ci === 0) bonus += 6
    else if (isWordBoundary(c, ci)) bonus += 4
    if (ci === prevMatch + 1) bonus += 3
    score += bonus
    matches.push(ci)
    prevMatch = ci
    qi++
  }

  if (qi < q.length) return null
  // Shorter candidates win ties — typing "code" should prefer "Code" over
  // "Code Composer Studio".
  score -= Math.max(0, c.length - q.length) * 0.05
  return { score, matches }
}

function isWordBoundary(text: string, i: number): boolean {
  if (i === 0) return true
  const prev = text.charCodeAt(i - 1)
  // Space, dash, underscore, dot, slash, parens.
  return (
    prev === 32 ||
    prev === 45 ||
    prev === 95 ||
    prev === 46 ||
    prev === 47 ||
    prev === 92 ||
    prev === 40
  )
}

export interface SearchOptions {
  limit?: number
  ranking?: LauncherRankingProvider
  now?: () => number
}

export function searchApps(
  apps: readonly AppEntry[],
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const limit = options.limit ?? 50
  const trimmed = query.trim()
  const now = options.now?.() ?? Date.now()

  if (!trimmed) {
    return apps
      .map((entry, index) => ({
        result: {
          entry,
          score: rankingBoost(options.ranking?.getSignals(appRankingKey(entry.id)), now),
          matches: [],
        },
        index,
      }))
      .sort((a, b) => b.result.score - a.result.score || a.index - b.index)
      .slice(0, limit)
      .map((item) => item.result)
  }

  const results: SearchResult[] = []
  for (const entry of apps) {
    const match = fuzzyMatch(trimmed, entry.name)
    if (!match) continue
    const score =
      match.score + rankingBoost(options.ranking?.getSignals(appRankingKey(entry.id)), now)
    results.push({ entry, score, matches: match.matches })
  }
  results.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
  return results.slice(0, limit)
}
