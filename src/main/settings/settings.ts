import { promises as fs } from "node:fs"
import * as path from "node:path"

// Persisted user settings. Kept tiny and forwards-compatible: unknown
// fields are stripped, missing fields fall back to defaults so old/new
// versions of the app interoperate cleanly.
export type ThemeMode = "light" | "dark" | "system"
export type ThemeAccent = "neutral" | "blue" | "green" | "rose" | "violet"
export type LanguageMode = "system" | "en" | "zh-CN"
export type BuiltinFloatingBallFeature = "appLauncher" | "screenshot"
export type PluginFloatingBallFeature = `plugin:${string}:${string}`
export type FloatingBallFeature = BuiltinFloatingBallFeature | PluginFloatingBallFeature

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"]
export const THEME_ACCENTS: readonly ThemeAccent[] = ["neutral", "blue", "green", "rose", "violet"]
export const LANGUAGE_MODES: readonly LanguageMode[] = ["system", "en", "zh-CN"]
export const FLOATING_BALL_FEATURES: readonly BuiltinFloatingBallFeature[] = [
  "appLauncher",
  "screenshot",
]
const MAX_FLOATING_BALL_FEATURES = 6
const CURRENT_SETTINGS_VERSION = 2

export interface HotkeySettings {
  /** Electron Accelerator string for the command launcher. */
  launcher: string
  /** Electron Accelerator string for region screenshot capture. */
  screenshot: string
}

export interface UserSettings {
  /** Internal schema version for one-time settings migrations. */
  settingsVersion: number
  /**
   * Legacy launcher accelerator retained for sync/backward compatibility.
   * Mirrors `hotkeys.launcher`.
   */
  hotkey: string
  /** Global Electron Accelerator strings. */
  hotkeys: HotkeySettings
  /** Preferred color scheme. "system" defers to OS preference. */
  themeMode: ThemeMode
  /** Accent palette key — only --primary / --ring shift per accent. */
  accent: ThemeAccent
  /** Preferred UI language. "system" defers to OS / Chromium language. */
  language: LanguageMode
  /** Whether the desktop floating ball is shown after startup. */
  floatingBallEnabled: boolean
  /** Features shown in the floating ball radial menu. */
  floatingBallFeatures: FloatingBallFeature[]
  /** Whether DesKit advertises and browses devices on the local network. */
  lanEnabled: boolean
  /**
   * Whether the launcher learns per-query result preferences from the search
   * text. When off, only anonymous app/command usage counts feed ranking and
   * no search strings are written to disk. Global frecency still applies.
   */
  learnFromSearchHistory: boolean
}

export type UserSettingsPatch = Partial<Omit<UserSettings, "hotkeys">> & {
  hotkeys?: Partial<HotkeySettings>
}

export const defaultSettings: UserSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  hotkey: "Control+Space",
  hotkeys: {
    launcher: "Control+Space",
    screenshot: "Control+Shift+A",
  },
  themeMode: "system",
  accent: "neutral",
  language: "system",
  floatingBallEnabled: false,
  floatingBallFeatures: ["appLauncher", "screenshot"],
  lanEnabled: false,
  learnFromSearchHistory: true,
}

export function settingsFilePath(userDataDir: string): string {
  return path.join(userDataDir, "settings.json")
}

export function normalizeSettings(raw: unknown): UserSettings {
  const next: UserSettings = { ...defaultSettings, hotkeys: { ...defaultSettings.hotkeys } }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>
    next.hotkeys = normalizeHotkeys(r)
    next.hotkey = next.hotkeys.launcher
    if (
      typeof r.themeMode === "string" &&
      (THEME_MODES as readonly string[]).includes(r.themeMode)
    ) {
      next.themeMode = r.themeMode as ThemeMode
    }
    if (typeof r.accent === "string" && (THEME_ACCENTS as readonly string[]).includes(r.accent)) {
      next.accent = r.accent as ThemeAccent
    }
    if (
      typeof r.language === "string" &&
      (LANGUAGE_MODES as readonly string[]).includes(r.language)
    ) {
      next.language = r.language as LanguageMode
    }
    if (typeof r.floatingBallEnabled === "boolean") {
      next.floatingBallEnabled = r.floatingBallEnabled
    }
    if (Array.isArray(r.floatingBallFeatures)) {
      next.floatingBallFeatures = normalizeFloatingBallFeatures(
        r.floatingBallFeatures,
        typeof r.settingsVersion === "number" ? r.settingsVersion : 1
      )
    }
    if (typeof r.lanEnabled === "boolean") {
      next.lanEnabled = r.lanEnabled
    }
    if (typeof r.learnFromSearchHistory === "boolean") {
      next.learnFromSearchHistory = r.learnFromSearchHistory
    }
  }
  return next
}

function normalizeHotkeys(raw: Record<string, unknown>): HotkeySettings {
  const next: HotkeySettings = { ...defaultSettings.hotkeys }

  if (typeof raw.hotkey === "string" && raw.hotkey.trim()) {
    next.launcher = raw.hotkey.trim()
  }

  if (raw.hotkeys && typeof raw.hotkeys === "object" && !Array.isArray(raw.hotkeys)) {
    const hotkeys = raw.hotkeys as Record<string, unknown>
    if (typeof hotkeys.launcher === "string" && hotkeys.launcher.trim()) {
      next.launcher = hotkeys.launcher.trim()
    }
    if (typeof hotkeys.screenshot === "string" && hotkeys.screenshot.trim()) {
      next.screenshot = hotkeys.screenshot.trim()
    }
  }

  return next
}

function normalizeFloatingBallFeatures(
  raw: unknown[],
  sourceSettingsVersion: number
): FloatingBallFeature[] {
  const seen = new Set<FloatingBallFeature>()
  for (const item of raw) {
    if (typeof item === "string" && isFloatingBallFeature(item) && !seen.has(item)) {
      seen.add(item)
      if (seen.size === MAX_FLOATING_BALL_FEATURES) break
    }
  }
  if (
    sourceSettingsVersion < 2 &&
    seen.has("appLauncher") &&
    !seen.has("screenshot") &&
    seen.size < MAX_FLOATING_BALL_FEATURES
  ) {
    seen.add("screenshot")
  }
  return seen.size > 0 ? [...seen] : [...defaultSettings.floatingBallFeatures]
}

function isFloatingBallFeature(value: string): value is FloatingBallFeature {
  return isBuiltinFloatingBallFeature(value) || isPluginFloatingBallFeature(value)
}

function isBuiltinFloatingBallFeature(value: string): value is BuiltinFloatingBallFeature {
  return (FLOATING_BALL_FEATURES as readonly string[]).includes(value)
}

function isPluginFloatingBallFeature(value: string): value is PluginFloatingBallFeature {
  return /^plugin:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/.test(
    value
  )
}

export async function loadSettings(filePath: string): Promise<UserSettings> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    return normalizeSettings(JSON.parse(raw))
  } catch (err) {
    if (isFileNotFound(err)) return { ...defaultSettings, hotkeys: { ...defaultSettings.hotkeys } }
    if (err instanceof SyntaxError) {
      return { ...defaultSettings, hotkeys: { ...defaultSettings.hotkeys } }
    }
    throw err
  }
}

export async function saveSettings(filePath: string, settings: UserSettings): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, "utf-8")
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}
