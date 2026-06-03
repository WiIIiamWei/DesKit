import type { AppEntry, SearchResult } from "../launcher/types"
import type { UserSettings, UserSettingsPatch } from "../settings/settings"
import { app } from "electron"
import { AppCache } from "../launcher/app-cache"
import { launchApp } from "../launcher/launch-app"
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

  async init(): Promise<UserSettings> {
    this.settingsPath = settingsFilePath(app.getPath("userData"))
    this.settings = await loadSettings(this.settingsPath)
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
    if (this.settingsPath) await saveSettings(this.settingsPath, next)
    return next
  }

  async search(query: string): Promise<SearchResult[]> {
    if (this.cache.list().length === 0) {
      await this.cache.refresh()
    }
    return searchApps(this.cache.list(), query, { limit: 30 })
  }

  async launchById(id: string): Promise<boolean> {
    const entry = this.cache.list().find((app) => app.id === id)
    if (!entry) return false
    return launchApp(entry)
  }

  refreshApps(): Promise<readonly AppEntry[]> {
    return this.cache.refresh()
  }
}
