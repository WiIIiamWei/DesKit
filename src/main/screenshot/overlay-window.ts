import type { BrowserWindow, WebContents } from "electron"
import type { ScreenshotAction, ScreenshotSelection, ScreenshotSelectionResult } from "./types"
import * as path from "node:path"
import { BrowserWindow as ElectronBrowserWindow, screen } from "electron"
import { attachWindowSecurity } from "../window-security"

const OVERLAY_HASH = "screenshot-overlay"

export interface ScreenshotOverlayDeps {
  rendererDevUrl: string | undefined
  appOrigin: string
}

export interface ScreenshotOverlayOptions {
  mode?: "actions" | "capture"
}

interface ActiveOverlay {
  displayId: string
  scaleFactor: number
  resolve: (result: ScreenshotSelectionResult | null) => void
  win: BrowserWindow
}

type OverlaySelection = Pick<ScreenshotSelection, "x" | "y" | "width" | "height">

let activeOverlay: ActiveOverlay | null = null

export function selectScreenshotRegion(
  deps: ScreenshotOverlayDeps,
  options: ScreenshotOverlayOptions = {}
): Promise<ScreenshotSelectionResult | null> {
  if (activeOverlay && !activeOverlay.win.isDestroyed()) {
    activeOverlay.win.focus()
    return Promise.resolve(null)
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const win = new ElectronBrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "DesKit Screenshot",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  const allowedOrigin = deps.rendererDevUrl ? new URL(deps.rendererDevUrl).origin : deps.appOrigin
  attachWindowSecurity(win, allowedOrigin)

  const query = options.mode === "capture" ? "?screenshotMode=capture" : ""
  const url = deps.rendererDevUrl
    ? `${deps.rendererDevUrl}${query}#${OVERLAY_HASH}`
    : `${deps.appOrigin}/index.html${query}#${OVERLAY_HASH}`
  void win.loadURL(url)

  return new Promise((resolve) => {
    activeOverlay = {
      displayId: String(display.id),
      scaleFactor: display.scaleFactor,
      resolve,
      win,
    }

    win.on("closed", () => {
      if (activeOverlay?.win === win) {
        activeOverlay.resolve(null)
        activeOverlay = null
      }
    })

    win.show()
    win.focus()
  })
}

export function completeScreenshotOverlay(
  sender: WebContents,
  selection: OverlaySelection,
  action: ScreenshotAction
): void {
  const overlay = activeOverlay
  if (!overlay || ElectronBrowserWindow.fromWebContents(sender) !== overlay.win) return
  const normalized = normalizeSelection(selection)
  if (!normalized) {
    cancelScreenshotOverlay(sender)
    return
  }

  activeOverlay = null
  overlay.resolve({
    action,
    selection: {
      ...normalized,
      displayId: overlay.displayId,
      displayWidth: overlay.win.getBounds().width,
      displayHeight: overlay.win.getBounds().height,
      scaleFactor: overlay.scaleFactor,
    },
  })
  overlay.win.destroy()
}

export function cancelScreenshotOverlay(sender: WebContents): void {
  const overlay = activeOverlay
  if (!overlay || ElectronBrowserWindow.fromWebContents(sender) !== overlay.win) return
  activeOverlay = null
  overlay.resolve(null)
  overlay.win.destroy()
}

function normalizeSelection(selection: OverlaySelection): OverlaySelection | null {
  const x = Math.round(selection.x)
  const y = Math.round(selection.y)
  const width = Math.round(selection.width)
  const height = Math.round(selection.height)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}
