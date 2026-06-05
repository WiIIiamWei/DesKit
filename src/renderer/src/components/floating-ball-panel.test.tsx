import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FloatingBallPanel } from "./floating-ball-panel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}))

type TestElectronApi = NonNullable<Window["electronAPI"]> & {
  notifyFloatingBallMenuPainted: (expanded: boolean) => void
}
type MenuStateHandler = (expanded: boolean) => void
type FeaturesHandler = (features: DeskitFloatingBallFeature[]) => void
type SettingsChangedHandler = (settings: DeskitUserSettings) => void

interface FloatingBallHarness {
  api: Partial<TestElectronApi>
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
    lanEnabled: false,
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
    notifyFloatingBallMenuPainted: vi.fn(),
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
    api,
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

function installPointerCapture(button: HTMLElement) {
  let captured = false
  const pointerCapture = {
    setPointerCapture: vi.fn(() => {
      captured = true
    }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture: vi.fn((pointerId: number) => {
      captured = false
      const event = createEvent.lostPointerCapture(button)
      Object.defineProperty(event, "pointerId", { value: pointerId })
      fireEvent(button, event)
    }),
  }
  Object.assign(button, pointerCapture)
  return pointerCapture
}

function firePointerEvent(
  target: HTMLElement,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  init: { button?: number; pointerId: number; screenX: number; screenY: number }
) {
  const event = createEvent[type](target)
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    pointerId: { value: init.pointerId },
    screenX: { value: init.screenX },
    screenY: { value: init.screenY },
  })
  fireEvent(target, event)
}

describe("floating ball panel", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.location.hash = ""
    delete window.electronAPI
  })

  it("renders only the draggable ball in the collapsed hit area view", () => {
    window.location.hash = "#floating-ball"
    const api = installElectronApi(baseSettings(["appLauncher"]))
    renderPanel()

    api.emitMenuState(true)

    expect(screen.getByRole("button", { name: "floatingBall.title" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "floatingBall.features.appLauncher" })
    ).not.toBeInTheDocument()
  })

  it("renders only menu actions in the menu interaction view", () => {
    window.location.hash = "#floating-ball-menu"
    const api = installElectronApi(baseSettings())
    renderPanel()

    api.emitMenuState(true)
    api.emitFloatingBallFeatures(["appLauncher"])

    expect(screen.getByRole("button", { name: "floatingBall.features.appLauncher" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "floatingBall.title" })).not.toBeInTheDocument()
  })

  it("notifies main after the menu interaction view paints the open state", () => {
    vi.useFakeTimers()
    window.location.hash = "#floating-ball-menu"
    const api = installElectronApi(baseSettings(["appLauncher"]))
    renderPanel()

    api.emitMenuState(true)
    act(() => {
      vi.advanceTimersByTime(32)
    })

    expect(api.api.notifyFloatingBallMenuPainted).toHaveBeenCalledWith(true)
  })

  it("keeps menu actions hidden until main opens the menu interaction view", () => {
    window.location.hash = "#floating-ball-menu"
    installElectronApi(baseSettings(["appLauncher"]))
    renderPanel()

    expect(
      screen.queryByRole("button", { name: "floatingBall.features.appLauncher" })
    ).not.toBeInTheDocument()
  })

  it("updates menu features from the full settings broadcast fallback", () => {
    window.location.hash = "#floating-ball-menu"
    const api = installElectronApi(baseSettings())
    renderPanel()

    api.emitMenuState(true)
    api.emitSettingsChanged(baseSettings(["appLauncher"]))

    expect(screen.getByRole("button", { name: "floatingBall.features.appLauncher" })).toBeVisible()
  })

  it("finishes a drag once when pointer up releases capture and suppresses the next click", () => {
    window.location.hash = "#floating-ball"
    const { api } = installElectronApi(baseSettings())
    renderPanel()
    const ball = screen.getByRole("button", { name: "floatingBall.title" })
    const pointerCapture = installPointerCapture(ball)

    firePointerEvent(ball, "pointerDown", { button: 0, pointerId: 1, screenX: 10, screenY: 10 })
    firePointerEvent(ball, "pointerMove", { pointerId: 1, screenX: 20, screenY: 10 })
    firePointerEvent(ball, "pointerUp", { pointerId: 1, screenX: 20, screenY: 10 })
    fireEvent.click(ball)

    expect(api.startFloatingBallDrag).toHaveBeenCalledTimes(1)
    expect(api.moveFloatingBallDrag).toHaveBeenCalledTimes(1)
    expect(api.finishFloatingBallDrag).toHaveBeenCalledTimes(1)
    expect(api.toggleFloatingBallMenu).not.toHaveBeenCalled()
    expect(pointerCapture.releasePointerCapture).toHaveBeenCalledTimes(1)
  })

  it("opens the floating ball menu after a click without dragging", () => {
    window.location.hash = "#floating-ball"
    const { api } = installElectronApi(baseSettings())
    renderPanel()
    const ball = screen.getByRole("button", { name: "floatingBall.title" })
    installPointerCapture(ball)

    firePointerEvent(ball, "pointerDown", { button: 0, pointerId: 1, screenX: 10, screenY: 10 })
    firePointerEvent(ball, "pointerUp", { pointerId: 1, screenX: 10, screenY: 10 })
    fireEvent.click(ball)

    expect(api.startFloatingBallDrag).toHaveBeenCalledTimes(1)
    expect(api.moveFloatingBallDrag).not.toHaveBeenCalled()
    expect(api.finishFloatingBallDrag).toHaveBeenCalledTimes(1)
    expect(api.toggleFloatingBallMenu).toHaveBeenCalledTimes(1)
  })

  it("hides menu actions in the menu interaction view after the menu closes", () => {
    window.location.hash = "#floating-ball-menu"
    const { emitMenuState } = installElectronApi(baseSettings(["appLauncher"]))
    renderPanel()
    emitMenuState(true)

    const item = screen.getByRole("button", { name: "floatingBall.features.appLauncher" })
    expect(item).toBeVisible()

    emitMenuState(false)

    expect(
      screen.queryByRole("button", { name: "floatingBall.features.appLauncher" })
    ).not.toBeInTheDocument()
  })
})
