import type { BrowserWindow as ElectronBrowserWindow } from "electron"
import type { Mock } from "vitest"
import type { FloatingBallWindowDeps } from "./floating-ball-window"
import process from "node:process"
import { BrowserWindow, screen } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  destroyFloatingBallWindow,
  ensureFloatingBallWindow,
  finishFloatingBallDrag,
  moveFloatingBallDrag,
  startFloatingBallDrag,
} from "./floating-ball-window"

type MockBrowserWindow = ElectronBrowserWindow & {
  getBounds: Mock
  setBounds: Mock
}

const MENU_SIZE = process.platform === "darwin" ? 320 : 240

const deps: FloatingBallWindowDeps = {
  rendererDevUrl: undefined,
  appOrigin: "app://app",
  getSettings: () => ({
    hotkey: "Alt+Space",
    themeMode: "system",
    accent: "neutral",
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
      width: MENU_SIZE,
      height: MENU_SIZE,
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
