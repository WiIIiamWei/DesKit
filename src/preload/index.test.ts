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
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("screenshot:selection-cancel")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("screenshot:annotation-cancel")
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith("pinned-image:close")
  })
})

describe("preload floating ball IPC", () => {
  it("does not expose single-window resize handshakes", () => {
    const api = exposedApi() as unknown as Record<string, unknown>

    expect(api.finishFloatingBallExpandPreparation).toBeUndefined()
    expect(api.finishFloatingBallCollapseTransition).toBeUndefined()
    expect(api.onFloatingBallWindowState).toBeUndefined()
  })
})
