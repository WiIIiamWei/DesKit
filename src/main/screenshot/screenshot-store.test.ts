import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import {
  cleanupScreenshotTempDir,
  deleteScreenshotTempFile,
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

  it("only deletes files inside the screenshot temp directory", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-store-"))
    const tempDir = screenshotTempDir(userDataDir)
    const ownedPath = path.join(tempDir, "capture.png")
    const externalPath = path.join(userDataDir, "external.png")
    await fs.mkdir(tempDir, { recursive: true })
    await fs.writeFile(ownedPath, "png")
    await fs.writeFile(externalPath, "png")

    await expect(deleteScreenshotTempFile(userDataDir, ownedPath)).resolves.toBe(true)
    await expect(deleteScreenshotTempFile(userDataDir, externalPath)).resolves.toBe(false)
    await expect(fs.stat(ownedPath)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(fs.stat(externalPath)).resolves.toBeTruthy()
  })

  it("cleans up stale screenshot temp files", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-store-"))
    const tempDir = screenshotTempDir(userDataDir)
    const oldPath = path.join(tempDir, "old.png")
    const freshPath = path.join(tempDir, "fresh.png")
    await fs.mkdir(tempDir, { recursive: true })
    await fs.writeFile(oldPath, "old")
    await fs.writeFile(freshPath, "fresh")
    await fs.utimes(oldPath, new Date(0), new Date(0))
    await fs.utimes(freshPath, new Date(10_000), new Date(10_000))

    await cleanupScreenshotTempDir(userDataDir, { maxAgeMs: 5_000, now: 10_000 })

    await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(fs.stat(freshPath)).resolves.toBeTruthy()
  })
})
