import type { ScreenshotSelection } from "./types"
import { describe, expect, it, vi } from "vitest"
import { captureRegion, hasUsableSelection, selectionPixelSize } from "./capture-region"

const selection: ScreenshotSelection = {
  displayId: "display-1",
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  displayWidth: 1440,
  displayHeight: 900,
  scaleFactor: 2,
}

describe("capture region", () => {
  it("returns null when the user cancels region selection", async () => {
    const captureSelection = vi.fn()

    await expect(
      captureRegion({
        selectRegion: async () => null,
        captureSelection,
      })
    ).resolves.toBeNull()
    expect(captureSelection).not.toHaveBeenCalled()
  })

  it("attaches display metadata to the captured bitmap", async () => {
    await expect(
      captureRegion({
        selectRegion: async () => ({ selection, action: "copy" }),
        captureSelection: async () => ({
          imagePath: "/tmp/capture.png",
          width: 600,
          height: 400,
        }),
      })
    ).resolves.toEqual({
      imagePath: "/tmp/capture.png",
      width: 600,
      height: 400,
      displayId: "display-1",
      action: "copy",
    })
  })

  it("converts DIP selection size to physical pixels", () => {
    expect(selectionPixelSize(selection)).toEqual({ width: 600, height: 400 })
  })

  it("rejects empty or invalid selections", () => {
    expect(hasUsableSelection(selection)).toBe(true)
    expect(hasUsableSelection({ ...selection, displayId: " " })).toBe(false)
    expect(hasUsableSelection({ ...selection, width: 0 })).toBe(false)
    expect(hasUsableSelection({ ...selection, height: -1 })).toBe(false)
    expect(hasUsableSelection({ ...selection, scaleFactor: 0 })).toBe(false)
    expect(hasUsableSelection({ ...selection, x: Number.NaN })).toBe(false)
  })
})
