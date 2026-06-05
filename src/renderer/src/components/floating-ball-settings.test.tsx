import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FloatingBallSettings } from "./floating-ball-settings"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
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
    floatingBallEnabled: false,
    floatingBallFeatures: [],
    lanEnabled: false,
    ...overrides,
  }
}

function installElectronApi(settings: DeskitUserSettings) {
  let settingsChangedHandler: SettingsChangedHandler | null = null
  const api = {
    getSettings: vi.fn().mockResolvedValue(settings),
    listPlugins: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    updateSettings: vi.fn().mockResolvedValue(settings),
    onPluginRegistryChanged: vi.fn(() => () => undefined),
    onSettingsChanged: vi.fn((handler: SettingsChangedHandler) => {
      settingsChangedHandler = handler
      return () => {
        settingsChangedHandler = null
      }
    }),
  } satisfies Partial<TestElectronApi>

  window.electronAPI = api as unknown as TestElectronApi
  return {
    emitSettingsChanged: (nextSettings: DeskitUserSettings) => {
      act(() => settingsChangedHandler?.(nextSettings))
    },
  }
}

describe("floating ball settings", () => {
  afterEach(() => {
    cleanup()
    delete window.electronAPI
  })

  it("syncs enabled state and menu features from settings broadcasts", async () => {
    const api = installElectronApi(baseSettings())
    render(<FloatingBallSettings />)

    const enabledSwitch = await screen.findByRole("switch", {
      name: "floatingBall.settings.enable",
    })
    expect(enabledSwitch).not.toBeChecked()

    api.emitSettingsChanged(
      baseSettings({
        floatingBallEnabled: true,
        floatingBallFeatures: ["appLauncher"],
      })
    )

    expect(enabledSwitch).toBeChecked()
    expect(screen.getByText("floatingBall.features.appLauncher")).toBeVisible()
    expect(screen.getByText("floatingBall.settings.builtinFeature")).toBeVisible()
  })
})
