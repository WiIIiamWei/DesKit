import type { BrowserWindow as BrowserWindowType, NativeImage } from "electron"
import { BrowserWindow, nativeImage } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { recognizeScreenshotText } from "./ocr-engine"
import {
  closeScreenshotOcrWindow,
  getScreenshotOcrState,
  isScreenshotOcrWindow,
  MAX_SCREENSHOT_OCR_PIXELS,
  openScreenshotOcrWindow,
} from "./ocr-window"

vi.mock("./ocr-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ocr-engine")>()
  return {
    ...actual,
    recognizeScreenshotText: vi.fn(),
  }
})

type BrowserWindowMock = BrowserWindowType & {
  emit: (event: string, ...args: unknown[]) => void
}

const deps = {
  appOrigin: "app://app",
  rendererDevUrl: undefined,
}

describe("screenshot OCR window", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(nativeImage.createFromPath).mockReturnValue({
      getSize: vi.fn(() => ({ width: 480, height: 320 })),
      isEmpty: vi.fn(() => false),
      toDataURL: vi.fn(() => "data:image/png;base64,capture"),
    } as unknown as NativeImage)
  })

  afterEach(() => {
    lastWindow()?.emit("closed")
  })

  it("ignores stale OCR results from an earlier capture", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    vi.mocked(recognizeScreenshotText)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    openScreenshotOcrWindow(deps, { height: 100, imagePath: "/tmp/first.png", width: 100 })
    const win = lastWindow()
    expect(win).toBeTruthy()

    openScreenshotOcrWindow(deps, { height: 100, imagePath: "/tmp/second.png", width: 100 })
    second.resolve("new text")

    await vi.waitFor(() => {
      expect(getScreenshotOcrState(win!.webContents)?.text).toBe("new text")
    })

    first.resolve("old text")
    await Promise.resolve()

    expect(getScreenshotOcrState(win!.webContents)?.text).toBe("new text")
  })

  it("keeps the previous OCR result when a recapture is too large", async () => {
    vi.mocked(recognizeScreenshotText).mockResolvedValue("previous text")

    openScreenshotOcrWindow(deps, { height: 100, imagePath: "/tmp/first.png", width: 100 })
    const win = lastWindow()
    await vi.waitFor(() => {
      expect(getScreenshotOcrState(win!.webContents)?.text).toBe("previous text")
    })

    openScreenshotOcrWindow(deps, {
      height: 1,
      imagePath: "/tmp/too-large.png",
      width: MAX_SCREENSHOT_OCR_PIXELS + 1,
    })

    expect(recognizeScreenshotText).toHaveBeenCalledTimes(1)
    expect(getScreenshotOcrState(win!.webContents)).toMatchObject({
      imageDataUrl: "data:image/png;base64,capture",
      message: "选择区域过大，请重新选择较小区域",
      text: "previous text",
    })
  })

  it("guards OCR-only window actions by sender", async () => {
    vi.mocked(recognizeScreenshotText).mockResolvedValue("")
    openScreenshotOcrWindow(deps, { height: 100, imagePath: "/tmp/capture.png", width: 100 })
    const ocrWindow = lastWindow()
    const otherWindow = new BrowserWindow() as BrowserWindowMock

    expect(isScreenshotOcrWindow(ocrWindow!.webContents)).toBe(true)
    expect(isScreenshotOcrWindow(otherWindow.webContents)).toBe(false)

    closeScreenshotOcrWindow(otherWindow.webContents)
    expect(ocrWindow!.destroy).not.toHaveBeenCalled()

    closeScreenshotOcrWindow(ocrWindow!.webContents)
    expect(ocrWindow!.destroy).toHaveBeenCalledTimes(1)
  })
})

function lastWindow(): BrowserWindowMock | undefined {
  const results = vi.mocked(BrowserWindow).mock.results
  return results.at(-1)?.value as BrowserWindowMock | undefined
}

function deferred<T>(): {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}
