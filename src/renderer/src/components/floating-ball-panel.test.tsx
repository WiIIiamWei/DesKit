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

type TestElectronApi = NonNullable<Window["electronAPI"]>
type MenuStateHandler = (expanded: boolean) => void
type WindowStateHandler = (state: {
  phase: "collapsed" | "expanding" | "expanded" | "collapsing"
  expandedSize: number
}) => void
type FeaturesHandler = (features: DeskitFloatingBallFeature[]) => void
type SettingsChangedHandler = (settings: DeskitUserSettings) => void

interface FloatingBallHarness {
  api: Partial<TestElectronApi>
  emitMenuState: MenuStateHandler
  emitWindowState: WindowStateHandler
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
  let windowStateHandler: WindowStateHandler | null = null
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
    finishFloatingBallExpandPreparation: vi.fn().mockResolvedValue(undefined),
    finishFloatingBallCollapseTransition: vi.fn().mockResolvedValue(undefined),
    moveFloatingBallBy: vi.fn().mockResolvedValue(undefined),
    onFloatingBallMenuState: vi.fn((handler: MenuStateHandler) => {
      menuStateHandler = handler
      return () => {
        menuStateHandler = null
      }
    }),
    onFloatingBallWindowState: vi.fn((handler: WindowStateHandler) => {
      windowStateHandler = handler
      return () => {
        windowStateHandler = null
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
    api,
    emitMenuState: (expanded: boolean) => {
      act(() => menuStateHandler?.(expanded))
    },
    emitWindowState: (state: {
      phase: "collapsed" | "expanding" | "expanded" | "collapsing"
      expandedSize: number
    }) => {
      act(() => windowStateHandler?.(state))
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
    vi.unstubAllGlobals()
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

  it("finishes a drag once when pointer up releases capture and suppresses the next click", () => {
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

  it("notifies main after applying the expanding window state", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    const { api, emitWindowState } = installElectronApi(baseSettings())
    renderPanel()

    emitWindowState({ phase: "expanding", expandedSize: 240 })

    expect(api.finishFloatingBallExpandPreparation).toHaveBeenCalledTimes(1)
  })

  it("notifies main after the collapsing menu transition ends", () => {
    const { api, emitMenuState, emitWindowState } = installElectronApi(
      baseSettings(["appLauncher"])
    )
    renderPanel()
    emitWindowState({ phase: "expanded", expandedSize: 240 })
    emitMenuState(true)
    const menu = document.querySelector('[data-floating-ball-menu="true"]')
    if (!(menu instanceof HTMLElement)) throw new Error("Expected floating ball menu")

    emitWindowState({ phase: "collapsing", expandedSize: 240 })
    emitMenuState(false)
    fireEvent.transitionEnd(menu, { propertyName: "opacity" })

    expect(api.finishFloatingBallCollapseTransition).toHaveBeenCalledTimes(1)
  })
})
