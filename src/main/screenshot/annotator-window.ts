import type { BrowserWindow, WebContents } from "electron"
import type { ScreenshotAction } from "./types"
import * as path from "node:path"
import { BrowserWindow as ElectronBrowserWindow, nativeImage } from "electron"
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

  const win = new ElectronBrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: "DesKit Screenshot Annotator",
    backgroundColor: "#111111",
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
    win.once("ready-to-show", () => win.show())
  })
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
