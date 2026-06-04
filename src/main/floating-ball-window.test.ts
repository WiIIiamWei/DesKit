import type { BrowserWindow as ElectronBrowserWindow } from "electron"
import type { Mock } from "vitest"
import type { FloatingBallWindowDeps } from "./floating-ball-window"
import { BrowserWindow, screen } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clampBoundsToWorkArea,
  COLLAPSED_WINDOW_SIZE,
  destroyFloatingBallWindow,
  ensureFloatingBallWindow,
  EXPANDED_WINDOW_SIZE,
  finishFloatingBallDrag,
  getCollapsedFloatingBallBounds,
  getExpandedFloatingBallBounds,
  getFloatingBallVisualCenter,
  moveFloatingBallBy,
  moveFloatingBallDrag,
  startFloatingBallDrag,
} from "./floating-ball-window"
import { defaultSettings } from "./settings/settings"

type MockBrowserWindow = ElectronBrowserWindow & {
  getBounds: Mock
  setBounds: Mock
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
