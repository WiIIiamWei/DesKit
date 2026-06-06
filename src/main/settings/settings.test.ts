import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  defaultSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
  settingsFilePath,
} from "./settings"

describe("normalizeSettings", () => {
  it("returns defaults for unknown input", () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings)
    expect(normalizeSettings("nope")).toEqual(defaultSettings)
    expect(normalizeSettings({})).toEqual(defaultSettings)
  })

  it("keeps a valid hotkey and trims whitespace", () => {
    expect(normalizeSettings({ hotkey: "  Alt+Space  " })).toEqual({
      ...defaultSettings,
      hotkey: "Alt+Space",
      hotkeys: {
        ...defaultSettings.hotkeys,
        launcher: "Alt+Space",
      },
    })
  })

  it("keeps valid structured hotkeys and trims whitespace", () => {
    expect(
      normalizeSettings({
        hotkeys: {
          launcher: "  Alt+Space  ",
          screenshot: "  Control+Shift+S  ",
        },
      })
    ).toEqual({
      ...defaultSettings,
      hotkey: "Alt+Space",
      hotkeys: {
        launcher: "Alt+Space",
        screenshot: "Control+Shift+S",
      },
    })
  })

  it("lets structured hotkeys override the legacy launcher hotkey", () => {
    expect(
      normalizeSettings({
        hotkey: "Alt+Space",
        hotkeys: { launcher: "Control+Alt+K" },
      })
    ).toEqual({
      ...defaultSettings,
      hotkey: "Control+Alt+K",
      hotkeys: {
        ...defaultSettings.hotkeys,
        launcher: "Control+Alt+K",
      },
    })
  })

  it("falls back to default when hotkey is blank", () => {
    expect(normalizeSettings({ hotkey: "   " })).toEqual(defaultSettings)
  })

  it("keeps defaults for blank structured hotkeys", () => {
    expect(normalizeSettings({ hotkeys: { launcher: " ", screenshot: "" } })).toEqual(
      defaultSettings
    )
  })

  it("strips unknown fields", () => {
    expect(normalizeSettings({ hotkey: "Alt+K", evil: true })).toEqual({
      ...defaultSettings,
      hotkey: "Alt+K",
      hotkeys: {
        ...defaultSettings.hotkeys,
        launcher: "Alt+K",
      },
    })
  })

  it("accepts known theme modes and rejects others", () => {
    expect(normalizeSettings({ themeMode: "dark" })).toEqual({
      ...defaultSettings,
      themeMode: "dark",
    })
    expect(normalizeSettings({ themeMode: "neon" })).toEqual(defaultSettings)
  })

  it("accepts known accents and rejects others", () => {
    expect(normalizeSettings({ accent: "blue" })).toEqual({
      ...defaultSettings,
      accent: "blue",
    })
    expect(normalizeSettings({ accent: "puce" })).toEqual(defaultSettings)
  })

  it("accepts known language modes and rejects others", () => {
    expect(normalizeSettings({ language: "zh-CN" })).toEqual({
      ...defaultSettings,
      language: "zh-CN",
    })
    expect(normalizeSettings({ language: "system" })).toEqual(defaultSettings)
    expect(normalizeSettings({ language: "fr" })).toEqual(defaultSettings)
  })

  it("normalizes floating ball settings", () => {
    expect(
      normalizeSettings({
        floatingBallEnabled: true,
        floatingBallFeatures: [
          "appLauncher",
          "plugin:com.deskit.timestamp:timestamp.convert",
          "floatingBall",
          "appLauncher",
          "plugin:bad",
          42,
        ],
      })
    ).toEqual({
      ...defaultSettings,
      floatingBallEnabled: true,
      floatingBallFeatures: [
        "appLauncher",
        "plugin:com.deskit.timestamp:timestamp.convert",
        "screenshot",
      ],
    })
  })

  it("preserves an explicit post-migration floating ball feature list", () => {
    expect(
      normalizeSettings({
        settingsVersion: 2,
        floatingBallFeatures: ["appLauncher"],
      })
    ).toEqual({
      ...defaultSettings,
      floatingBallFeatures: ["appLauncher"],
    })
  })

  it("normalizes the LAN discovery switch", () => {
    expect(normalizeSettings({ lanEnabled: true })).toEqual({
      ...defaultSettings,
      lanEnabled: true,
    })
    expect(normalizeSettings({ lanEnabled: "yes" })).toEqual(defaultSettings)
  })

  it("keeps a default floating ball feature when the configured list is empty", () => {
    expect(normalizeSettings({ floatingBallFeatures: ["floatingBall"] })).toEqual(defaultSettings)
  })
})

describe("loadSettings / saveSettings", () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-settings-"))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("loads defaults when the file does not exist", async () => {
    const file = settingsFilePath(dir)
    const settings = await loadSettings(file)
    expect(settings).toEqual(defaultSettings)
  })

  it("round-trips through save + load", async () => {
    const file = settingsFilePath(dir)
    const written = {
      ...defaultSettings,
      hotkeys: {
        launcher: "Alt+Shift+P",
        screenshot: "Control+Shift+S",
      },
      hotkey: "Alt+Shift+P",
      themeMode: "dark" as const,
    }
    await saveSettings(file, written)
    const settings = await loadSettings(file)
    expect(settings).toEqual(written)
  })

  it("normalizes a malformed file rather than throwing", async () => {
    const file = settingsFilePath(dir)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{"hotkey": 42}', "utf-8")
    const settings = await loadSettings(file)
    expect(settings).toEqual(defaultSettings)
  })

  it("loads defaults when settings JSON is corrupted", async () => {
    const file = settingsFilePath(dir)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "{not-json", "utf-8")
    const settings = await loadSettings(file)
    expect(settings).toEqual(defaultSettings)
  })
})
