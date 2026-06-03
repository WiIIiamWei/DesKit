import type { NativeImage, Rectangle } from "electron"
import { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { desktopCapturer } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { captureSelectionBitmap, selectionCropRect } from "./capture-bitmap"

const selection = {
  displayId: "display-1",
  x: 120,
  y: 160,
  width: 640,
  height: 360,
  displayWidth: 1440,
  displayHeight: 900,
  scaleFactor: 2,
}

let tempDir = ""

describe("capture bitmap", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-capture-bitmap-"))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true })
    vi.clearAllMocks()
  })

  it("maps the selected region through the actual thumbnail size", () => {
    expect(selectionCropRect(selection, { width: 1440, height: 900 })).toEqual({
      x: 120,
      y: 160,
      width: 640,
      height: 360,
    })

    expect(selectionCropRect(selection, { width: 2880, height: 1800 })).toEqual({
      x: 240,
      y: 320,
      width: 1280,
      height: 720,
    })
  })

  it("keeps edge selections inside the thumbnail", () => {
    expect(
      selectionCropRect(
        {
          ...selection,
          x: 1438,
          y: 898,
          width: 20,
          height: 20,
        },
        { width: 1440, height: 900 }
      )
    ).toEqual({
      x: 1438,
      y: 898,
      width: 2,
      height: 2,
    })
  })

  it("crops against the actual desktopCapturer thumbnail dimensions", async () => {
    const crop = vi.fn((rect: Rectangle) => createImage(rect.width, rect.height))
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      {
        display_id: "display-1",
        appIcon: createImage(1, 1),
        id: "screen:1",
        name: "Display 1",
        thumbnail: {
          crop,
          getSize: vi.fn(() => ({ width: 1440, height: 900 })),
        } as unknown as NativeImage,
      },
    ])

    const result = await captureSelectionBitmap(selection, { userDataDir: tempDir })

    expect(crop).toHaveBeenCalledWith({ x: 120, y: 160, width: 640, height: 360 })
    expect(result).toMatchObject({ width: 640, height: 360 })
  })
})

function createImage(width: number, height: number): NativeImage {
  return {
    getSize: vi.fn(() => ({ width, height })),
    toPNG: vi.fn(() => Buffer.from("capture")),
  } as unknown as NativeImage
}
