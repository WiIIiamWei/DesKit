import type { BrowserWindow as BrowserWindowType, WebContents } from "electron"
import type { PinnedImageOptions, PinnedImageState } from "./types"
import * as path from "node:path"
import { BrowserWindow, nativeImage, screen } from "electron"
import { attachWindowSecurity } from "../window-security"

export const DEFAULT_PINNED_IMAGE_OPACITY = 1
export const MIN_PINNED_IMAGE_OPACITY = 0.2
export const MAX_PINNED_IMAGE_OPACITY = 1
const PINNED_IMAGE_HASH = "pinned-image"

export interface PinnedImageWindowDeps {
  rendererDevUrl: string | undefined
  appOrigin: string
}

const pinnedImages = new Map<number, PinnedImageState>()

export function createPinnedImageState(
  id: string,
  imagePath: string,
  options: PinnedImageOptions = {}
): PinnedImageState {
  return {
    id,
    imagePath,
    opacity: normalizePinnedImageOpacity(options.opacity),
  }
}

export function normalizePinnedImageOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PINNED_IMAGE_OPACITY
  }
  return clamp(value, MIN_PINNED_IMAGE_OPACITY, MAX_PINNED_IMAGE_OPACITY)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function createPinnedImageWindow(
  state: PinnedImageState,
  deps: PinnedImageWindowDeps
): BrowserWindowType {
  const bounds = getPinnedImageInitialBounds(state.imagePath)
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 120,
    minHeight: 80,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "DesKit Pinned Image",
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
  win.setOpacity(state.opacity)
  const webContentsId = win.webContents.id
  pinnedImages.set(webContentsId, state)
  win.on("closed", () => pinnedImages.delete(webContentsId))
  const url = deps.rendererDevUrl
    ? `${deps.rendererDevUrl}#${PINNED_IMAGE_HASH}`
    : `${deps.appOrigin}/index.html#${PINNED_IMAGE_HASH}`
  void win.loadURL(url)
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show()
  })
  return win
}

function getPinnedImageInitialBounds(imagePath: string): { width: number; height: number } {
  const size = nativeImage.createFromPath(imagePath).getSize()
  if (size.width <= 0 || size.height <= 0) return { width: 480, height: 320 }

  const workArea = screen.getPrimaryDisplay().workAreaSize
  const maxWidth = Math.max(240, Math.round(workArea.width * 0.7))
  const maxHeight = Math.max(160, Math.round(workArea.height * 0.7))
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height)

  return {
    width: Math.max(120, Math.round(size.width * scale)),
    height: Math.max(80, Math.round(size.height * scale)),
  }
}

export function getPinnedImageDataUrl(sender: WebContents): string | null {
  const state = pinnedImages.get(sender.id)
  if (!state) return null
  return nativeImage.createFromPath(state.imagePath).toDataURL()
}

export function closePinnedImageWindow(sender: WebContents): void {
  BrowserWindow.fromWebContents(sender)?.close()
}

export function setPinnedImageOpacity(sender: WebContents, opacity: number): void {
  const state = pinnedImages.get(sender.id)
  const win = BrowserWindow.fromWebContents(sender)
  if (!state || !win) return
  const next = normalizePinnedImageOpacity(opacity)
  pinnedImages.set(sender.id, { ...state, opacity: next })
  win.setOpacity(next)
}
