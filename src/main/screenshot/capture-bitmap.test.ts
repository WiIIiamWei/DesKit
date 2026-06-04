import type { NativeImage, Rectangle } from "electron"
import { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { desktopCapturer, nativeImage, screen } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { captureSelectionBitmap, macOSSelectionRect } from "./capture-bitmap"

const selection = {
  displayId: "display-1",
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  displayWidth: 1440,
  displayHeight: 900,
  scaleFactor: 2,
}

let tempDir = ""

describe("capture bitmap", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-capture-bitmap-"))
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      {
        bounds: { x: 100, y: 200, width: 1440, height: 900 },
        id: "display-1",
        scaleFactor: 2,
      } as unknown as Electron.Display,
    ])
    vi.mocked(nativeImage.createFromPath).mockReturnValue(createImage(600, 400))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true })
    vi.clearAllMocks()
  })

  it("converts macOS selections to physical global screen rectangles", () => {
    expect(macOSSelectionRect(selection)).toEqual({
      x: 220,
      y: 440,
      width: 600,
      height: 400,
    })
  })

  it("uses native screencapture on macOS", async () => {
    const runScreencapture = vi.fn().mockResolvedValue(undefined)

    const result = await captureSelectionBitmap(selection, {
      platform: "darwin",
      runScreencapture,
      userDataDir: tempDir,
    })

    expect(desktopCapturer.getSources).not.toHaveBeenCalled()
    expect(runScreencapture).toHaveBeenCalledTimes(1)
    expect(runScreencapture.mock.calls[0]?.[0]).toEqual([
      "-x",
      "-t",
      "png",
      "-R",
      "220,440,600,400",
      expect.stringMatching(/capture-\d+\.png$/),
    ])
    expect(result).toMatchObject({ width: 600, height: 400 })
  })

  it("keeps desktopCapturer capture on non-macOS platforms", async () => {
    const crop = vi.fn((rect: Rectangle) => createImage(rect.width, rect.height))
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      {
        display_id: "display-1",
        appIcon: createImage(1, 1),
        id: "screen:1",
        name: "Display 1",
        thumbnail: {
          crop,
        } as unknown as NativeImage,
      },
    ])

    const result = await captureSelectionBitmap(selection, {
      platform: "win32",
      userDataDir: tempDir,
    })

    expect(crop).toHaveBeenCalledWith({ x: 20, y: 40, width: 600, height: 400 })
    expect(result).toMatchObject({ width: 600, height: 400 })
  })
})

function createImage(width: number, height: number): NativeImage {
  return {
    crop: vi.fn((rect: Rectangle) => createImage(rect.width, rect.height)),
    getSize: vi.fn(() => ({ width, height })),
    toPNG: vi.fn(() => Buffer.from("capture")),
  } as unknown as NativeImage
}
