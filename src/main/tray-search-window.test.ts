import type { WebContents } from "electron"
import type { SearchWindowDeps } from "./search-window"
import type { TrayActions } from "./tray"
import { BrowserWindow, Tray } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  consumeSearchWindowTrayOpenSuppression,
  markSearchWindowReady,
  showSearchWindow,
} from "./search-window"
import { createTray, destroyTray } from "./tray"

interface MockBrowserWindow {
  emit: (event: string, ...args: unknown[]) => void
  webContents: WebContents
  setFocusable: ReturnType<typeof vi.fn>
}

interface MockTray {
  emit: (event: string, ...args: unknown[]) => void
}

const deps: SearchWindowDeps = {
  rendererDevUrl: undefined,
  appOrigin: "app://app",
}

function createActions(): TrayActions {
  return {
    onOpenSearch: vi.fn(() => showSearchWindow(deps)),
    onShowMainWindow: vi.fn(),
    onRefreshApps: vi.fn(),
    onQuit: vi.fn(),
    shouldIgnoreOpenSearch: consumeSearchWindowTrayOpenSuppression,
    getHotkey: vi.fn(() => "Alt+Space"),
    getLocale: vi.fn(() => "en-US"),
  }
}

function latestTray(): MockTray {
  const instances = vi.mocked(Tray).mock.instances as unknown as MockTray[]
  return instances[instances.length - 1]!
}

function latestWindow(): MockBrowserWindow | undefined {
  const results = vi.mocked(BrowserWindow).mock.results as unknown as {
    value: MockBrowserWindow
  }[]
  return results[results.length - 1]?.value
}

function requireLatestWindow(): MockBrowserWindow {
  const win = latestWindow()
  if (!win) throw new Error("Expected a BrowserWindow to be created")
  return win
}

function openReadySearchWindowFromTray(): { actions: TrayActions; win: MockBrowserWindow } {
  const actions = createActions()
  createTray("tray.png", actions)
  latestTray().emit("click")

  const win = requireLatestWindow()
  markSearchWindowReady(win.webContents)
  vi.runOnlyPendingTimers()
  vi.mocked(actions.onOpenSearch).mockClear()
  win.setFocusable.mockClear()

  return { actions, win }
}

describe("tray-triggered search window focus", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    latestWindow()?.emit("closed")
    destroyTray()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it("ignores the tray click that happens while the search window is visible", () => {
    const { actions, win } = openReadySearchWindowFromTray()

    win.emit("blur")
    latestTray().emit("click")

    expect(actions.onOpenSearch).not.toHaveBeenCalled()
    expect(win.setFocusable).not.toHaveBeenCalledWith(true)
  })
})
