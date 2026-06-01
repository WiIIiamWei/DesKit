import type { CaptureRegionBitmap, ScreenshotSelection } from "./types"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { desktopCapturer } from "electron"
import { selectionPixelSize } from "./capture-region"
import { ensureScreenshotTempDir } from "./screenshot-store"

export interface CaptureSelectionBitmapDeps {
  userDataDir: string
}

export async function captureSelectionBitmap(
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
