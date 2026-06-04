import type { BrowserWindow as ElectronBrowserWindow } from "electron"
import type { Mock } from "vitest"
import type { FloatingBallWindowDeps } from "./floating-ball-window"
import { BrowserWindow, screen } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  BALL_SIZE,
  clampBoundsToWorkArea,
  COLLAPSE_MENU_RESIZE_DELAY_MS,
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
  moveFloatingBallBy,
  moveFloatingBallDrag,
  startFloatingBallDrag,
} from "./floating-ball-window"
import { defaultSettings } from "./settings/settings"

type MockBrowserWindow = ElectronBrowserWindow & {
  getBounds: Mock
  setBounds: Mock
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

  it("expands immediately around the ball center when the menu fits in the work area", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 604, y: 414, width: 72, height: 72 })
    win.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 520,
      y: 330,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    expect(win.webContents.send).toHaveBeenLastCalledWith("floating-ball:menu-state", true)
  })

  it("moves the window before expanding only when the menu would exceed the work area", () => {
    ensureFloatingBallWindow(deps)
    const win = latestWindow()
    win.getBounds.mockReturnValue({ x: 1344, y: 414, width: 72, height: 72 })
    win.setBounds.mockClear()

    expandFloatingBallMenu()

    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 1440 - EXPANDED_WINDOW_SIZE,
      y: 330,
      width: EXPANDED_WINDOW_SIZE,
      height: EXPANDED_WINDOW_SIZE,
    })
    expect(win.webContents.send).toHaveBeenLastCalledWith("floating-ball:menu-state", true)
  })

  it("hides the renderer menu before restoring the collapsed window position", () => {
    vi.useFakeTimers()
    try {
      ensureFloatingBallWindow(deps)
      const win = latestWindow()
      win.getBounds.mockReturnValue({ x: 1344, y: 414, width: 72, height: 72 })
      win.setBounds.mockClear()

      expandFloatingBallMenu()
      win.getBounds.mockReturnValue({
        x: 1440 - EXPANDED_WINDOW_SIZE,
        y: 330,
        width: EXPANDED_WINDOW_SIZE,
        height: EXPANDED_WINDOW_SIZE,
      })
      win.setBounds.mockClear()
      win.webContents.send.mockClear()

      collapseFloatingBallMenu()

      expect(win.webContents.send).toHaveBeenLastCalledWith("floating-ball:menu-state", false)
      expect(win.setBounds).not.toHaveBeenCalled()

      vi.advanceTimersByTime(COLLAPSE_MENU_RESIZE_DELAY_MS)

      expect(win.setBounds).toHaveBeenLastCalledWith({
        x: 1344,
        y: 414,
        width: COLLAPSED_WINDOW_SIZE,
        height: COLLAPSED_WINDOW_SIZE,
      })
    } finally {
      vi.useRealTimers()
    }
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
