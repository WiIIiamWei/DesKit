import type { BrowserWindow, WebContents } from "electron"
import type { ScreenshotAction } from "./types"
import * as path from "node:path"
import { BrowserWindow as ElectronBrowserWindow, nativeImage, screen } from "electron"
import { attachWindowSecurity } from "../window-security"

const ANNOTATOR_HASH = "screenshot-annotator"
const ANNOTATOR_TOOLBAR_MIN_WIDTH = 760
const ANNOTATOR_TOOLBAR_STACK_HEIGHT = 64

export interface ScreenshotAnnotatorDeps {
  rendererDevUrl: string | undefined
  appOrigin: string
}

export interface ScreenshotAnnotationResult {
  action: Extract<ScreenshotAction, "copy" | "save" | "pin">
  dataUrl: string
}

interface ActiveAnnotator {
  imagePath: string
  resolve: (result: ScreenshotAnnotationResult | null) => void
  win: BrowserWindow
}

let activeAnnotator: ActiveAnnotator | null = null

export function openScreenshotAnnotator(
  deps: ScreenshotAnnotatorDeps,
  imagePath: string
): Promise<ScreenshotAnnotationResult | null> {
  if (activeAnnotator && !activeAnnotator.win.isDestroyed()) {
    activeAnnotator.win.focus()
    return Promise.resolve(null)
  }

  const bounds = getAnnotatorInitialBounds(imagePath)
  const win = new ElectronBrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 280,
    minHeight: 160,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: "DesKit Screenshot Annotator",
    backgroundColor: "#00000000",
    hasShadow: false,
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
    ? `${deps.rendererDevUrl}#${ANNOTATOR_HASH}`
    : `${deps.appOrigin}/index.html#${ANNOTATOR_HASH}`
  void win.loadURL(url)

  return new Promise((resolve) => {
    activeAnnotator = { imagePath, resolve, win }
    win.on("closed", () => {
      if (activeAnnotator?.win === win) {
        activeAnnotator.resolve(null)
        activeAnnotator = null
      }
    })
    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) win.show()
    })
  })
}

export function getAnnotatorInitialBounds(imagePath: string): { width: number; height: number } {
  const size = nativeImage.createFromPath(imagePath).getSize()
  if (size.width <= 0 || size.height <= 0) return { width: 900, height: 640 }

  const workArea = screen.getPrimaryDisplay().workAreaSize
  const minWidth = 280
  const minHeight = 160
  const maxWidth = Math.max(minWidth, Math.round(workArea.width * 0.82))
  const maxHeight = Math.max(minHeight, Math.round(workArea.height * 0.82))
  const maxImageHeight = Math.max(80, maxHeight - ANNOTATOR_TOOLBAR_STACK_HEIGHT)
  const scale = Math.min(1, maxWidth / size.width, maxImageHeight / size.height)
  const imageWidth = Math.round(size.width * scale)
  const imageHeight = Math.round(size.height * scale)

  return {
    width: Math.min(maxWidth, Math.max(minWidth, ANNOTATOR_TOOLBAR_MIN_WIDTH, imageWidth)),
    height: Math.min(maxHeight, Math.max(minHeight, imageHeight + ANNOTATOR_TOOLBAR_STACK_HEIGHT)),
  }
}

export function getScreenshotAnnotatorImage(sender: WebContents): string | null {
  const annotator = activeAnnotator
  if (!annotator || ElectronBrowserWindow.fromWebContents(sender) !== annotator.win) return null
  return nativeImage.createFromPath(annotator.imagePath).toDataURL()
}

export function completeScreenshotAnnotation(
  sender: WebContents,
  result: ScreenshotAnnotationResult
): void {
  const annotator = activeAnnotator
  if (!annotator || ElectronBrowserWindow.fromWebContents(sender) !== annotator.win) return
  activeAnnotator = null
  annotator.resolve(result)
  annotator.win.destroy()
}

export function cancelScreenshotAnnotation(sender: WebContents): void {
  const annotator = activeAnnotator
  if (!annotator || ElectronBrowserWindow.fromWebContents(sender) !== annotator.win) return
  activeAnnotator = null
  annotator.resolve(null)
  annotator.win.destroy()
}
