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
export const FLOATING_BALL_MENU_TRANSITION_FALLBACK_MS = 250

const EDGE_MARGIN = 24
const DRAG_THRESHOLD = 4
const FLOATING_BALL_HASH = "floating-ball"
export type FloatingBallWindowPhase = "collapsed" | "expanding" | "expanded" | "collapsing"

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
let menuPhase: FloatingBallWindowPhase = "collapsed"
let dragState: {
  cursor: Electron.Point
  bounds: Electron.Rectangle
  moved: boolean
} | null = null
let snappedEdge: "none" | "left" | "right" = "none"
let restoreCollapsedBoundsAfterMenu: Electron.Rectangle | null = null
let pendingExpandedBounds: Electron.Rectangle | null = null
let pendingCollapsedBounds: Electron.Rectangle | null = null
let pendingMenuTransitionFallback: ReturnType<typeof setTimeout> | null = null
let expandedMenuMovedAfterOpen = false

export function ensureFloatingBallWindow(deps: FloatingBallWindowDeps): BrowserWindow {
  currentDeps = deps
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) return floatingBallWindow

  floatingBallWindow = new BrowserWindow({
    width: COLLAPSED_WINDOW_SIZE,
    height: COLLAPSED_WINDOW_SIZE,
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
  menuPhase = "collapsed"
  snappedEdge = "none"
  restoreCollapsedBoundsAfterMenu = null
  pendingExpandedBounds = null
  pendingCollapsedBounds = null
  expandedMenuMovedAfterOpen = false
  clearPendingMenuTransitionFallback()
  finishFloatingBallDrag()
  if (win) win.destroy()
}

export function expandFloatingBallMenu(): void {
  const win = getFloatingBallWindow()
  if (!win || menuPhase !== "collapsed") return

  clearPendingMenuTransitionFallback()
  restoreCollapsedBoundsAfterMenu = null
  expandedMenuMovedAfterOpen = false
  pendingExpandedBounds = getPreparedExpandedFloatingBallWindowBounds(win)
  menuPhase = "expanding"
  sendFloatingBallWindowState(win, "expanding")
  scheduleMenuTransitionFallback(finishFloatingBallExpandPreparation)
}

export function finishFloatingBallExpandPreparation(): void {
  const win = getFloatingBallWindow()
  if (!win || menuPhase !== "expanding" || !pendingExpandedBounds) return

  clearPendingMenuTransitionFallback()
  win.setBounds(pendingExpandedBounds)
  pendingExpandedBounds = null
  menuPhase = "expanded"
  sendFloatingBallWindowState(win, "expanded")
  win.webContents.send("floating-ball:menu-state", true)
}

export function collapseFloatingBallMenu(): void {
  const win = getFloatingBallWindow()
  if (!win || menuPhase !== "expanded") return

  pendingCollapsedBounds = getCollapsedFloatingBallWindowBounds(win)
  menuPhase = "collapsing"
  sendFloatingBallWindowState(win, "collapsing")
  win.webContents.send("floating-ball:menu-state", false)
  scheduleMenuTransitionFallback(finishFloatingBallCollapseTransition)
}

export function finishFloatingBallCollapseTransition(): void {
  const win = getFloatingBallWindow()
  if (!win || menuPhase !== "collapsing" || !pendingCollapsedBounds) return

  clearPendingMenuTransitionFallback()
  win.setBounds(pendingCollapsedBounds)
  pendingCollapsedBounds = null
  menuPhase = "collapsed"
  sendFloatingBallWindowState(win, "collapsed")
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
    bounds: fixedSizeBounds(win.getBounds()),
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
  const next = {
    x: dragState.bounds.x + cursor.x - dragState.cursor.x,
    y: dragState.bounds.y + cursor.y - dragState.cursor.y,
    width: getCurrentFloatingBallWindowSize(),
    height: getCurrentFloatingBallWindowSize(),
  }
  win.setBounds(clampBounds(next, screen.getDisplayMatching(next).workArea))
}

export function finishFloatingBallDrag(): void {
  const win = getFloatingBallWindow()
  if (win && dragState?.moved) {
    if (menuPhase === "collapsed") {
      applyFloatingBallEdgeSnap(win)
    } else if (menuPhase === "expanded") {
      expandedMenuMovedAfterOpen = true
      restoreCollapsedBoundsAfterMenu = null
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
    width: getCurrentFloatingBallWindowSize(),
    height: getCurrentFloatingBallWindowSize(),
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

function fixedSizeBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  return {
    x: bounds.x,
    y: bounds.y,
    width: getCurrentFloatingBallWindowSize(),
    height: getCurrentFloatingBallWindowSize(),
  }
}

function getCurrentFloatingBallWindowSize(): number {
  return menuPhase === "expanded" || menuPhase === "collapsing"
    ? EXPANDED_WINDOW_SIZE
    : COLLAPSED_WINDOW_SIZE
}

function getPreparedExpandedFloatingBallWindowBounds(win: BrowserWindow): Electron.Rectangle {
  const collapsedBounds = fixedCollapsedBounds(win.getBounds())
  const expandedBounds = getExpandedFloatingBallBounds(getFloatingBallVisualCenter(collapsedBounds))
  const nextBounds = clampBoundsToWorkArea(
    expandedBounds,
    screen.getDisplayMatching(expandedBounds).workArea
  )
  if (boundsMoved(expandedBounds, nextBounds)) {
    restoreCollapsedBoundsAfterMenu = collapsedBounds
  }
  return nextBounds
}

function getCollapsedFloatingBallWindowBounds(win: BrowserWindow): Electron.Rectangle {
  if (expandedMenuMovedAfterOpen) {
    expandedMenuMovedAfterOpen = false
    restoreCollapsedBoundsAfterMenu = null
    return getCollapsedBoundsAfterExpandedMenuDrag(win.getBounds())
  }

  const restoreBounds = restoreCollapsedBoundsAfterMenu
  restoreCollapsedBoundsAfterMenu = null
  if (restoreBounds) return restoreBounds

  return getCollapsedFloatingBallBounds(getFloatingBallVisualCenter(win.getBounds()))
}

function getCollapsedBoundsAfterExpandedMenuDrag(bounds: Electron.Rectangle): Electron.Rectangle {
  const workArea = screen.getDisplayMatching(bounds).workArea
  const collapsedBounds = getCollapsedFloatingBallBounds(getFloatingBallVisualCenter(bounds))
  const target = getExpandedMenuEdgeSnapBounds(collapsedBounds, bounds, workArea)
  snappedEdge = target.edge
  return target.bounds
}

function scheduleMenuTransitionFallback(callback: () => void): void {
  clearPendingMenuTransitionFallback()
  pendingMenuTransitionFallback = setTimeout(() => {
    pendingMenuTransitionFallback = null
    callback()
  }, FLOATING_BALL_MENU_TRANSITION_FALLBACK_MS)
}

function clearPendingMenuTransitionFallback(): void {
  if (!pendingMenuTransitionFallback) return
  clearTimeout(pendingMenuTransitionFallback)
  pendingMenuTransitionFallback = null
}

function sendFloatingBallWindowState(win: BrowserWindow, phase: FloatingBallWindowPhase): void {
  win.webContents.send("floating-ball:window-state", {
    phase,
    expandedSize: EXPANDED_WINDOW_SIZE,
  })
}

function applyFloatingBallEdgeSnap(win: BrowserWindow): void {
  const bounds = fixedCollapsedBounds(win.getBounds())
  const workArea = screen.getDisplayMatching(bounds).workArea
  const target = getEdgeSnapBounds(bounds, workArea)
  snappedEdge = target.edge
  if (target.edge === "none") return
  win.setBounds(target.bounds)
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

function boundsMoved(before: Electron.Rectangle, after: Electron.Rectangle): boolean {
  return before.x !== after.x || before.y !== after.y
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
