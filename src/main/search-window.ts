import * as path from "node:path"
import process from "node:process"
import { BrowserWindow, screen } from "electron"
import { attachWindowSecurity } from "./window-security"

const SEARCH_WIDTH = 720
const SEARCH_HEIGHT = 480
const SEARCH_HASH = "search"

export interface SearchWindowDeps {
  /** Vite dev-server URL when running `pnpm dev`; undefined in production. */
  rendererDevUrl: string | undefined
  /** Origin allowed to navigate inside the window (CSP / navigation guard). */
  appOrigin: string
}

let searchWindow: BrowserWindow | null = null
let searchWindowQuitting = false

export function setSearchWindowQuitting(quitting: boolean): void {
  searchWindowQuitting = quitting
}

export function ensureSearchWindow(deps: SearchWindowDeps): BrowserWindow {
  if (searchWindow && !searchWindow.isDestroyed()) return searchWindow

  searchWindow = new BrowserWindow({
    width: SEARCH_WIDTH,
    height: SEARCH_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "DesKit Launcher",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  // Hide instead of closing — re-creating a BrowserWindow on every hotkey
  // press makes the first show feel sluggish.
  searchWindow.on("close", (event) => {
    if (!searchWindow) return
    if (searchWindowQuitting) return
    event.preventDefault()
    hideSearchWindow()
  })

  searchWindow.on("closed", () => {
    searchWindow = null
  })

  // Auto-hide when the user clicks elsewhere — same behaviour as
  // Spotlight / PowerToys Run.
  searchWindow.on("blur", () => {
    if (process.env.DESKIT_KEEP_SEARCH_OPEN) return
    hideSearchWindow()
  })

  const allowedOrigin = deps.rendererDevUrl ? new URL(deps.rendererDevUrl).origin : deps.appOrigin
  attachWindowSecurity(searchWindow, allowedOrigin)

  const url = deps.rendererDevUrl
    ? `${deps.rendererDevUrl}#${SEARCH_HASH}`
    : `${deps.appOrigin}/index.html#${SEARCH_HASH}`
  void searchWindow.loadURL(url)

  return searchWindow
}

export function getSearchWindow(): BrowserWindow | null {
  return searchWindow && !searchWindow.isDestroyed() ? searchWindow : null
}

export function showSearchWindow(deps: SearchWindowDeps): void {
  const win = ensureSearchWindow(deps)
  centerOnActiveDisplay(win)
  win.show()
  win.focus()
  win.webContents.send("launcher:focus")
}

export function hideSearchWindow(): void {
  const win = getSearchWindow()
  if (!win) return
  if (win.isVisible()) win.hide()
}

export function toggleSearchWindow(deps: SearchWindowDeps): void {
  const win = getSearchWindow()
  if (win && win.isVisible()) {
    hideSearchWindow()
  } else {
    showSearchWindow(deps)
  }
}

function centerOnActiveDisplay(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.workArea
  // Sit at ~1/4 from the top — roughly where users expect command palettes.
  win.setBounds({
    x: Math.round(x + (width - SEARCH_WIDTH) / 2),
    y: Math.round(y + height / 4 - SEARCH_HEIGHT / 4),
    width: SEARCH_WIDTH,
    height: SEARCH_HEIGHT,
  })
}
