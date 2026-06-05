import type { ClipboardContent, NetworkRequestOptions, NetworkResponse } from "@deskit/plugin-sdk"
import type { CaptureScreenOptions, PluginBridgeAdapters } from "./plugin-bridge"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { clipboard, desktopCapturer, nativeImage, Notification, shell } from "electron"

export interface ElectronPluginAdaptersOptions {
  fetch?: typeof fetch
}

const MAX_NETWORK_RESPONSE_BODY_BYTES = 2 * 1024 * 1024

export function createElectronPluginAdapters(
  userDataDir: string,
  options: ElectronPluginAdaptersOptions = {}
): PluginBridgeAdapters {
  const fetchImpl = options.fetch ?? fetch
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
      request: async (url, options) => requestNetwork(fetchImpl, url, options),
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
  fetchImpl: typeof fetch,
  url: string,
  options?: NetworkRequestOptions
): Promise<NetworkResponse> {
  const controller = options?.timeoutMs ? new AbortController() : undefined
  const timeout = options?.timeoutMs
    ? setTimeout(() => controller?.abort(), options.timeoutMs)
    : undefined
  try {
    const response = await fetchImpl(url, {
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
      body: await readLimitedResponseText(response, MAX_NETWORK_RESPONSE_BODY_BYTES),
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function readClipboardContent(): Promise<ClipboardContent | undefined> {
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
  }
}

async function readLimitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length")
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error("Plugin network response body exceeds 2 MiB")
  }

  if (!response.body) {
    const text = await response.text()
    assertResponseSize(text, maxBytes)
    return text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) throw new Error("Plugin network response body exceeds 2 MiB")
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return new TextDecoder().decode(concatChunks(chunks, total))
}

function assertResponseSize(text: string, maxBytes: number): void {
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Plugin network response body exceeds 2 MiB")
  }
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
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
