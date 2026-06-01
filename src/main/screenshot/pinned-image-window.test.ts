import { describe, expect, it } from "vitest"
import { createPinnedImageState, normalizePinnedImageOpacity } from "./pinned-image-window"

describe("pinned image window", () => {
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
})
