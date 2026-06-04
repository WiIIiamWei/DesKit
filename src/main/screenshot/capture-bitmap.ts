import type { Rectangle } from "electron"
import type { CaptureRegionBitmap, ScreenshotSelection } from "./types"
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"
import { promisify } from "node:util"
import { desktopCapturer, nativeImage, screen } from "electron"
import { selectionPixelSize } from "./capture-region"
import { ensureScreenshotTempDir } from "./screenshot-store"

const execFileAsync = promisify(execFile)

export interface CaptureSelectionBitmapDeps {
  platform?: NodeJS.Platform
  runScreencapture?: (args: string[]) => Promise<void>
  userDataDir: string
}

export async function captureSelectionBitmap(
  selection: ScreenshotSelection,
  deps: CaptureSelectionBitmapDeps
): Promise<CaptureRegionBitmap> {
  if ((deps.platform ?? process.platform) === "darwin") {
    return captureMacOSSelectionBitmap(selection, deps)
  }
  return captureDesktopSelectionBitmap(selection, deps)
}

async function captureDesktopSelectionBitmap(
  selection: ScreenshotSelection,
  deps: CaptureSelectionBitmapDeps
): Promise<CaptureRegionBitmap> {
  const size = selectionPixelSize(selection)
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(selection.displayWidth * selection.scaleFactor),
      height: Math.round(selection.displayHeight * selection.scaleFactor),
    },
  })
  const source =
    sources.find((candidate) => candidate.display_id === selection.displayId) ?? sources[0]
  if (!source) throw new Error("No screen capture source is available")

  const crop = source.thumbnail.crop({
    x: Math.round(selection.x * selection.scaleFactor),
    y: Math.round(selection.y * selection.scaleFactor),
    width: size.width,
    height: size.height,
  })
  const dir = await ensureScreenshotTempDir(deps.userDataDir)
  const imagePath = path.join(dir, `capture-${Date.now()}.png`)
  await fs.writeFile(imagePath, crop.toPNG())
  return {
    imagePath,
    ...size,
  }
}

async function captureMacOSSelectionBitmap(
  selection: ScreenshotSelection,
  deps: CaptureSelectionBitmapDeps
): Promise<CaptureRegionBitmap> {
  const dir = await ensureScreenshotTempDir(deps.userDataDir)
  const imagePath = path.join(dir, `capture-${Date.now()}.png`)
  const rect = macOSSelectionRect(selection)
  const runScreencapture = deps.runScreencapture ?? defaultRunScreencapture
  try {
    await runScreencapture([
      "-x",
      "-t",
      "png",
      "-R",
      `${rect.x},${rect.y},${rect.width},${rect.height}`,
      imagePath,
    ])
    const image = nativeImage.createFromPath(imagePath)
    const size = image.getSize()
    return {
      imagePath,
      height: size.height,
      width: size.width,
    }
  } catch (error) {
    await fs.rm(imagePath, { force: true }).catch(() => {})
    throw error
  }
}

export function macOSSelectionRect(selection: ScreenshotSelection): Rectangle {
  const display = screen
    .getAllDisplays()
    .find((candidate) => String(candidate.id) === selection.displayId)
  const scaleFactor = display?.scaleFactor ?? selection.scaleFactor
  const bounds = display?.bounds ?? {
    x: 0,
    y: 0,
    width: selection.displayWidth,
    height: selection.displayHeight,
  }
  return {
    x: Math.round((bounds.x + selection.x) * scaleFactor),
    y: Math.round((bounds.y + selection.y) * scaleFactor),
    width: Math.round(selection.width * scaleFactor),
    height: Math.round(selection.height * scaleFactor),
  }
}

async function defaultRunScreencapture(args: string[]): Promise<void> {
  await execFileAsync("/usr/sbin/screencapture", args)
}
