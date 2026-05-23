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
    expect(normalizeSettings({ hotkey: "  Alt+Space  " })).toEqual({ hotkey: "Alt+Space" })
  })

  it("falls back to default when hotkey is blank", () => {
    expect(normalizeSettings({ hotkey: "   " })).toEqual(defaultSettings)
  })

  it("strips unknown fields", () => {
    expect(normalizeSettings({ hotkey: "Alt+K", evil: true })).toEqual({ hotkey: "Alt+K" })
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
    await saveSettings(file, { hotkey: "Alt+Shift+P" })
    const settings = await loadSettings(file)
    expect(settings).toEqual({ hotkey: "Alt+Shift+P" })
  })

  it("normalizes a malformed file rather than throwing", async () => {
    const file = settingsFilePath(dir)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{"hotkey": 42}', "utf-8")
    const settings = await loadSettings(file)
    expect(settings).toEqual(defaultSettings)
  })
})
