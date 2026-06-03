import { describe, expect, it } from "vitest"
import { defaultSettings } from "../settings/settings"
import { settingsForSync, settingsFromSync } from "./hotkey-sync"

describe("hotkey sync", () => {
  it("exports macOS Command shortcuts as portable CommandOrControl shortcuts", () => {
    expect(
      settingsForSync({ ...defaultSettings, hotkey: "Command+Shift+K" }, "darwin").hotkey
    ).toBe("CommandOrControl+Shift+K")
  })

  it("imports legacy macOS Command shortcuts as Control shortcuts off macOS", () => {
    expect(
      settingsFromSync({ ...defaultSettings, hotkey: "Command+Shift+K" }, "win32").hotkey
    ).toBe("Control+Shift+K")
  })
})
