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

const EDGE_MARGIN = 24
const DRAG_THRESHOLD = 4
const FLOATING_BALL_HASH = "floating-ball"
const FLOATING_BALL_MENU_HASH = "floating-ball-menu"
export type FloatingBallWindowPhase = "collapsed" | "expanded"

export interface FloatingBallWindowDeps {
  rendererDevUrl: string | undefined
  appOrigin: string
  getSettings: () => UserSettings
  getLocale: () => string
  onOpenFeature: (feature: UserSettings["floatingBallFeatures"][number]) => void
  onDisable: () => void
}

let floatingBallWindow: BrowserWindow | null = null
let floatingBallMenuWindow: BrowserWindow | null = null
let currentDeps: FloatingBallWindowDeps | null = null
let menuPhase: FloatingBallWindowPhase = "collapsed"
let pendingBlurCollapseTimer: NodeJS.Timeout | null = null
let dragState: {
  cursor: Electron.Point
  bounds: Electron.Rectangle
  menuBounds: Electron.Rectangle | null
  moved: boolean
} | null = null
let snappedEdge: "none" | "left" | "right" = "none"

export function ensureFloatingBallWindow(deps: FloatingBallWindowDeps): BrowserWindow {
  currentDeps = deps
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) return floatingBallWindow

  floatingBallWindow = createFloatingBallBrowserWindow({
    deps,
    hash: FLOATING_BALL_HASH,
    size: COLLAPSED_WINDOW_SIZE,
    title: "DesKit Floating Ball",
  })

  floatingBallWindow.on("closed", () => {
    floatingBallWindow = null
  })

  floatingBallWindow.on("blur", () => {
    collapseFloatingBallMenuAfterFocusSettles()
  })

  floatingBallWindow.webContents.on("context-menu", () => {
    showFloatingBallContextMenu()
  })

  moveFloatingBallToDefaultPosition(floatingBallWindow)

  return floatingBallWindow
}

function ensureFloatingBallMenuWindow(deps: FloatingBallWindowDeps): BrowserWindow {
  if (floatingBallMenuWindow && !floatingBallMenuWindow.isDestroyed()) {
    return floatingBallMenuWindow
  }

  floatingBallMenuWindow = createFloatingBallBrowserWindow({
    deps,
    hash: FLOATING_BALL_MENU_HASH,
    size: EXPANDED_WINDOW_SIZE,
    title: "DesKit Floating Ball Menu",
  })

  floatingBallMenuWindow.on("closed", () => {
    floatingBallMenuWindow = null
  })

  floatingBallMenuWindow.on("blur", () => {
    collapseFloatingBallMenuAfterFocusSettles()
  })

  floatingBallMenuWindow.webContents.on("did-finish-load", () => {
    if (menuPhase === "expanded") {
      floatingBallMenuWindow?.webContents.send("floating-ball:menu-state", true)
    }
  })

  return floatingBallMenuWindow
}

function createFloatingBallBrowserWindow({
  deps,
  hash,
  size,
  title,
}: {
  deps: FloatingBallWindowDeps
  hash: string
  size: number
  title: string
}): BrowserWindow {
  const win = new BrowserWindow({
    width: size,
    height: size,
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
    title,
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
  attachWindowSecurity(win, allowedOrigin)

  const url = deps.rendererDevUrl
    ? `${deps.rendererDevUrl}#${hash}`
    : `${deps.appOrigin}/index.html#${hash}`
  void win.loadURL(url)
  return win
}

export function showFloatingBallWindow(deps: FloatingBallWindowDeps): void {
  const win = ensureFloatingBallWindow(deps)
  ensureFloatingBallMenuWindow(deps)
  if (!win.isVisible()) win.showInactive()
}

export function hideFloatingBallWindow(): void {
  const win = getFloatingBallWindow()
  if (!win) return
  finishFloatingBallDrag()
  collapseFloatingBallMenu()
  floatingBallMenuWindow?.hide()
  win.hide()
}

export function destroyFloatingBallWindow(): void {
  const win = getFloatingBallWindow()
  const menuWin = getFloatingBallMenuWindow()
  clearPendingBlurCollapse()
  floatingBallWindow = null
  floatingBallMenuWindow = null
  currentDeps = null
  menuPhase = "collapsed"
  snappedEdge = "none"
  finishFloatingBallDrag()
  if (win) win.destroy()
  if (menuWin) menuWin.destroy()
}

export function expandFloatingBallMenu(): void {
  const win = getFloatingBallWindow()
  const deps = currentDeps
  if (!win || !deps || menuPhase !== "collapsed") return

  const menuWin = ensureFloatingBallMenuWindow(deps)
  const menuBounds = getPreparedExpandedFloatingBallWindowBounds(win)
  win.setBounds(getCollapsedFloatingBallBounds(getFloatingBallVisualCenter(menuBounds)))
  menuWin.setBounds(menuBounds)
  menuPhase = "expanded"
  sendFloatingBallMenuState(true)
  menuWin.showInactive()
  keepFloatingBallWindowAboveMenu()
}

export function collapseFloatingBallMenu(): void {
  if (menuPhase !== "expanded") return

  clearPendingBlurCollapse()
  applyExpandedMenuClosePosition()
  menuPhase = "collapsed"
  sendFloatingBallMenuState(false)
  floatingBallMenuWindow?.hide()
}

export function toggleFloatingBallMenu(): void {
  if (menuPhase === "expanded") collapseFloatingBallMenu()
  else if (menuPhase === "collapsed") expandFloatingBallMenu()
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
    bounds: fixedCollapsedBounds(win.getBounds()),
    menuBounds:
      menuPhase === "expanded" ? (getFloatingBallMenuWindow()?.getBounds() ?? null) : null,
    moved: false,
  }
}

export function moveFloatingBallDrag(): void {
  const win = getFloatingBallWindow()
  if (!win || !dragState) return

  const cursor = screen.getCursorScreenPoint()
  dragState.moved =
    dragState.moved ||
    Math.abs(cursor.x - dragState.cursor.x) >= DRAG_THRESHOLD ||
    Math.abs(cursor.y - dragState.cursor.y) >= DRAG_THRESHOLD

  const menuWin = getFloatingBallMenuWindow()
  if (menuPhase === "expanded" && menuWin && dragState.menuBounds) {
    const nextMenu = clampBoundsToWorkArea(
      {
        x: dragState.menuBounds.x + cursor.x - dragState.cursor.x,
        y: dragState.menuBounds.y + cursor.y - dragState.cursor.y,
        width: EXPANDED_WINDOW_SIZE,
        height: EXPANDED_WINDOW_SIZE,
      },
      getPrimaryWorkArea()
    )
    menuWin.setBounds(nextMenu)
    win.setBounds(getCollapsedFloatingBallBounds(getFloatingBallVisualCenter(nextMenu)))
    return
  }

  const next = {
    x: dragState.bounds.x + cursor.x - dragState.cursor.x,
    y: dragState.bounds.y + cursor.y - dragState.cursor.y,
    width: COLLAPSED_WINDOW_SIZE,
    height: COLLAPSED_WINDOW_SIZE,
  }
  win.setBounds(clampBounds(next, screen.getDisplayMatching(next).workArea))
}

export function finishFloatingBallDrag(): void {
  const win = getFloatingBallWindow()
  if (win && dragState?.moved) {
    if (menuPhase === "collapsed") {
      applyFloatingBallEdgeSnap(win)
    } else if (menuPhase === "expanded") {
      snappedEdge = "none"
    }
  }
  dragState = null
}

export function moveFloatingBallBy(delta: { x: number; y: number }): void {
  const win = getFloatingBallWindow()
  if (!win) return
  const bounds = win.getBounds()
  const next = {
    x: bounds.x + Math.round(delta.x),
    y: bounds.y + Math.round(delta.y),
    width: COLLAPSED_WINDOW_SIZE,
    height: COLLAPSED_WINDOW_SIZE,
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
    getFloatingBallMenuWindow()?.webContents.send(
      "floating-ball:features",
      settings.floatingBallFeatures
    )
  } else {
    hideFloatingBallWindow()
  }
}

export function getFloatingBallWindow(): BrowserWindow | null {
  return floatingBallWindow && !floatingBallWindow.isDestroyed() ? floatingBallWindow : null
}

function getFloatingBallMenuWindow(): BrowserWindow | null {
  return floatingBallMenuWindow && !floatingBallMenuWindow.isDestroyed()
    ? floatingBallMenuWindow
    : null
}

export function getFloatingBallSnappedEdge(): "none" | "left" | "right" {
  return snappedEdge
}

function moveFloatingBallToDefaultPosition(win: BrowserWindow): void {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  win.setBounds({
    x: Math.round(x + width - COLLAPSED_WINDOW_SIZE - EDGE_MARGIN),
    y: Math.round(y + height / 2 - COLLAPSED_WINDOW_SIZE / 2),
    width: COLLAPSED_WINDOW_SIZE,
    height: COLLAPSED_WINDOW_SIZE,
  })
}

function getPreparedExpandedFloatingBallWindowBounds(win: BrowserWindow): Electron.Rectangle {
  const collapsedBounds = fixedCollapsedBounds(win.getBounds())
  const expandedBounds = getExpandedFloatingBallBounds(getFloatingBallVisualCenter(collapsedBounds))
  return clampBoundsToWorkArea(expandedBounds, getPrimaryWorkArea())
}

function applyExpandedMenuClosePosition(): void {
  const win = getFloatingBallWindow()
  const menuBounds = getFloatingBallMenuWindow()?.getBounds()
  if (!win || !menuBounds) return

  const workArea = getPrimaryWorkArea()
  const collapsedBounds = getCollapsedFloatingBallBounds(getFloatingBallVisualCenter(menuBounds))
  const target = getExpandedMenuEdgeSnapBounds(collapsedBounds, menuBounds, workArea)
  snappedEdge = target.edge
  if (!sameBounds(fixedCollapsedBounds(win.getBounds()), target.bounds)) {
    win.setBounds(target.bounds)
  }
}

function sendFloatingBallMenuState(expanded: boolean): void {
  floatingBallWindow?.webContents.send("floating-ball:menu-state", expanded)
  floatingBallMenuWindow?.webContents.send("floating-ball:menu-state", expanded)
}

function collapseFloatingBallMenuAfterFocusSettles(): void {
  clearPendingBlurCollapse()
  pendingBlurCollapseTimer = setTimeout(() => {
    pendingBlurCollapseTimer = null
    if (isFloatingBallWindowGroupFocused()) return
    collapseFloatingBallMenu()
  }, 0)
}

function clearPendingBlurCollapse(): void {
  if (!pendingBlurCollapseTimer) return
  clearTimeout(pendingBlurCollapseTimer)
  pendingBlurCollapseTimer = null
}

function isFloatingBallWindowGroupFocused(): boolean {
  return Boolean(getFloatingBallWindow()?.isFocused() || getFloatingBallMenuWindow()?.isFocused())
}

function keepFloatingBallWindowAboveMenu(): void {
  if (menuPhase !== "expanded") return
  getFloatingBallWindow()?.moveTop()
}

function applyFloatingBallEdgeSnap(win: BrowserWindow): void {
  const bounds = fixedCollapsedBounds(win.getBounds())
  const workArea = screen.getDisplayMatching(bounds).workArea
  const target = getEdgeSnapBounds(bounds, workArea)
  snappedEdge = target.edge
  if (target.edge === "none") return
  win.setBounds(target.bounds)
}

function getPrimaryWorkArea(): Electron.Rectangle {
  return screen.getPrimaryDisplay().workArea
}

function getEdgeSnapBounds(
  bounds: Electron.Rectangle,
  workArea: Electron.Rectangle
): { edge: "none" | "left" | "right"; bounds: Electron.Rectangle } {
  const visualBounds = getFloatingBallVisualBounds(bounds)
  const leftDistance = visualBounds.x - workArea.x
  const rightDistance = workArea.x + workArea.width - (visualBounds.x + visualBounds.width)

  if (leftDistance > SNAP_EDGE_DISTANCE && rightDistance > SNAP_EDGE_DISTANCE) {
    return { edge: "none", bounds }
  }

  const edge = leftDistance <= rightDistance ? "left" : "right"
  return {
    edge,
    bounds: getSnappedCollapsedBounds(bounds, workArea, edge),
  }
}

function getExpandedMenuEdgeSnapBounds(
  collapsedBounds: Electron.Rectangle,
  expandedBounds: Electron.Rectangle,
  workArea: Electron.Rectangle
): { edge: "none" | "left" | "right"; bounds: Electron.Rectangle } {
  const leftDistance = expandedBounds.x - workArea.x
  const rightDistance = workArea.x + workArea.width - (expandedBounds.x + expandedBounds.width)

  if (leftDistance > SNAP_EDGE_DISTANCE && rightDistance > SNAP_EDGE_DISTANCE) {
    return { edge: "none", bounds: clampBounds(collapsedBounds, workArea) }
  }

  const edge = leftDistance <= rightDistance ? "left" : "right"
  return {
    edge,
    bounds: getSnappedCollapsedBounds(collapsedBounds, workArea, edge),
  }
}

function getSnappedCollapsedBounds(
  bounds: Electron.Rectangle,
  workArea: Electron.Rectangle,
  edge: "left" | "right"
): Electron.Rectangle {
  const visualInset = (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2
  const x =
    edge === "left"
      ? workArea.x - EDGE_VISIBLE_BALL_WIDTH - visualInset
      : workArea.x + workArea.width - EDGE_VISIBLE_BALL_WIDTH - visualInset
  return {
    x: Math.round(x),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height),
    width: COLLAPSED_WINDOW_SIZE,
    height: COLLAPSED_WINDOW_SIZE,
  }
}

function getFloatingBallVisualBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  const visualInset = (COLLAPSED_WINDOW_SIZE - BALL_SIZE) / 2
  return {
    x: bounds.x + visualInset,
    y: bounds.y + visualInset,
    width: BALL_SIZE,
    height: BALL_SIZE,
  }
}

function fixedCollapsedBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  return {
    x: bounds.x,
    y: bounds.y,
    width: COLLAPSED_WINDOW_SIZE,
    height: COLLAPSED_WINDOW_SIZE,
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

function sameBounds(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
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
