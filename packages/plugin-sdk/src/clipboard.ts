/**
 * Clipboard payloads supported by the DesKit host.
 *
 * The shape is intentionally JSON-serialisable so clipboard-history plugins
 * can persist entries in `StorageAPI` without special codecs. P0 supports text,
 * image, and file-list payloads.
 */
export type ClipboardContent = ClipboardTextContent | ClipboardImageContent | ClipboardFileContent

export interface ClipboardTextContent {
  type: "text"
  text: string
}

export interface ClipboardImageContent {
  type: "image"
  /** PNG/JPEG/WebP data URL produced by the host from the OS clipboard. */
  dataUrl: string
  mimeType: "image/png" | "image/jpeg" | "image/webp" | string
  width?: number
  height?: number
  name?: string
}

export interface ClipboardFileContent {
  type: "file"
  paths: string[]
}

export type ClipboardActionValue = string | ClipboardContent
