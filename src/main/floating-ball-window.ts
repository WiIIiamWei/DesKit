import type { UserSettings } from "./settings/settings"
import * as path from "node:path"
import process from "node:process"
import { BrowserWindow, Menu, screen } from "electron"
import { defaultAppIcon } from "./app-icon"
import { attachWindowSecurity } from "./window-security"

export const EXPANDED_WINDOW_SIZE = process.platform === "darwin" ? 320 : 240
export const BALL_SIZE = 56
export const COLLAPSED_WINDOW_SIZE = 72
export const EDGE_VISIBLE_BALL_WIDTH = BALL_SIZE / 2
export const SNAP_EDGE_DISTANCE = 96

const MENU_SIZE = EXPANDED_WINDOW_SIZE
const EDGE_MARGIN = 24
const FLOATING_BALL_HASH = "floating-ball"

export interface FloatingBallWindowDeps {
  rendererDevUrl: string | undefined
  appOrigin: string
  getSettings: () => UserSettings
  getLocale: () => string
  onOpenFeature: (feature: UserSettings["floatingBallFeatures"][number]) => void
  onDisable: () => void
}

let floatingBallWindow: BrowserWindow | null = null
let currentDeps: FloatingBallWindowDeps | null = null
let menuExpanded = false
let dragState: { cursor: Electron.Point; bounds: Electron.Rectangle } | null = null

export function ensureFloatingBallWindow(deps: FloatingBallWindowDeps): BrowserWindow {
  currentDeps = deps
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) return floatingBallWindow

  floatingBallWindow = new BrowserWindow({
    width: MENU_SIZE,
    height: MENU_SIZE,
    show: false,
    frame: false,
    hasShadow: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "DesKit Floating Ball",
    backgroundColor: "#00000000",
    icon: defaultAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  const allowedOrigin = deps.rendererDevUrl ? new URL(deps.rendererDevUrl).origin : deps.appOrigin
  attachWindowSecurity(floatingBallWindow, allowedOrigin)

  floatingBallWindow.on("closed", () => {
    floatingBallWindow = null
  })

  floatingBallWindow.on("blur", () => {
    collapseFloatingBallMenu()
  })

  floatingBallWindow.webContents.on("context-menu", () => {
    showFloatingBallContextMenu()
  })

  const url = deps.rendererDevUrl
    ? `${deps.rendererDevUrl}#${FLOATING_BALL_HASH}`
    : `${deps.appOrigin}/index.html#${FLOATING_BALL_HASH}`
  void floatingBallWindow.loadURL(url)
  moveFloatingBallToDefaultPosition(floatingBallWindow)

  return floatingBallWindow
}

export function showFloatingBallWindow(deps: FloatingBallWindowDeps): void {
  const win = ensureFloatingBallWindow(deps)
  if (!win.isVisible()) win.showInactive()
}

export function hideFloatingBallWindow(): void {
  const win = getFloatingBallWindow()
  if (!win) return
  finishFloatingBallDrag()
  collapseFloatingBallMenu()
  win.hide()
}

export function destroyFloatingBallWindow(): void {
  const win = getFloatingBallWindow()
  floatingBallWindow = null
  currentDeps = null
  finishFloatingBallDrag()
  if (win) win.destroy()
}

export function expandFloatingBallMenu(): void {
  const win = getFloatingBallWindow()
  if (!win || menuExpanded) return

  menuExpanded = true
  win.webContents.send("floating-ball:menu-state", true)
}

export function collapseFloatingBallMenu(): void {
  const win = getFloatingBallWindow()
  if (!win || !menuExpanded) return

  menuExpanded = false
  win.webContents.send("floating-ball:menu-state", false)
}

export function toggleFloatingBallMenu(): void {
  if (menuExpanded) collapseFloatingBallMenu()
  else expandFloatingBallMenu()
}

export function openFloatingBallFeature(
  feature: UserSettings["floatingBallFeatures"][number]
): void {
  currentDeps?.onOpenFeature(feature)
  collapseFloatingBallMenu()
}

export function startFloatingBallDrag(): void {
  const win = getFloatingBallWindow()
  if (!win) return
  dragState = {
    cursor: screen.getCursorScreenPoint(),
    bounds: fixedSizeBounds(win.getBounds()),
  }
}

export function moveFloatingBallDrag(): void {
  const win = getFloatingBallWindow()
  if (!win || !dragState) return
  const cursor = screen.getCursorScreenPoint()
  const next = {
    x: dragState.bounds.x + cursor.x - dragState.cursor.x,
    y: dragState.bounds.y + cursor.y - dragState.cursor.y,
    width: MENU_SIZE,
    height: MENU_SIZE,
  }
  win.setBounds(clampBounds(next, screen.getDisplayMatching(next).workArea))
}

export function finishFloatingBallDrag(): void {
  dragState = null
}

export function moveFloatingBallBy(delta: { x: number; y: number }): void {
  const win = getFloatingBallWindow()
  if (!win) return
  const bounds = win.getBounds()
  const next = {
    x: bounds.x + Math.round(delta.x),
    y: bounds.y + Math.round(delta.y),
    width: MENU_SIZE,
    height: MENU_SIZE,
  }
  win.setBounds(clampBounds(next, screen.getDisplayMatching(next).workArea))
}

export function syncFloatingBallWindow(deps: FloatingBallWindowDeps): void {
  currentDeps = deps
  const settings = deps.getSettings()
  if (settings.floatingBallEnabled) {
    showFloatingBallWindow(deps)
    const win = getFloatingBallWindow()
    win?.webContents.send("floating-ball:features", settings.floatingBallFeatures)
  } else {
    hideFloatingBallWindow()
  }
}

export function getFloatingBallWindow(): BrowserWindow | null {
  return floatingBallWindow && !floatingBallWindow.isDestroyed() ? floatingBallWindow : null
}

function moveFloatingBallToDefaultPosition(win: BrowserWindow): void {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  win.setBounds({
    x: Math.round(x + width - MENU_SIZE - EDGE_MARGIN),
    y: Math.round(y + height / 2 - MENU_SIZE / 2),
    width: MENU_SIZE,
    height: MENU_SIZE,
  })
}

function fixedSizeBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  return {
    x: bounds.x,
    y: bounds.y,
    width: MENU_SIZE,
    height: MENU_SIZE,
  }
}

export function getFloatingBallVisualCenter(bounds: Electron.Rectangle): Electron.Point {
  return {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  }
}

export function getExpandedFloatingBallBounds(center: Electron.Point): Electron.Rectangle {
  return getCenteredBounds(center, EXPANDED_WINDOW_SIZE)
}

export function getCollapsedFloatingBallBounds(center: Electron.Point): Electron.Rectangle {
  return getCenteredBounds(center, COLLAPSED_WINDOW_SIZE)
}

export function clampBoundsToWorkArea(
  bounds: Electron.Rectangle,
  workArea: Electron.Rectangle
): Electron.Rectangle {
  return {
    ...bounds,
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height),
  }
}

function clampBounds(bounds: Electron.Rectangle, workArea: Electron.Rectangle): Electron.Rectangle {
  return clampBoundsToWorkArea(bounds, workArea)
}

function getCenteredBounds(center: Electron.Point, size: number): Electron.Rectangle {
  return {
    x: Math.round(center.x - size / 2),
    y: Math.round(center.y - size / 2),
    width: size,
    height: size,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function showFloatingBallContextMenu(): void {
  const deps = currentDeps
  if (!deps) return
  const s = floatingBallStrings(deps.getLocale())
  Menu.buildFromTemplate([
    {
      label: s.close,
      click: () => {
        hideFloatingBallWindow()
        deps.onDisable()
      },
    },
  ]).popup({ window: getFloatingBallWindow() ?? undefined })
}

interface FloatingBallStrings {
  close: string
}

function floatingBallStrings(locale: string): FloatingBallStrings {
  if (isChinese(locale)) {
    return {
      close: "关闭桌面悬浮球",
    }
  }
  return {
    close: "Close Floating Ball",
  }
}

function isChinese(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh")
}
