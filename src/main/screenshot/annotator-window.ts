import type { BrowserWindow, WebContents } from "electron"
import type { ScreenshotAction } from "./types"
import * as path from "node:path"
import { BrowserWindow as ElectronBrowserWindow, nativeImage, screen } from "electron"
import { attachWindowSecurity } from "../window-security"

const ANNOTATOR_HASH = "screenshot-annotator"

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

function getAnnotatorInitialBounds(imagePath: string): { width: number; height: number } {
  const size = nativeImage.createFromPath(imagePath).getSize()
  if (size.width <= 0 || size.height <= 0) return { width: 900, height: 640 }

  const workArea = screen.getPrimaryDisplay().workAreaSize
  const minWidth = 280
  const minHeight = 160
  const maxWidth = Math.max(minWidth, Math.round(workArea.width * 0.82))
  const maxHeight = Math.max(minHeight, Math.round(workArea.height * 0.82))
  const minScale = Math.max(1, minWidth / size.width, minHeight / size.height)
  const maxScale = Math.min(maxWidth / size.width, maxHeight / size.height)
  const scale = Math.min(minScale, maxScale)

  return {
    width: Math.max(minWidth, Math.round(size.width * scale)),
    height: Math.max(minHeight, Math.round(size.height * scale)),
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
