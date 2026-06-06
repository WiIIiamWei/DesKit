import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LanguageSettings } from "./language-settings"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

type TestElectronApi = NonNullable<Window["electronAPI"]>
type SettingsChangedHandler = (settings: DeskitUserSettings) => void

function baseSettings(overrides: Partial<DeskitUserSettings> = {}): DeskitUserSettings {
  const hotkeys = overrides.hotkeys ?? {
    launcher: overrides.hotkey ?? "Control+Space",
    screenshot: "Control+Shift+A",
  }
  return {
    hotkey: overrides.hotkey ?? hotkeys.launcher,
    hotkeys,
    themeMode: "system",
    accent: "neutral",
    language: "system",
    floatingBallEnabled: false,
    floatingBallFeatures: [],
    lanEnabled: false,
    learnFromSearchHistory: true,
    ...overrides,
  }
}

function installElectronApi(settings: DeskitUserSettings = baseSettings()) {
  let settingsChangedHandler: SettingsChangedHandler | null = null
  const api = {
    getSettings: vi.fn().mockResolvedValue(settings),
    updateSettings: vi.fn().mockResolvedValue(settings),
    onSettingsChanged: vi.fn((handler: SettingsChangedHandler) => {
      settingsChangedHandler = handler
      return () => {
        settingsChangedHandler = null
      }
    }),
  } satisfies Partial<TestElectronApi>

  window.electronAPI = api as unknown as TestElectronApi
  return {
    api,
    emitSettingsChanged: (nextSettings: Partial<DeskitUserSettings>) => {
      act(() => settingsChangedHandler?.(baseSettings(nextSettings)))
    },
  }
}

describe("language settings", () => {
  afterEach(() => {
    cleanup()
    delete window.electronAPI
    vi.restoreAllMocks()
  })

  it("loads the current language and persists a new selection", async () => {
    const user = userEvent.setup()
    const { api } = installElectronApi(baseSettings({ language: "zh-CN" }))
    api.updateSettings.mockResolvedValue(baseSettings({ language: "en" }))

    render(<LanguageSettings />)

    const select = screen.getByLabelText("language.label")
    await waitFor(() => expect(select).toHaveValue("zh-CN"))

    await user.selectOptions(select, "en")

    expect(api.updateSettings).toHaveBeenCalledWith({ language: "en" })
    await waitFor(() => expect(select).toHaveValue("en"))
  })

  it("updates the selected language when a settings broadcast arrives", async () => {
    const { emitSettingsChanged } = installElectronApi(baseSettings({ language: "system" }))
    render(<LanguageSettings />)

    const select = screen.getByLabelText("language.label")
    await waitFor(() => expect(select).toHaveValue("system"))

    emitSettingsChanged({ language: "zh-CN" })

    expect(select).toHaveValue("zh-CN")
  })

  it("keeps the default selection when loading settings fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { api } = installElectronApi()
    api.getSettings.mockRejectedValue(new Error("ipc failed"))

    render(<LanguageSettings />)

    expect(screen.getByLabelText("language.label")).toHaveValue("system")
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "[deskit] failed to load language setting",
        expect.any(Error)
      )
    })
  })
})
