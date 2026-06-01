import * as path from "node:path"
import { describe, expect, it } from "vitest"
import {
  screenshotFileName,
  screenshotSaveDir,
  screenshotSavePath,
  screenshotTempDir,
} from "./screenshot-store"

describe("screenshot store", () => {
  it("resolves the explicit screenshot save directory under Pictures", () => {
    expect(screenshotSaveDir("/Users/alice/Pictures")).toBe(
      path.join("/Users/alice/Pictures", "DesKit", "Screenshots")
    )
  })

  it("resolves the temp directory under userData", () => {
    expect(screenshotTempDir("/Users/alice/Library/Application Support/DesKit")).toBe(
      path.join("/Users/alice/Library/Application Support/DesKit", "screenshot-temp")
    )
  })

  it("formats screenshot filenames with local timestamp fields", () => {
    expect(screenshotFileName(new Date(2026, 5, 1, 9, 8, 7))).toBe(
      "Screenshot 2026-06-01 09.08.07.png"
    )
  })

  it("resolves the full explicit save path", () => {
    expect(screenshotSavePath("/tmp/Pictures", new Date(2026, 0, 2, 3, 4, 5))).toBe(
      path.join("/tmp/Pictures", "DesKit", "Screenshots", "Screenshot 2026-01-02 03.04.05.png")
    )
  })
})
