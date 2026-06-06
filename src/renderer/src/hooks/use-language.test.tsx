import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LanguageProvider } from "./use-language"

const i18nMock = vi.hoisted(() => {
  const state = { language: "en" }
  return {
    state,
    changeLanguage: vi.fn((locale: string) => {
      state.language = locale
      return Promise.resolve()
    }),
    resolveLanguageMode: vi.fn((language: DeskitLanguageMode) =>
      language === "system" ? "en" : language
    ),
  }
})

vi.mock("@/i18n", () => ({
  default: {
    get language() {
      return i18nMock.state.language
    },
    changeLanguage: i18nMock.changeLanguage,
  },
  resolveLanguageMode: i18nMock.resolveLanguageMode,
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

describe("language provider", () => {
  beforeEach(() => {
    i18nMock.state.language = "en"
    i18nMock.changeLanguage.mockClear()
    i18nMock.resolveLanguageMode.mockClear()
    document.documentElement.lang = ""
  })

  afterEach(() => {
    cleanup()
    delete window.electronAPI
    vi.restoreAllMocks()
  })

  it("applies the persisted language when settings load", async () => {
    installElectronApi(baseSettings({ language: "zh-CN" }))

    render(
      <LanguageProvider>
        <div>content</div>
      </LanguageProvider>
    )

    expect(screen.getByText("content")).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"))
    expect(i18nMock.changeLanguage).toHaveBeenCalledWith("zh-CN")
  })

  it("applies settings broadcasts after the provider is mounted", async () => {
    const { emitSettingsChanged } = installElectronApi(baseSettings({ language: "system" }))

    render(
      <LanguageProvider>
        <div>content</div>
      </LanguageProvider>
    )

    await waitFor(() => expect(document.documentElement.lang).toBe("en"))

    emitSettingsChanged({ language: "zh-CN" })

    expect(document.documentElement.lang).toBe("zh-CN")
    expect(i18nMock.changeLanguage).toHaveBeenCalledWith("zh-CN")
  })

  it("keeps the system language when loading settings fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { api } = installElectronApi()
    api.getSettings.mockRejectedValue(new Error("ipc failed"))

    render(
      <LanguageProvider>
        <div>content</div>
      </LanguageProvider>
    )

    expect(document.documentElement.lang).toBe("en")
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "[deskit] failed to load language setting; using system language",
        expect.any(Error)
      )
    })
  })
})
