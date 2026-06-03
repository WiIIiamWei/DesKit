import type { ClipboardContent, NetworkRequestOptions, NetworkResponse } from "@deskit/plugin-sdk"
import type { CaptureScreenOptions, PluginBridgeAdapters } from "./plugin-bridge"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { clipboard, desktopCapturer, nativeImage, Notification, shell } from "electron"

export function createElectronPluginAdapters(userDataDir: string): PluginBridgeAdapters {
  return {
    clipboard: {
      read: async () => readClipboardContent(),
      write: async (content) => writeClipboardContent(content),
    },
    notifications: {
      show: async (options) => {
        new Notification(options).show()
      },
    },
    network: {
      request: async (url, options) => requestNetwork(url, options),
    },
    system: {
      openUrl: async (url) => {
        const parsed = new URL(url)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("Only http(s) URLs can be opened by plugins")
        }
        await shell.openExternal(url)
      },
      openPath: async (targetPath) => {
        const error = await shell.openPath(targetPath)
        if (error) throw new Error(error)
      },
      captureScreen: async (pluginId, options) => captureScreen(userDataDir, pluginId, options),
      captureRegion: async () => {
        throw new Error("Region capture is not available in this host")
      },
      pinImage: async () => {
        throw new Error("Image pinning is not available in this host")
      },
    },
  }
}

async function requestNetwork(
  url: string,
  options?: NetworkRequestOptions
): Promise<NetworkResponse> {
  const controller = options?.timeoutMs ? new AbortController() : undefined
  const timeout = options?.timeoutMs
    ? setTimeout(() => controller?.abort(), options.timeoutMs)
    : undefined
  try {
    const response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: options?.headers,
      body: options?.body,
      signal: controller?.signal,
    })
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers,
      body: await response.text(),
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function readClipboardContent(): Promise<ClipboardContent | undefined> {
  const paths = readClipboardFilePaths()
  if (paths.length > 0) return { type: "file", paths }

  const text = clipboard.readText()
  if (text) return { type: "text", text }

  const image = clipboard.readImage()
  if (!image.isEmpty()) {
    const size = image.getSize()
    return {
      type: "image",
      dataUrl: image.toDataURL(),
      mimeType: "image/png",
      width: size.width,
      height: size.height,
    }
  }

  return undefined
}

function writeClipboardContent(content: ClipboardContent): void {
  if (content.type === "text") {
    clipboard.writeText(content.text)
    return
  }
  if (content.type === "image") {
    clipboard.writeImage(nativeImage.createFromDataURL(content.dataUrl))
    return
  }
  if (content.type === "file") {
    clipboard.writeText(content.paths.join("\n"))
  }
}

function readClipboardFilePaths(): string[] {
  const formats = new Set(clipboard.availableFormats())
  return uniquePaths([
    ...readNullSeparatedBufferPaths("FileNameW", "utf16le", formats),
    ...readNullSeparatedBufferPaths("FileName", "utf8", formats),
    ...readFileUrlTextFormat("public.file-url", formats),
    ...readUriListTextFormat("text/uri-list", formats),
    ...readGnomeCopiedFiles(formats),
  ])
}

function readNullSeparatedBufferPaths(
  format: string,
  encoding: BufferEncoding,
  formats: Set<string>
): string[] {
  if (!formats.has(format)) return []
  const raw = clipboard.readBuffer(format)
  if (raw.length === 0) return []
  return raw
    .toString(encoding)
    .split("\0")
    .map((item) => item.trim())
    .filter(Boolean)
}

function readFileUrlTextFormat(format: string, formats: Set<string>): string[] {
  if (!formats.has(format)) return []
  const value = clipboard.read(format).trim()
  return value ? decodeFileUrlList(value) : []
}

function readUriListTextFormat(format: string, formats: Set<string>): string[] {
  if (!formats.has(format)) return []
  return decodeFileUrlList(clipboard.read(format))
}

function readGnomeCopiedFiles(formats: Set<string>): string[] {
  const format = "x-special/gnome-copied-files"
  if (!formats.has(format)) return []
  const lines = clipboard
    .read(format)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const uriLines = lines[0] === "copy" || lines[0] === "cut" ? lines.slice(1) : lines
  return decodeFileUrlList(uriLines.join("\n"))
}

function decodeFileUrlList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(decodeFileUrl)
    .filter(Boolean)
}

function decodeFileUrl(value: string): string {
  if (!value.startsWith("file://")) return value
  try {
    return fileURLToPath(value)
  } catch {
    return ""
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => item.trim()).filter(Boolean))]
}

async function captureScreen(
  userDataDir: string,
  pluginId: string,
  options?: CaptureScreenOptions
): Promise<{ path: string }> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1920, height: 1080 },
  })
  const source = sources[0]
  if (!source) throw new Error("No screen source available")

  const fileName = `${safeFileName(options?.name ?? new Date().toISOString())}.png`
  const dir = path.join(userDataDir, "plugin-data", safeFileName(pluginId), "captures")
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, fileName)
  await fs.writeFile(filePath, source.thumbnail.toPNG())
  return { path: filePath }
}

function safeFileName(value: string): string {
  return value.replace(/[^\w.-]/g, "_")
}
