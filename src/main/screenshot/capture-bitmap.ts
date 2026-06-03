import type { Rectangle, Size } from "electron"
import type { CaptureRegionBitmap, ScreenshotSelection } from "./types"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { desktopCapturer } from "electron"
import { ensureScreenshotTempDir } from "./screenshot-store"

export interface CaptureSelectionBitmapDeps {
  userDataDir: string
}

export async function captureSelectionBitmap(
  selection: ScreenshotSelection,
  deps: CaptureSelectionBitmapDeps
): Promise<CaptureRegionBitmap> {
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

  const cropRect = selectionCropRect(selection, source.thumbnail.getSize())
  const crop = source.thumbnail.crop(cropRect)
  const cropSize = crop.getSize()
  const dir = await ensureScreenshotTempDir(deps.userDataDir)
  const imagePath = path.join(dir, `capture-${Date.now()}.png`)
  await fs.writeFile(imagePath, crop.toPNG())
  return {
    imagePath,
    height: cropSize.height,
    width: cropSize.width,
  }
}

export function selectionCropRect(selection: ScreenshotSelection, thumbnailSize: Size): Rectangle {
  const scaleX = thumbnailSize.width / selection.displayWidth
  const scaleY = thumbnailSize.height / selection.displayHeight
  const x = clamp(Math.round(selection.x * scaleX), 0, Math.max(0, thumbnailSize.width - 1))
  const y = clamp(Math.round(selection.y * scaleY), 0, Math.max(0, thumbnailSize.height - 1))
  const availableWidth = Math.max(1, thumbnailSize.width - x)
  const availableHeight = Math.max(1, thumbnailSize.height - y)
  return {
    x,
    y,
    width: clamp(Math.round(selection.width * scaleX), 1, availableWidth),
    height: clamp(Math.round(selection.height * scaleY), 1, availableHeight),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
