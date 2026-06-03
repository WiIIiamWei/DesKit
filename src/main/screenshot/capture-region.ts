import type {
  CaptureRegionBitmap,
  CaptureRegionResult,
  ScreenshotSelection,
  ScreenshotSelectionResult,
} from "./types"

export interface CaptureRegionDeps {
  selectRegion: () => Promise<ScreenshotSelectionResult | null>
  captureSelection: (selection: ScreenshotSelection) => Promise<CaptureRegionBitmap>
}

export async function captureRegion(
  deps: CaptureRegionDeps
): Promise<(CaptureRegionResult & Pick<ScreenshotSelectionResult, "action">) | null> {
  const result = await deps.selectRegion()
  if (!result) return null

  const bitmap = await deps.captureSelection(result.selection)
  return {
    ...bitmap,
    displayId: result.selection.displayId,
    action: result.action,
  }
}

export function selectionPixelSize(selection: ScreenshotSelection): {
  width: number
  height: number
} {
  return {
    width: Math.round(selection.width * selection.scaleFactor),
    height: Math.round(selection.height * selection.scaleFactor),
  }
}

export function hasUsableSelection(selection: ScreenshotSelection): boolean {
  return (
    Number.isFinite(selection.x) &&
    Number.isFinite(selection.y) &&
    Number.isFinite(selection.width) &&
    Number.isFinite(selection.height) &&
    Number.isFinite(selection.displayWidth) &&
    Number.isFinite(selection.displayHeight) &&
    Number.isFinite(selection.scaleFactor) &&
    selection.width > 0 &&
    selection.height > 0 &&
    selection.displayWidth > 0 &&
    selection.displayHeight > 0 &&
    selection.scaleFactor > 0 &&
    selection.displayId.trim() !== ""
  )
}
