import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FloatingBallPanel } from "./floating-ball-panel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}))

type TestElectronApi = NonNullable<Window["electronAPI"]>
type MenuStateHandler = (expanded: boolean) => void
type FeaturesHandler = (features: DeskitFloatingBallFeature[]) => void
type SettingsChangedHandler = (settings: DeskitUserSettings) => void

interface FloatingBallHarness {
  emitMenuState: MenuStateHandler
  emitFloatingBallFeatures: FeaturesHandler
  emitSettingsChanged: SettingsChangedHandler
}

function baseSettings(features: DeskitFloatingBallFeature[] = []): DeskitUserSettings {
  return {
    hotkey: "Control+Space",
    hotkeys: {
      launcher: "Control+Space",
      screenshot: "Control+Shift+A",
    },
    themeMode: "system",
    accent: "neutral",
    floatingBallEnabled: true,
    floatingBallFeatures: features,
  }
}

function installElectronApi(settings: DeskitUserSettings): FloatingBallHarness {
  let menuStateHandler: MenuStateHandler | null = null
  let featuresHandler: FeaturesHandler | null = null
  let settingsChangedHandler: SettingsChangedHandler | null = null
  const api = {
    getSettings: vi.fn().mockResolvedValue(settings),
    listPlugins: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    openFloatingBallFeature: vi.fn().mockResolvedValue(undefined),
    toggleFloatingBallMenu: vi.fn().mockResolvedValue(undefined),
    startFloatingBallDrag: vi.fn().mockResolvedValue(undefined),
    moveFloatingBallDrag: vi.fn().mockResolvedValue(undefined),
    finishFloatingBallDrag: vi.fn().mockResolvedValue(undefined),
    moveFloatingBallBy: vi.fn().mockResolvedValue(undefined),
    onFloatingBallMenuState: vi.fn((handler: MenuStateHandler) => {
      menuStateHandler = handler
      return () => {
        menuStateHandler = null
      }
    }),
    onFloatingBallFeatures: vi.fn((handler: FeaturesHandler) => {
      featuresHandler = handler
      return () => {
        featuresHandler = null
      }
    }),
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
    emitMenuState: (expanded: boolean) => {
      act(() => menuStateHandler?.(expanded))
    },
    emitFloatingBallFeatures: (features: DeskitFloatingBallFeature[]) => {
      act(() => featuresHandler?.(features))
    },
    emitSettingsChanged: (nextSettings: DeskitUserSettings) => {
      act(() => settingsChangedHandler?.(nextSettings))
    },
  }
}

function renderPanel() {
  render(
    <TooltipProvider>
      <FloatingBallPanel />
    </TooltipProvider>
  )
}

describe("floating ball panel", () => {
  afterEach(() => {
    cleanup()
    delete window.electronAPI
  })

  it("keeps the dedicated floating ball feature event working", () => {
    const api = installElectronApi(baseSettings())
    renderPanel()

    api.emitMenuState(true)
    api.emitFloatingBallFeatures(["appLauncher"])

    expect(screen.getByRole("button", { name: "floatingBall.features.appLauncher" })).toBeVisible()
  })

  it("updates menu features from the full settings broadcast fallback", () => {
    const api = installElectronApi(baseSettings())
    renderPanel()

    api.emitMenuState(true)
    api.emitSettingsChanged(baseSettings(["appLauncher"]))

    expect(screen.getByRole("button", { name: "floatingBall.features.appLauncher" })).toBeVisible()
  })
})
