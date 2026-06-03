export interface ScreenshotSelection {
  displayId: string
  x: number
  y: number
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  scaleFactor: number
}

export type ScreenshotAction = "copy" | "save" | "pin" | "annotate"

export interface ScreenshotSelectionResult {
  selection: ScreenshotSelection
  action: ScreenshotAction
}

export interface CaptureRegionResult {
  imagePath: string
  width: number
  height: number
  displayId: string
}

export interface CaptureRegionBitmap {
  imagePath: string
  width: number
  height: number
}

export interface PinnedImageOptions {
  deleteOnClose?: boolean
  opacity?: number
}

export interface PinnedImageState {
  deleteOnClose: boolean
  id: string
  imagePath: string
  opacity: number
}
