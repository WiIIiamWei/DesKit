import type { BrowserWindow, WebContents } from "electron"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { BrowserWindow as ElectronBrowserWindow, nativeImage, screen } from "electron"
import { attachWindowSecurity } from "../window-security"
import {
  isOcrWorkerReady,
  OcrEngineLoadError,
  OcrTimeoutError,
  recognizeScreenshotText,
} from "./ocr-engine"

const OCR_HASH = "screenshot-ocr"
export const MAX_SCREENSHOT_OCR_PIXELS = 12_000_000

export interface ScreenshotOcrDeps {
  rendererDevUrl: string | undefined
  appOrigin: string
}

export interface ScreenshotOcrCapture {
  height: number
  imagePath: string
  width: number
}

export interface ScreenshotOcrState {
  error?: string
  imageDataUrl?: string
  isLoading: boolean
  message?: string
  text: string
}

interface ActiveOcrWindow {
  runId: number
  state: ScreenshotOcrState
  win: BrowserWindow
}

let activeOcrWindow: ActiveOcrWindow | null = null
let nextRunId = 0

export function openScreenshotOcrWindow(
  deps: ScreenshotOcrDeps,
  capture: ScreenshotOcrCapture
): void {
  const ocr = ensureScreenshotOcrWindow(deps)
  ocr.win.focus()

  if (isOversized(capture)) {
    const hadPreviousResult = Boolean(ocr.state.imageDataUrl)
    ocr.state = hadPreviousResult
      ? {
          ...ocr.state,
          message: "选择区域过大，请重新选择较小区域",
        }
      : {
          error: "选择区域过大，请重新选择较小区域",
          isLoading: false,
          text: "",
        }
    notifyOcrWindow(ocr)
    void fs.rm(capture.imagePath, { force: true }).catch(() => {})
    return
  }

  const imageDataUrl = nativeImage.createFromPath(capture.imagePath).toDataURL()
  ocr.runId = nextRunId++
  ocr.state = {
    imageDataUrl,
    isLoading: true,
    message: isOcrWorkerReady() ? "正在识别文字..." : "正在加载 OCR 引擎...",
    text: "",
  }
  notifyOcrWindow(ocr)
  void runOcr(ocr, ocr.runId, capture.imagePath)
}

export function getScreenshotOcrState(sender: WebContents): ScreenshotOcrState | null {
  const ocr = activeOcrWindow
  if (!ocr || ElectronBrowserWindow.fromWebContents(sender) !== ocr.win) return null
  return ocr.state
}

export function closeScreenshotOcrWindow(sender: WebContents): boolean {
  const ocr = activeOcrWindow
  if (!ocr || ElectronBrowserWindow.fromWebContents(sender) !== ocr.win) return false
  activeOcrWindow = null
  ocr.win.destroy()
  return true
}

export function isScreenshotOcrWindow(sender: WebContents): boolean {
  const ocr = activeOcrWindow
  return Boolean(ocr && ElectronBrowserWindow.fromWebContents(sender) === ocr.win)
}

export function showScreenshotOcrMessage(sender: WebContents, message: string): void {
  const ocr = activeOcrWindow
  if (!ocr || ElectronBrowserWindow.fromWebContents(sender) !== ocr.win) return
  ocr.state = {
    ...ocr.state,
    message,
  }
  notifyOcrWindow(ocr)
}

function ensureScreenshotOcrWindow(deps: ScreenshotOcrDeps): ActiveOcrWindow {
  const current = activeOcrWindow
  if (current && !current.win.isDestroyed()) return current

  const workArea = screen.getPrimaryDisplay().workAreaSize
  const win = new ElectronBrowserWindow({
    width: Math.min(900, Math.max(720, Math.round(workArea.width * 0.7))),
    height: Math.min(560, Math.max(460, Math.round(workArea.height * 0.62))),
    minWidth: 640,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    title: "截图 OCR",
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
    ? `${deps.rendererDevUrl}#${OCR_HASH}`
    : `${deps.appOrigin}/index.html#${OCR_HASH}`
  void win.loadURL(url)

  win.on("closed", () => {
    if (activeOcrWindow?.win === win) activeOcrWindow = null
  })
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show()
  })

  activeOcrWindow = {
    runId: nextRunId++,
    state: {
      isLoading: false,
      text: "",
    },
    win,
  }
  return activeOcrWindow
}

async function runOcr(
  ocr: ActiveOcrWindow | null,
  runId: number,
  imagePath: string
): Promise<void> {
  if (!ocr) return
  try {
    const text = await recognizeScreenshotText(imagePath)
    if (activeOcrWindow !== ocr || ocr.runId !== runId) return
    ocr.state = {
      ...ocr.state,
      error: undefined,
      isLoading: false,
      message: text ? undefined : "未识别到文字，请重新选择包含文字的区域",
      text,
    }
  } catch (error) {
    if (activeOcrWindow !== ocr || ocr.runId !== runId) return
    ocr.state = {
      ...ocr.state,
      error: ocrErrorMessage(error),
      isLoading: false,
      message: undefined,
      text: "",
    }
  } finally {
    await fs.rm(imagePath, { force: true }).catch(() => {})
    if (activeOcrWindow === ocr && ocr.runId === runId) notifyOcrWindow(ocr)
  }
}

function ocrErrorMessage(error: unknown): string {
  if (error instanceof OcrTimeoutError) {
    return "识别超时，请重新截图"
  }
  if (error instanceof OcrEngineLoadError) {
    return "引擎加载失败，请重新安装或更新插件"
  }
  return "识别失败，请重新截图"
}

function isOversized(capture: ScreenshotOcrCapture): boolean {
  return capture.width * capture.height > MAX_SCREENSHOT_OCR_PIXELS
}

function notifyOcrWindow(ocr: ActiveOcrWindow): void {
  if (!ocr.win.isDestroyed()) ocr.win.webContents.send("screenshot:ocr-updated")
}
