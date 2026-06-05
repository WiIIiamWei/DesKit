import type { LauncherRankingRecorder } from "../launcher/ranking-store"
import type { AppEntry, SearchResult } from "../launcher/types"
import type { UserSettings, UserSettingsPatch } from "../settings/settings"
import { app } from "electron"
import { AppCache } from "../launcher/app-cache"
import { launchApp } from "../launcher/launch-app"
import { appRankingKey } from "../launcher/ranking-store"
import { searchApps } from "../launcher/search"
import {
  defaultSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
  settingsFilePath,
} from "../settings/settings"

/**
 * Glue layer between IPC and the launcher domain. Owned by main/index.ts
 * so we have a single mutable cache + settings object per process.
 */
export class LauncherService {
  readonly cache = new AppCache()
  private settings: UserSettings = { ...defaultSettings }
  private settingsPath: string | null = null
  private ranking?: LauncherRankingRecorder

  async init(options: { ranking?: LauncherRankingRecorder } = {}): Promise<UserSettings> {
    this.ranking = options.ranking
    this.settingsPath = settingsFilePath(app.getPath("userData"))
    this.settings = await loadSettings(this.settingsPath)
    this.ranking?.setQueryLearningEnabled?.(this.settings.learnFromSearchHistory)
    return this.settings
  }

  getSettings(): UserSettings {
    return this.settings
  }

  async updateSettings(patch: UserSettingsPatch): Promise<UserSettings> {
    const next = normalizeSettings({
      ...this.settings,
      ...patch,
      hotkeys: {
        ...this.settings.hotkeys,
        ...patch.hotkeys,
      },
    })
    this.settings = next
    this.ranking?.setQueryLearningEnabled?.(next.learnFromSearchHistory)
    if (this.settingsPath) await saveSettings(this.settingsPath, next)
    return next
  }

  // Forget the per-query learned preferences (the search-history component of
  // ranking); anonymous app/command usage counts are kept. Best-effort.
  async clearSearchLearning(): Promise<void> {
    try {
      await this.ranking?.clearQueryLearning?.()
    } catch (err) {
      console.warn("[launcher] failed to clear search learning", err)
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    if (this.cache.list().length === 0) {
      await this.refreshApps()
    }
    return searchApps(this.cache.list(), query, { limit: 30, ranking: this.ranking })
  }

  async launchById(id: string, query?: string): Promise<boolean> {
    const entry = this.cache.list().find((app) => app.id === id)
    if (!entry) return false
    const ok = await launchApp(entry)
    if (ok) {
      // Ranking is best-effort telemetry; a failed write must not turn a
      // successful launch into a user-facing error. `query` is the search text
      // the launch was triggered from, for per-query learning.
      try {
        await this.ranking?.recordSelection(appRankingKey(entry.id), { query })
      } catch (err) {
        console.warn("[launcher] failed to record launch for ranking", err)
      }
    }
    return ok
  }

  async refreshApps(): Promise<readonly AppEntry[]> {
    const apps = await this.cache.refresh()
    await this.pruneStaleRankings(apps)
    return apps
  }

  // Evict ranking entries for apps that are no longer installed. Best-effort:
  // a failed prune must never break a refresh.
  private async pruneStaleRankings(apps: readonly AppEntry[]): Promise<void> {
    if (!this.ranking) return
    try {
      await this.ranking.prune(
        "app:",
        apps.map((entry) => appRankingKey(entry.id))
      )
    } catch (err) {
      console.warn("[launcher] failed to prune stale app rankings", err)
    }
  }
}
