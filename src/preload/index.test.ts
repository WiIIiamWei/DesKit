import { contextBridge, ipcRenderer } from "electron"
import { describe, expect, it, vi } from "vitest"
import "./index"

type ScreenshotAction = "copy" | "save" | "pin" | "annotate"

interface ExposedApi {
  cancelScreenshotSelection: () => void
  completeScreenshotSelection: (
    selection: { x: number; y: number; width: number; height: number },
    action: ScreenshotAction
  ) => void
  cancelScreenshotAnnotation: () => void
  completeScreenshotAnnotation: (
    dataUrl: string,
    action: Exclude<ScreenshotAction, "annotate">
  ) => void
  closePinnedImage: () => void
  closeScreenshotOcrWindow: () => void
  recaptureScreenshotOcr: () => void
}

function exposedApi(): ExposedApi {
  const expose = vi.mocked(contextBridge.exposeInMainWorld)
  expect(expose).toHaveBeenCalledWith("electronAPI", expect.any(Object))
  return expose.mock.calls[0][1] as ExposedApi
}

describe("preload screenshot IPC", () => {
  it("sends self-closing screenshot window actions without waiting for invoke replies", () => {
    const api = exposedApi()

    api.cancelScreenshotSelection()
    api.completeScreenshotSelection({ x: 1, y: 2, width: 3, height: 4 }, "copy")
    api.cancelScreenshotAnnotation()
    api.completeScreenshotAnnotation("data:image/png;base64,abc", "pin")
    api.closePinnedImage()
    api.closeScreenshotOcrWindow()
    api.recaptureScreenshotOcr()

    expect(ipcRenderer.send).toHaveBeenCalledWith("screenshot:selection-cancel")
    expect(ipcRenderer.send).toHaveBeenCalledWith("screenshot:selection-complete", {
      selection: { x: 1, y: 2, width: 3, height: 4 },
      action: "copy",
    })
    expect(ipcRenderer.send).toHaveBeenCalledWith("screenshot:annotation-cancel")
    expect(ipcRenderer.send).toHaveBeenCalledWith("screenshot:annotation-complete", {
      dataUrl: "data:image/png;base64,abc",
      action: "pin",
    })
    expect(ipcRenderer.send).toHaveBeenCalledWith("pinned-image:close")
    expect(ipcRenderer.send).toHaveBeenCalledWith("screenshot:ocr-close")
    expect(ipcRenderer.send).toHaveBeenCalledWith("screenshot:ocr-recapture")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("screenshot:selection-cancel")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("screenshot:annotation-cancel")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("pinned-image:close")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("screenshot:ocr-close")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("screenshot:ocr-recapture")
  })
})
