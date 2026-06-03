import type {
  CaptureRegionResult,
  ClipboardContent,
  NetworkAPI,
  NetworkRequestOptions,
  NotificationAPI,
  PluginContext,
  PluginSyncAPI,
  PluginSyncStatus,
  StorageAPI,
  SystemAPI,
} from "@deskit/plugin-sdk"
import type { PluginManifest } from "./types"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"
import { createPermissionGate } from "./permissions"

export interface PluginRuntimeSnapshot {
  locale: string
  theme: { mode: "light" | "dark"; accent: string }
}

export interface CaptureScreenOptions {
  name?: string
}

export interface ClipboardAdapter {
  read: () => Promise<ClipboardContent | undefined>
  write: (content: ClipboardContent) => Promise<void>
}

export interface NotificationAdapter {
  show: NotificationAPI["show"]
}

export interface NetworkAdapter {
  request: NetworkAPI["request"]
}

export interface SystemAdapter {
  openUrl: SystemAPI["openUrl"]
  openPath: SystemAPI["openPath"]
  captureScreen: (pluginId: string, options?: CaptureScreenOptions) => Promise<{ path: string }>
  captureRegion: () => Promise<CaptureRegionResult | null>
  pinImage: (imagePath: string) => Promise<void>
}

export interface PluginSyncBridge {
  status: () => PluginSyncStatus
  get: (pluginId: string, key: string) => unknown | undefined
  set: (pluginId: string, key: string, value: unknown) => Promise<void>
  delete: (pluginId: string, key: string) => Promise<void>
}

export interface PluginBridgeAdapters {
  clipboard: ClipboardAdapter
  notifications: NotificationAdapter
  network: NetworkAdapter
  system: SystemAdapter
}

export interface PluginBridgeOptions {
  userDataDir: string
  adapters: PluginBridgeAdapters
  runtime?: () => PluginRuntimeSnapshot
  preferences?: (pluginId: string, manifest: PluginManifest) => Record<string, unknown>
  sync?: PluginSyncBridge
  storageFlushMs?: number
  clipboardPollMs?: number
}

export interface PluginContextOptions {
  networkTimeoutMs?: number
}

interface StorageState {
  loaded: boolean
  data: Record<string, unknown>
  flushTimer?: ReturnType<typeof setTimeout>
}

const defaultRuntime: PluginRuntimeSnapshot = {
  locale: "en",
  theme: { mode: "light", accent: "neutral" },
}
const DEFAULT_NETWORK_TIMEOUT_MS = 5_000
const MAX_NETWORK_TIMEOUT_MS = 60_000
const MAX_NETWORK_REQUEST_BODY_BYTES = 1024 * 1024

export class PluginBridge {
  private readonly storage = new Map<string, StorageState>()
  private readonly watchers = new Map<string, Set<ReturnType<typeof setInterval>>>()
  private readonly storageFlushMs: number
  private readonly clipboardPollMs: number

  constructor(private readonly options: PluginBridgeOptions) {
    this.storageFlushMs = options.storageFlushMs ?? 250
    this.clipboardPollMs = options.clipboardPollMs ?? 500
  }

  createContext(
    pluginId: string,
    manifest: PluginManifest,
    contextOptions: PluginContextOptions = {}
  ): PluginContext {
    const gate = createPermissionGate(manifest)
    const runtime = this.options.runtime?.() ?? defaultRuntime

    return {
      pluginId,
      locale: runtime.locale,
      theme: runtime.theme,
      preferences: {
        ...preferencesFromManifest(manifest),
        ...(this.options.preferences?.(pluginId, manifest) ?? {}),
      },
      storage: this.createStorageAPI(pluginId, gate),
      sync: this.createSyncAPI(pluginId, gate),
      clipboard: {
        read: async () => {
          gate.check("clipboard:read")
          return this.options.adapters.clipboard.read()
        },
        write: async (content) => {
          gate.check("clipboard:write")
          await this.options.adapters.clipboard.write(content)
        },
        watch: (listener) => {
          gate.check("clipboard:read")
          return this.watchClipboard(pluginId, listener)
        },
        readText: async () => {
          gate.check("clipboard:read")
          const content = await this.options.adapters.clipboard.read()
          return content?.type === "text" ? content.text : ""
        },
        writeText: async (text) => {
          gate.check("clipboard:write")
          await this.options.adapters.clipboard.write({ type: "text", text })
        },
      },
      notifications: {
        show: async (options) => {
          gate.check("notification")
          await this.options.adapters.notifications.show(options)
        },
      },
      network: {
        request: async (url, options) => {
          gate.check("network:http")
          return this.options.adapters.network.request(
            normalizeHttpUrl(url),
            normalizeNetworkRequestOptions(options, contextOptions.networkTimeoutMs)
          )
        },
      },
      system: {
        openUrl: async (url) => {
          gate.check("system:open-url")
          await this.options.adapters.system.openUrl(url)
        },
        openPath: async (targetPath) => {
          gate.check("system:open-path")
          await this.options.adapters.system.openPath(targetPath)
        },
        captureScreen: async (options) => {
          gate.check("system:capture-screen")
          return this.options.adapters.system.captureScreen(pluginId, options)
        },
        captureRegion: async () => {
          gate.check("system:capture-screen")
          return this.options.adapters.system.captureRegion()
        },
        pinImage: async (imagePath) => {
          gate.check("system:pin-image")
          await this.options.adapters.system.pinImage(imagePath)
        },
      },
      log: (...args) => {
        console.warn(`[plugin:${pluginId}]`, ...args)
      },
    }
  }

  async disposePlugin(pluginId: string): Promise<void> {
    const timers = this.watchers.get(pluginId)
    if (timers) {
      for (const timer of timers) clearInterval(timer)
      this.watchers.delete(pluginId)
    }
    await this.flushStorage(pluginId)
  }

  clearPluginData(pluginId: string): void {
    const state = this.storage.get(pluginId)
    if (state?.flushTimer) clearTimeout(state.flushTimer)
    this.storage.delete(pluginId)
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.storage.keys()].map((pluginId) => this.flushStorage(pluginId)))
  }

  storageFilePath(pluginId: string): string {
    return path.join(
      this.options.userDataDir,
      "plugin-data",
      `${safePluginFileName(pluginId)}.json`
    )
  }

  async readClipboardForHost(): Promise<ClipboardContent | undefined> {
    return this.options.adapters.clipboard.read()
  }

  private createStorageAPI(
    pluginId: string,
    gate: { check: (permission: string) => void }
  ): StorageAPI {
    return {
      get: async <T = unknown>(key: string) => {
        gate.check("storage:plugin")
        const state = await this.loadStorage(pluginId)
        return state.data[key] as T | undefined
      },
      set: async <T = unknown>(key: string, value: T) => {
        gate.check("storage:plugin")
        const state = await this.loadStorage(pluginId)
        state.data[key] = value
        await this.scheduleStorageFlush(pluginId)
      },
      delete: async (key: string) => {
        gate.check("storage:plugin")
        const state = await this.loadStorage(pluginId)
        delete state.data[key]
        await this.scheduleStorageFlush(pluginId)
      },
      list: async () => {
        gate.check("storage:plugin")
        const state = await this.loadStorage(pluginId)
        return Object.keys(state.data)
      },
    }
  }

  private createSyncAPI(
    pluginId: string,
    gate: { check: (permission: string) => void }
  ): PluginSyncAPI {
    return {
      status: async () => {
        gate.check("sync:plugin")
        return this.options.sync?.status() ?? { enabled: false, available: false }
      },
      get: async <T = unknown>(key: string) => {
        gate.check("sync:plugin")
        return this.options.sync?.get(pluginId, key) as T | undefined
      },
      set: async <T = unknown>(key: string, value: T) => {
        gate.check("sync:plugin")
        if (!this.options.sync) throw new Error("Plugin sync is not available")
        await this.options.sync.set(pluginId, key, value)
      },
      delete: async (key: string) => {
        gate.check("sync:plugin")
        if (!this.options.sync) throw new Error("Plugin sync is not available")
        await this.options.sync.delete(pluginId, key)
      },
    }
  }

  private async loadStorage(pluginId: string): Promise<StorageState> {
    const existing = this.storage.get(pluginId)
    if (existing?.loaded) return existing

    const state = existing ?? { loaded: false, data: {} }
    try {
      const raw = await fs.readFile(this.storageFilePath(pluginId), "utf-8")
      const parsed = JSON.parse(raw) as unknown
      state.data =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {}
    } catch (err) {
      if (!isFileNotFound(err) && !(err instanceof SyntaxError)) throw err
      state.data = {}
    }
    state.loaded = true
    this.storage.set(pluginId, state)
    return state
  }

  private async scheduleStorageFlush(pluginId: string): Promise<void> {
    if (this.storageFlushMs <= 0) {
      await this.flushStorage(pluginId)
      return
    }

    const state = this.storage.get(pluginId)
    if (!state || state.flushTimer) return

    state.flushTimer = setTimeout(() => {
      state.flushTimer = undefined
      void this.flushStorage(pluginId)
    }, this.storageFlushMs)
  }

  private async flushStorage(pluginId: string): Promise<void> {
    const state = this.storage.get(pluginId)
    if (!state?.loaded) return
    if (state.flushTimer) {
      clearTimeout(state.flushTimer)
      state.flushTimer = undefined
    }

    const filePath = this.storageFilePath(pluginId)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tempPath, `${JSON.stringify(state.data, null, 2)}\n`, "utf-8")
    await fs.rename(tempPath, filePath)
  }

  private watchClipboard(
    pluginId: string,
    listener: (content: ClipboardContent) => void
  ): () => void {
    let lastSerialized: string | undefined
    const timer = setInterval(() => {
      void this.options.adapters.clipboard
        .read()
        .then((content) => {
          if (!content) return
          const serialized = JSON.stringify(content)
          if (serialized === lastSerialized) return
          lastSerialized = serialized
          listener(content)
        })
        .catch((err) => {
          console.warn(`[plugin:${pluginId}] Clipboard watch read failed`, err)
        })
    }, this.clipboardPollMs)

    let timers = this.watchers.get(pluginId)
    if (!timers) {
      timers = new Set()
      this.watchers.set(pluginId, timers)
    }
    timers.add(timer)

    return () => {
      clearInterval(timer)
      timers.delete(timer)
      if (timers.size === 0) this.watchers.delete(pluginId)
    }
  }
}

function preferencesFromManifest(manifest: PluginManifest): Record<string, unknown> {
  const preferences: Record<string, unknown> = {}
  for (const preference of manifest.contributes.preferences ?? []) {
    if ("default" in preference) preferences[preference.id] = preference.default
  }
  return preferences
}

function safePluginFileName(pluginId: string): string {
  return pluginId.replace(/[^\w.-]/g, "_")
}

function normalizeHttpUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs can be requested by plugins")
  }
  return parsed.toString()
}

function normalizeNetworkRequestOptions(
  options?: NetworkRequestOptions,
  maxTimeoutMs = MAX_NETWORK_TIMEOUT_MS
): NetworkRequestOptions {
  const method = typeof options?.method === "string" ? options.method.toUpperCase() : "GET"
  const headers = normalizeNetworkHeaders(options?.headers)
  const body = normalizeNetworkRequestBody(options?.body)
  const timeoutMs = normalizeTimeoutMs(options?.timeoutMs, maxTimeoutMs)
  return {
    method,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  }
}

function normalizeNetworkHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {}
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") normalized[key] = value
  }
  return normalized
}

function normalizeNetworkRequestBody(body: unknown): string | undefined {
  if (typeof body !== "string") return undefined
  if (new TextEncoder().encode(body).byteLength > MAX_NETWORK_REQUEST_BODY_BYTES) {
    throw new Error("Plugin network request body exceeds 1 MiB")
  }
  return body
}

function normalizeTimeoutMs(timeoutMs: unknown, maxTimeoutMs: number): number | undefined {
  const cappedMaxTimeoutMs =
    Number.isFinite(maxTimeoutMs) && maxTimeoutMs > 0
      ? Math.min(maxTimeoutMs, MAX_NETWORK_TIMEOUT_MS)
      : MAX_NETWORK_TIMEOUT_MS
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Math.min(DEFAULT_NETWORK_TIMEOUT_MS, cappedMaxTimeoutMs)
  }
  return Math.min(timeoutMs, cappedMaxTimeoutMs)
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}
