import type { BrowserWindow as ElectronBrowserWindow } from "electron"
import type { Mock } from "vitest"
import type { FloatingBallWindowDeps } from "./floating-ball-window"
import { BrowserWindow, Menu, screen } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  BALL_SIZE,
  clampBoundsToWorkArea,
  COLLAPSED_WINDOW_SIZE,
  collapseFloatingBallMenu,
  destroyFloatingBallWindow,
  ensureFloatingBallWindow,
  EXPANDED_WINDOW_SIZE,
  expandFloatingBallMenu,
  finishFloatingBallDrag,
  getCollapsedFloatingBallBounds,
  getExpandedFloatingBallBounds,
  getFloatingBallSnappedEdge,
  getFloatingBallVisualCenter,
  markFloatingBallMenuPainted,
  moveFloatingBallBy,
  moveFloatingBallDrag,
  openFloatingBallFeature,
  showFloatingBallWindow,
  startFloatingBallDrag,
} from "./floating-ball-window"
import { defaultSettings } from "./settings/settings"

type MockBrowserWindow = ElectronBrowserWindow & {
  getBounds: Mock
  setBounds: Mock
  setOpacity: Mock
  setIgnoreMouseEvents: Mock
  setFocusable: Mock
  hide: Mock
  showInactive: Mock
  focus: Mock
  isFocused: Mock
  moveTop: Mock
  setParentWindow: Mock
  webContents: ElectronBrowserWindow["webContents"] & {
    send: Mock
  }
}

const deps: FloatingBallWindowDeps = {
  rendererDevUrl: undefined,
  appOrigin: "app://app",
  getSettings: () => ({
    ...defaultSettings,
    floatingBallEnabled: true,
    floatingBallFeatures: ["appLauncher"],
  }),
  getLocale: () => "en-US",
  onOpenFeature: vi.fn(),
  onDisable: vi.fn(),
}

function latestWindow(): MockBrowserWindow {
  const results = vi.mocked(BrowserWindow).mock.results as unknown as {
    value: MockBrowserWindow
  }[]
  const win = results[results.length - 1]?.value
  if (!win) throw new Error("Expected a BrowserWindow to be created")
  return win
}

function createdWindows(): MockBrowserWindow[] {
  return (
    vi.mocked(BrowserWindow).mock.results as unknown as {
      value: MockBrowserWindow
    }[]
  ).map((result) => result.value)
}

function hasBoundsCall(win: MockBrowserWindow, bounds: Electron.Rectangle): boolean {
  return win.setBounds.mock.calls.some(([actual]) => {
    const value = actual as Electron.Rectangle
    return (
      value.x === bounds.x &&
      value.y === bounds.y &&
      value.width === bounds.width &&
      value.height === bounds.height
    )
  })
}

function installMacosParentMoveBoundsMock({
  child,
  parent,
  childBounds,
  parentBounds,
}: {
  child: MockBrowserWindow
  parent: MockBrowserWindow
  childBounds: Electron.Rectangle
  parentBounds: Electron.Rectangle
}): { childBounds: Electron.Rectangle; parentBounds: Electron.Rectangle } {
  const state = {
    childBounds: { ...childBounds },
    parentBounds: { ...parentBounds },
  }

  child.getBounds.mockImplementation(() => state.childBounds)
  child.setBounds.mockImplementation((bounds: Electron.Rectangle) => {
    state.childBounds = { ...bounds }
  })
  parent.getBounds.mockImplementation(() => state.parentBounds)
  parent.setBounds.mockImplementation((bounds: Electron.Rectangle) => {
    const deltaX = bounds.x - state.parentBounds.x
    const deltaY = bounds.y - state.parentBounds.y
    state.parentBounds = { ...bounds }
    state.childBounds = {
      ...state.childBounds,
      x: state.childBounds.x + deltaX,
      y: state.childBounds.y + deltaY,
    }
  })

  return state
}

describe("floating ball bounds helpers", () => {
  it("calculates the visual center from the current window bounds", () => {
    expect(getFloatingBallVisualCenter({ x: 100, y: 200, width: 72, height: 72 })).toEqual({
      x: 136,
      y: 236,
    })
  })

  it("builds collapsed bounds from the visual center", () => {
    expect(getCollapsedFloatingBallBounds({ x: 300, y: 420 })).toEqual({
      x: 264,
      y: 384,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("builds expanded bounds from the visual center", () => {
    expect(getExpandedFloatingBallBounds({ x: 300, y: 420 })).toEqual({
      x: 300 - EXPANDED_WINDOW_SIZE / 2,
      y: 420 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
  })

  it("clamps a full window inside the work area", () => {
    expect(
      clampBoundsToWorkArea(
        { x: 1330, y: -50, width: 240, height: 240 },
        { x: 0, y: 0, width: 1440, height: 900 }
      )
    ).toEqual({
      x: 1200,
      y: 0,
      width: 240,
      height: 240,
    })
  })
})

describe("floating ball window dragging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(screen.getPrimaryDisplay).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    } as Electron.Display)
    vi.mocked(screen.getDisplayMatching).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    } as Electron.Display)
  })

  afterEach(() => {
    vi.useRealTimers()
    destroyFloatingBallWindow()
  })

  it("creates the floating window with the collapsed hit area size", () => {
    ensureFloatingBallWindow(deps)

    expect(vi.mocked(BrowserWindow)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        width: COLLAPSED_WINDOW_SIZE,
        height: COLLAPSED_WINDOW_SIZE,
      })
    )
  })

  it("places the collapsed window at the default right edge position", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()

    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - COLLAPSED_WINDOW_SIZE - 24,
      y: 900 / 2 - COLLAPSED_WINDOW_SIZE / 2,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("moves from the OS cursor drag origin and keeps the floating window size fixed", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 1100, y: 410, width: 500, height: 500 })
    win.setBounds.mockClear()
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 1000, y: 500 })
      .mockReturnValueOnce({ x: 970, y: 530 })

    startFloatingBallDrag()
    moveFloatingBallDrag()

    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 1070,
      y: 440,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("moves by renderer delta with the collapsed hit area size", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 1100, y: 410, width: 500, height: 500 })
    win.setBounds.mockClear()

    moveFloatingBallBy({ x: 12.4, y: -8.6 })

    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 1112,
      y: 401,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("snaps to the left edge after a drag release near the left work area edge", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 100, y: 410, width: 72, height: 72 })
    win.setBounds.mockClear()
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 120, y: 430 })
      .mockReturnValueOnce({ x: 40, y: 430 })

    startFloatingBallDrag()
    moveFloatingBallDrag()
    win.getBounds.mockReturnValue({ x: 20, y: 410, width: 72, height: 72 })
    finishFloatingBallDrag()

    expect(getFloatingBallSnappedEdge()).toBe("left")
    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: -(BALL_SIZE / 2) - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("snaps to the right edge after a drag release near the right work area edge", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 1250, y: 410, width: 72, height: 72 })
    win.setBounds.mockClear()
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 1270, y: 430 })
      .mockReturnValueOnce({ x: 1370, y: 430 })

    startFloatingBallDrag()
    moveFloatingBallDrag()
    win.getBounds.mockReturnValue({ x: 1350, y: 410, width: 72, height: 72 })
    finishFloatingBallDrag()

    expect(getFloatingBallSnappedEdge()).toBe("right")
    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - BALL_SIZE / 2 - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("does not snap after a drag release away from both work area edges", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 500, y: 410, width: 72, height: 72 })
    win.setBounds.mockClear()
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 520, y: 430 })
      .mockReturnValueOnce({ x: 620, y: 430 })

    startFloatingBallDrag()
    moveFloatingBallDrag()
    win.setBounds.mockClear()
    win.getBounds.mockReturnValue({ x: 600, y: 410, width: 72, height: 72 })
    finishFloatingBallDrag()

    expect(getFloatingBallSnappedEdge()).toBe("none")
    expect(win.setBounds).not.toHaveBeenCalled()
  })

  it("does not snap a click near the work area edge", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 20, y: 410, width: 72, height: 72 })
    win.setBounds.mockClear()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValueOnce({ x: 40, y: 430 })

    startFloatingBallDrag()
    finishFloatingBallDrag()

    expect(win.setBounds).not.toHaveBeenCalled()
  })

  it("keeps the collapsed hit area stable while making the menu interaction area available", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    ballWindow.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(ballWindow.setBounds).not.toHaveBeenCalledWith(
      expect.objectContaining({
        width: EXPANDED_WINDOW_SIZE,
        height: EXPANDED_WINDOW_SIZE,
      })
    )
    expect(
      createdWindows().some((win) =>
        hasBoundsCall(win, {
          x: 640 - EXPANDED_WINDOW_SIZE / 2,
          y: 450 - EXPANDED_WINDOW_SIZE / 2,
          width: EXPANDED_WINDOW_SIZE,
          height: EXPANDED_WINDOW_SIZE,
        })
      )
    ).toBe(true)
  })

  it("does not reapply unchanged bounds when reopening the menu at the same position", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    const menuBounds = {
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    }
    menuWindow.getBounds.mockReturnValue(menuBounds)
    collapseFloatingBallMenu()

    ballWindow.getBounds.mockReturnValue({
      x: 604,
      y: 414,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    menuWindow.getBounds.mockReturnValue(menuBounds)
    ballWindow.setBounds.mockClear()
    menuWindow.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(ballWindow.setBounds).not.toHaveBeenCalled()
    expect(menuWindow.setBounds).not.toHaveBeenCalled()
  })

  it("does not drift when Windows reports normalized bounds after opening the menu", () => {
    showFloatingBallWindow(deps)
    const [ballWindow, menuWindow] = createdWindows()
    let ballActualBounds = {
      x: 1440 - COLLAPSED_WINDOW_SIZE - 24,
      y: 900 / 2 - COLLAPSED_WINDOW_SIZE / 2,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    }
    let menuActualBounds = {
      x: 0,
      y: 0,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    }
    ballWindow.getBounds.mockImplementation(() => ballActualBounds)
    menuWindow.getBounds.mockImplementation(() => menuActualBounds)
    ballWindow.setBounds.mockImplementation((bounds: Electron.Rectangle) => {
      ballActualBounds = { ...bounds }
    })
    menuWindow.setBounds.mockImplementation((bounds: Electron.Rectangle) => {
      menuActualBounds = { ...bounds }
    })

    moveFloatingBallBy({ x: 604 - ballActualBounds.x, y: 0 })
    ballWindow.setBounds.mockClear()
    menuWindow.setBounds.mockClear()
    menuWindow.setBounds.mockImplementation((bounds: Electron.Rectangle) => {
      menuActualBounds = { ...bounds, x: bounds.x - 1, y: bounds.y - 1 }
    })

    expandFloatingBallMenu()
    collapseFloatingBallMenu()
    expandFloatingBallMenu()
    collapseFloatingBallMenu()

    expect(ballWindow.setBounds).not.toHaveBeenCalled()
    expect(menuWindow.setBounds.mock.calls.map(([bounds]) => bounds)).toEqual([
      {
        x: 640 - EXPANDED_WINDOW_SIZE / 2,
        y: 450 - EXPANDED_WINDOW_SIZE / 2,
        width: EXPANDED_WINDOW_SIZE,
        height: EXPANDED_WINDOW_SIZE,
      },
    ])
  })

  it("keeps the ball window above the menu window after opening the menu", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    ballWindow.moveTop.mockClear()

    expandFloatingBallMenu()
    const menuWindow = latestWindow()

    expect(menuWindow.showInactive).toHaveBeenCalledTimes(1)
    expect(ballWindow.moveTop).toHaveBeenCalledTimes(1)
    expect(ballWindow.moveTop.mock.invocationCallOrder[0]).toBeGreaterThan(
      menuWindow.showInactive.mock.invocationCallOrder[0]
    )
  })

  it("parents the ball window to the resident menu window before showing the ball", () => {
    showFloatingBallWindow(deps)
    const [ballWindow, menuWindow] = createdWindows()

    expect(ballWindow.setParentWindow).toHaveBeenCalledWith(menuWindow)
    expect(ballWindow.setParentWindow.mock.invocationCallOrder[0]).toBeLessThan(
      ballWindow.showInactive.mock.invocationCallOrder[0]
    )
  })

  it("keeps the ball parent relationship stable when opening and closing the menu", () => {
    showFloatingBallWindow(deps)
    const [ballWindow] = createdWindows()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    ballWindow.setParentWindow.mockClear()

    expandFloatingBallMenu()
    collapseFloatingBallMenu()

    expect(ballWindow.setParentWindow).not.toHaveBeenCalled()
  })

  it("shows and restacks the transparent menu before broadcasting the open state", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    const menuStateSendIndex = menuWindow.webContents.send.mock.calls.findIndex(
      ([channel, expanded]) => channel === "floating-ball:menu-state" && expanded === true
    )
    const menuStateSendOrder =
      menuWindow.webContents.send.mock.invocationCallOrder[menuStateSendIndex]

    const revealPreparationOrder = menuWindow.setOpacity.mock.invocationCallOrder.at(-1) ?? 0

    expect(menuWindow.setBounds.mock.invocationCallOrder[0]).toBeLessThan(revealPreparationOrder)
    expect(menuWindow.setOpacity).toHaveBeenCalledWith(0)
    expect(revealPreparationOrder).toBeLessThan(menuWindow.showInactive.mock.invocationCallOrder[0])
    expect(menuWindow.showInactive.mock.invocationCallOrder[0]).toBeLessThan(
      ballWindow.moveTop.mock.invocationCallOrder[0]
    )
    expect(ballWindow.moveTop.mock.invocationCallOrder[0]).toBeLessThan(menuStateSendOrder)
  })

  it("keeps the collapsed menu window resident but transparent and mouse-transparent", () => {
    showFloatingBallWindow(deps)
    const [, menuWindow] = createdWindows()

    expect(menuWindow.showInactive).toHaveBeenCalledTimes(1)
    expect(menuWindow.setOpacity).toHaveBeenLastCalledWith(0)
    expect(menuWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
    expect(menuWindow.setFocusable).toHaveBeenLastCalledWith(false)
    expect(menuWindow.hide).not.toHaveBeenCalled()
  })

  it("waits for the menu renderer paint acknowledgement before revealing interactions", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()

    expect(menuWindow.setOpacity).not.toHaveBeenCalledWith(1)
    expect(menuWindow.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false)
    expect(menuWindow.setFocusable).not.toHaveBeenCalledWith(true)
  })

  it("keeps the menu open when the ball window blurs during resident menu reveal", () => {
    vi.useFakeTimers()
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    menuWindow.setOpacity.mockClear()

    ballWindow.emit("blur")
    vi.runOnlyPendingTimers()

    expect(ballWindow.webContents.send).not.toHaveBeenLastCalledWith(
      "floating-ball:menu-state",
      false
    )
    expect(menuWindow.setOpacity).not.toHaveBeenCalledWith(0)
  })

  it("reveals the resident menu window after the menu renderer paints the open state", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.setOpacity.mockClear()
    menuWindow.setIgnoreMouseEvents.mockClear()
    menuWindow.setFocusable.mockClear()

    markFloatingBallMenuPainted(menuWindow.webContents, true)

    expect(menuWindow.setOpacity).toHaveBeenCalledWith(1)
    expect(menuWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(menuWindow.setFocusable).toHaveBeenCalledWith(true)
  })

  it("focuses the resident menu window after revealing it so outside clicks can blur it", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.focus.mockClear()

    markFloatingBallMenuPainted(menuWindow.webContents, true)

    expect(menuWindow.focus).toHaveBeenCalledTimes(1)
  })

  it("keeps the menu open when the ball window blurs immediately after resident menu reveal", () => {
    vi.useFakeTimers()
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    markFloatingBallMenuPainted(menuWindow.webContents, true)
    menuWindow.setOpacity.mockClear()

    ballWindow.emit("blur")
    vi.runOnlyPendingTimers()

    expect(ballWindow.webContents.send).not.toHaveBeenLastCalledWith(
      "floating-ball:menu-state",
      false
    )
    expect(menuWindow.setOpacity).not.toHaveBeenCalledWith(0)
  })

  it("keeps a left-snapped ball on the original display when opening beside another display", () => {
    const leftDisplay = {
      id: 1,
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    } as Electron.Display
    const rightDisplay = {
      id: 2,
      workArea: { x: 1440, y: 0, width: 1440, height: 900 },
    } as Electron.Display
    vi.mocked(screen.getPrimaryDisplay).mockReturnValue(leftDisplay)
    vi.mocked(screen.getDisplayMatching).mockImplementation((bounds: Electron.Rectangle) =>
      bounds.x < 0 ? rightDisplay : leftDisplay
    )

    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 120, y: 430 })
      .mockReturnValueOnce({ x: 40, y: 430 })
    ballWindow.getBounds.mockReturnValue({ x: 100, y: 410, width: 72, height: 72 })

    startFloatingBallDrag()
    moveFloatingBallDrag()
    ballWindow.getBounds.mockReturnValue({ x: 20, y: 410, width: 72, height: 72 })
    finishFloatingBallDrag()
    ballWindow.getBounds.mockReturnValue({
      x: -(BALL_SIZE / 2) - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    ballWindow.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    expect(
      createdWindows().some((win) =>
        hasBoundsCall(win, {
          x: 0,
          y: 446 - EXPANDED_WINDOW_SIZE / 2,
          width: EXPANDED_WINDOW_SIZE,
          height: EXPANDED_WINDOW_SIZE,
        })
      )
    ).toBe(true)
  })

  it("does not restack the ball window when the menu takes focus", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    ballWindow.moveTop.mockClear()

    menuWindow.emit("focus")

    expect(ballWindow.moveTop).not.toHaveBeenCalled()
  })

  it("focuses and restacks the ball window when starting a drag with the menu expanded", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    ballWindow.focus.mockClear()
    ballWindow.moveTop.mockClear()

    startFloatingBallDrag()

    expect(ballWindow.focus).toHaveBeenCalledTimes(1)
    expect(ballWindow.moveTop).toHaveBeenCalledTimes(1)
  })

  it("keeps the ball window above the menu window while dragging the expanded menu", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 640, y: 450 })
      .mockReturnValueOnce({ x: 700, y: 480 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    ballWindow.moveTop.mockClear()

    startFloatingBallDrag()
    ballWindow.moveTop.mockClear()
    moveFloatingBallDrag()

    expect(ballWindow.moveTop).toHaveBeenCalledTimes(1)
    expect(ballWindow.moveTop.mock.invocationCallOrder[0]).toBeGreaterThan(
      ballWindow.setBounds.mock.invocationCallOrder.at(-1) ?? 0
    )
  })

  it("removes the menu interaction area after closing without resizing the collapsed hit area", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    ballWindow.setBounds.mockClear()

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    ballWindow.getBounds.mockReturnValue({
      x: 604,
      y: 414,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    ballWindow.setBounds.mockClear()
    menuWindow.setOpacity.mockClear()
    menuWindow.setIgnoreMouseEvents.mockClear()
    menuWindow.setFocusable.mockClear()
    collapseFloatingBallMenu()

    expect(ballWindow.setBounds).not.toHaveBeenCalled()
    expect(menuWindow.hide).not.toHaveBeenCalled()
    expect(menuWindow.setOpacity).toHaveBeenCalledWith(0)
    expect(menuWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(menuWindow.setFocusable).toHaveBeenCalledWith(false)
  })

  it("moves a snapped collapsed hit area to the centered menu position while opening inside the primary work area", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    const snappedBounds = {
      x: -(BALL_SIZE / 2) - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    }
    ballWindow.getBounds.mockReturnValue(snappedBounds)
    ballWindow.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    expect(
      createdWindows().some((win) =>
        hasBoundsCall(win, {
          x: 0,
          y: 446 - EXPANDED_WINDOW_SIZE / 2,
          width: EXPANDED_WINDOW_SIZE,
          height: EXPANDED_WINDOW_SIZE,
        })
      )
    ).toBe(true)
  })

  it("clamps the menu interaction area inside the primary work area when opening near the edge", () => {
    vi.mocked(screen.getDisplayMatching).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    } as Electron.Display)

    ensureFloatingBallWindow(deps)

    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({
      x: 1344,
      y: 414,
      width: 72,
      height: 72,
    })

    ballWindow.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 414,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })

    expect(
      createdWindows().some((win) =>
        hasBoundsCall(win, {
          x: 1440 - EXPANDED_WINDOW_SIZE,
          y: 450 - EXPANDED_WINDOW_SIZE / 2,
          width: EXPANDED_WINDOW_SIZE,
          height: EXPANDED_WINDOW_SIZE,
        })
      )
    ).toBe(true)
  })

  it("keeps the ball centered on macOS when the parent menu moves during expand", () => {
    vi.mocked(screen.getDisplayMatching).mockReturnValue({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    } as Electron.Display)
    showFloatingBallWindow(deps)
    const [ballWindow, menuWindow] = createdWindows()
    const windowBounds = installMacosParentMoveBoundsMock({
      child: ballWindow,
      parent: menuWindow,
      childBounds: {
        x: 1344,
        y: 414,
        width: COLLAPSED_WINDOW_SIZE,
        height: COLLAPSED_WINDOW_SIZE,
      },
      parentBounds: {
        x: 0,
        y: 0,
        width: EXPANDED_WINDOW_SIZE,
        height: EXPANDED_WINDOW_SIZE,
      },
    })
    ballWindow.setBounds.mockClear()
    menuWindow.setBounds.mockClear()

    expandFloatingBallMenu()

    const expectedMenuBounds = {
      x: 1440 - EXPANDED_WINDOW_SIZE,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    }
    const expectedBallBounds = {
      x: 1440 - EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 414,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    }
    expect(menuWindow.setBounds).toHaveBeenCalledWith(expectedMenuBounds)
    expect(ballWindow.setBounds).toHaveBeenLastCalledWith(expectedBallBounds)
    expect(windowBounds.childBounds).toEqual(expectedBallBounds)
  })

  it("closes the menu interaction area without changing the collapsed hit area", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 1344, y: 414, width: 72, height: 72 })
    ballWindow.setBounds.mockClear()

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 1440 - EXPANDED_WINDOW_SIZE,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    ballWindow.getBounds.mockReturnValue({
      x: 1440 - EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 414,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    ballWindow.setBounds.mockClear()
    ballWindow.webContents.send.mockClear()
    menuWindow.setOpacity.mockClear()
    menuWindow.setIgnoreMouseEvents.mockClear()
    menuWindow.setFocusable.mockClear()

    collapseFloatingBallMenu()

    expect(ballWindow.webContents.send).toHaveBeenLastCalledWith("floating-ball:menu-state", false)
    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - BALL_SIZE / 2 - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 414,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    expect(menuWindow.hide).not.toHaveBeenCalled()
    expect(menuWindow.setOpacity).toHaveBeenCalledWith(0)
    expect(menuWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(menuWindow.setFocusable).toHaveBeenCalledWith(false)
  })

  it("replays the open menu state when the menu renderer finishes loading", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })

    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.webContents.send.mockClear()

    menuWindow.webContents.emit("did-finish-load")

    expect(menuWindow.webContents.send).toHaveBeenCalledWith("floating-ball:menu-state", true)
  })

  it("keeps the menu open when the ball window blurs to the menu window", () => {
    vi.useFakeTimers()
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    menuWindow.hide.mockClear()
    menuWindow.isFocused.mockReturnValue(true)

    ballWindow.emit("blur")
    vi.runOnlyPendingTimers()

    expect(menuWindow.hide).not.toHaveBeenCalled()
    expect(ballWindow.webContents.send).not.toHaveBeenLastCalledWith(
      "floating-ball:menu-state",
      false
    )
  })

  it("keeps the menu open when the menu window blurs to the ball window", () => {
    vi.useFakeTimers()
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    menuWindow.hide.mockClear()
    ballWindow.isFocused.mockReturnValue(true)

    menuWindow.emit("blur")
    vi.runOnlyPendingTimers()

    expect(menuWindow.hide).not.toHaveBeenCalled()
    expect(ballWindow.webContents.send).not.toHaveBeenLastCalledWith(
      "floating-ball:menu-state",
      false
    )
  })

  it("closes the menu after blur when focus leaves both floating ball windows", () => {
    vi.useFakeTimers()
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    markFloatingBallMenuPainted(menuWindow.webContents, true)
    vi.runOnlyPendingTimers()
    menuWindow.hide.mockClear()
    menuWindow.setOpacity.mockClear()
    menuWindow.setIgnoreMouseEvents.mockClear()
    menuWindow.setFocusable.mockClear()

    menuWindow.emit("blur")
    expect(menuWindow.hide).not.toHaveBeenCalled()

    vi.runOnlyPendingTimers()

    expect(menuWindow.hide).not.toHaveBeenCalled()
    expect(menuWindow.setOpacity).toHaveBeenCalledWith(0)
    expect(menuWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(menuWindow.setFocusable).toHaveBeenCalledWith(false)
    expect(ballWindow.webContents.send).toHaveBeenLastCalledWith("floating-ball:menu-state", false)
  })

  it("runs a clicked menu feature before closing the menu", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 640 - EXPANDED_WINDOW_SIZE / 2,
      y: 450 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    menuWindow.hide.mockClear()
    menuWindow.setOpacity.mockClear()
    menuWindow.setIgnoreMouseEvents.mockClear()
    menuWindow.setFocusable.mockClear()

    openFloatingBallFeature("appLauncher")

    expect(deps.onOpenFeature).toHaveBeenCalledWith("appLauncher")
    expect(menuWindow.hide).not.toHaveBeenCalled()
    expect(menuWindow.setOpacity).toHaveBeenCalledWith(0)
    expect(menuWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(menuWindow.setFocusable).toHaveBeenCalledWith(false)
    expect(ballWindow.webContents.send).toHaveBeenLastCalledWith("floating-ball:menu-state", false)
  })

  it("opens the floating ball context menu from the expanded menu window", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    vi.mocked(Menu.buildFromTemplate).mockClear()

    menuWindow.webContents.emit("context-menu")

    expect(Menu.buildFromTemplate).toHaveBeenCalledWith([
      expect.objectContaining({ label: "Close Floating Ball" }),
    ])
    const contextMenu = vi.mocked(Menu.buildFromTemplate).mock.results[0]?.value as
      | { popup: Mock }
      | undefined
    expect(contextMenu?.popup).toHaveBeenCalledWith(expect.objectContaining({ window: menuWindow }))
  })

  it("opens the expanded ball context menu without restacking the ball window", () => {
    showFloatingBallWindow(deps)
    const [ballWindow] = createdWindows()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    ballWindow.moveTop.mockClear()
    ballWindow.isFocused.mockReturnValue(true)
    vi.mocked(Menu.buildFromTemplate).mockClear()

    ballWindow.webContents.emit("context-menu")

    const contextMenu = vi.mocked(Menu.buildFromTemplate).mock.results[0]?.value as
      | { popup: Mock }
      | undefined
    const popupOptions = contextMenu?.popup.mock.calls[0]?.[0] as
      | { callback?: () => void }
      | undefined
    expect(popupOptions?.callback).toEqual(expect.any(Function))

    expect(ballWindow.moveTop).not.toHaveBeenCalled()
    popupOptions?.callback?.()

    expect(ballWindow.moveTop).not.toHaveBeenCalled()
  })

  it("relies on the expanded ball parent relationship before opening its context menu", () => {
    showFloatingBallWindow(deps)
    const [ballWindow] = createdWindows()
    ballWindow.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    expandFloatingBallMenu()
    ballWindow.isFocused.mockReturnValue(true)
    ballWindow.moveTop.mockClear()
    vi.mocked(Menu.buildFromTemplate).mockClear()

    ballWindow.webContents.emit("context-menu")

    const contextMenu = vi.mocked(Menu.buildFromTemplate).mock.results[0]?.value as
      | { popup: Mock }
      | undefined
    expect(ballWindow.setParentWindow).toHaveBeenCalled()
    expect(ballWindow.moveTop).not.toHaveBeenCalled()
    expect(contextMenu?.popup).toHaveBeenCalled()
  })

  it("does not restore the pre-expand snapped edge after dragging the expanded menu away", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    const leftSnappedBounds = {
      x: -(BALL_SIZE / 2) - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    }
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 120, y: 430 })
      .mockReturnValueOnce({ x: 40, y: 430 })
      .mockReturnValueOnce({ x: 120, y: 446 })
      .mockReturnValueOnce({ x: 620, y: 446 })

    ballWindow.getBounds.mockReturnValue({ x: 100, y: 410, width: 72, height: 72 })
    startFloatingBallDrag()
    moveFloatingBallDrag()
    ballWindow.getBounds.mockReturnValue({ x: 20, y: 410, width: 72, height: 72 })
    finishFloatingBallDrag()
    expect(getFloatingBallSnappedEdge()).toBe("left")

    ballWindow.getBounds.mockReturnValue(leftSnappedBounds)
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 0,
      y: 446 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })

    startFloatingBallDrag()
    moveFloatingBallDrag()
    ballWindow.getBounds.mockReturnValue({
      x: 500 + EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    menuWindow.getBounds.mockReturnValue({
      x: 500,
      y: 446 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    finishFloatingBallDrag()

    collapseFloatingBallMenu()

    expect(getFloatingBallSnappedEdge()).toBe("none")
    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: 500 + EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("snaps to the nearest edge when the expanded menu is dragged near an edge before closing", () => {
    ensureFloatingBallWindow(deps)
    const ballWindow = latestWindow()
    const leftSnappedBounds = {
      x: -(BALL_SIZE / 2) - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    }
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 120, y: 430 })
      .mockReturnValueOnce({ x: 40, y: 430 })
      .mockReturnValueOnce({ x: 120, y: 446 })
      .mockReturnValueOnce({ x: 1320, y: 446 })

    ballWindow.getBounds.mockReturnValue({ x: 100, y: 410, width: 72, height: 72 })
    startFloatingBallDrag()
    moveFloatingBallDrag()
    ballWindow.getBounds.mockReturnValue({ x: 20, y: 410, width: 72, height: 72 })
    finishFloatingBallDrag()
    expect(getFloatingBallSnappedEdge()).toBe("left")

    ballWindow.getBounds.mockReturnValue(leftSnappedBounds)
    expandFloatingBallMenu()
    const menuWindow = latestWindow()
    menuWindow.getBounds.mockReturnValue({
      x: 0,
      y: 446 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })

    startFloatingBallDrag()
    moveFloatingBallDrag()
    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    ballWindow.getBounds.mockReturnValue({
      x: 1440 - EXPANDED_WINDOW_SIZE / 2 - COLLAPSED_WINDOW_SIZE / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
    menuWindow.getBounds.mockReturnValue({
      x: 1440 - EXPANDED_WINDOW_SIZE,
      y: 446 - EXPANDED_WINDOW_SIZE / 2,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    finishFloatingBallDrag()

    collapseFloatingBallMenu()

    expect(getFloatingBallSnappedEdge()).toBe("right")
    expect(ballWindow.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - BALL_SIZE / 2 - (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2,
      y: 410,
      width: COLLAPSED_WINDOW_SIZE,
      height: COLLAPSED_WINDOW_SIZE,
    })
  })

  it("clears the drag origin after finishing a drag", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 100, y: 100, width: 240, height: 240 })
    win.setBounds.mockClear()
    vi.mocked(screen.getCursorScreenPoint)
      .mockReturnValueOnce({ x: 120, y: 120 })
      .mockReturnValueOnce({ x: 240, y: 240 })

    startFloatingBallDrag()
    finishFloatingBallDrag()
    moveFloatingBallDrag()

    expect(win.setBounds).not.toHaveBeenCalled()
  })
})
