import type { BrowserWindow as BrowserWindowType } from "electron"
import { BrowserWindow } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createPinnedImageState,
  createPinnedImageWindow,
  normalizePinnedImageOpacity,
} from "./pinned-image-window"

type BrowserWindowMock = BrowserWindowType & {
  emit: (event: string, ...args: unknown[]) => void
}

describe("pinned image window", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a normalized pinned image state", () => {
    expect(createPinnedImageState("pin-1", "/tmp/capture.png", { opacity: 0.5 })).toEqual({
      id: "pin-1",
      imagePath: "/tmp/capture.png",
      opacity: 0.5,
    })
  })

  it("clamps opacity into the supported range", () => {
    expect(normalizePinnedImageOpacity(2)).toBe(1)
    expect(normalizePinnedImageOpacity(0.1)).toBe(0.2)
    expect(normalizePinnedImageOpacity(0.75)).toBe(0.75)
  })

  it("falls back to full opacity for invalid values", () => {
    expect(normalizePinnedImageOpacity(undefined)).toBe(1)
    expect(normalizePinnedImageOpacity(Number.NaN)).toBe(1)
    expect(normalizePinnedImageOpacity("0.5")).toBe(1)
  })

  it("does not read destroyed webContents while cleaning up a closed window", () => {
    const win = createPinnedImageWindow(createPinnedImageState("pin-1", "/tmp/capture.png"), {
      appOrigin: "app://app",
      rendererDevUrl: undefined,
    }) as BrowserWindowMock

    Object.defineProperty(win, "webContents", {
      get() {
        throw new Error("Object has been destroyed")
      },
    })

    expect(() => win.emit("closed")).not.toThrow()
    expect(BrowserWindow).toHaveBeenCalledTimes(1)
  })
})
