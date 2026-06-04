import type { NativeImage } from "electron"
import { nativeImage, screen } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getAnnotatorInitialBounds } from "./annotator-window"

describe("screenshot annotator window", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(screen.getPrimaryDisplay).mockReturnValue({
      workAreaSize: { height: 900, width: 1440 },
    } as ReturnType<typeof screen.getPrimaryDisplay>)
  })

  it("reserves space for the toolbar when the screenshot is small", () => {
    vi.mocked(nativeImage.createFromPath).mockReturnValue(createImageSize(153, 231))

    expect(getAnnotatorInitialBounds("/tmp/small.png")).toEqual({
      height: 295,
      width: 760,
    })
  })

  it("keeps large screenshots inside the work area after adding toolbar space", () => {
    vi.mocked(nativeImage.createFromPath).mockReturnValue(createImageSize(2000, 1200))

    const bounds = getAnnotatorInitialBounds("/tmp/large.png")

    expect(bounds.width).toBeLessThanOrEqual(1181)
    expect(bounds.height).toBeLessThanOrEqual(738)
    expect(bounds.height).toBeGreaterThan(64)
  })
})

function createImageSize(width: number, height: number): NativeImage {
  return {
    getSize: vi.fn(() => ({ height, width })),
    isEmpty: vi.fn(() => false),
    toDataURL: vi.fn(() => ""),
  } as unknown as NativeImage
}
