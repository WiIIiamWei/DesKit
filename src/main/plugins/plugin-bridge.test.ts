/* eslint-disable react/naming-convention-context-name */
import type { ClipboardContent } from "@deskit/plugin-sdk"
import type { PluginBridgeAdapters } from "./plugin-bridge"
import type { PluginManifest } from "./types"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PermissionDenied } from "./permissions"
import { PluginBridge } from "./plugin-bridge"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-bridge-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("pluginBridge", () => {
  it("denies undeclared permissions", async () => {
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext("com.deskit.test", manifest({ permissions: [] }))

    await expect(pluginCtx.storage.set("key", "value")).rejects.toBeInstanceOf(PermissionDenied)
  })

  it("persists per-plugin storage as JSON", async () => {
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["storage:plugin"] })
    )

    await pluginCtx.storage.set("name", "DesKit")
    await pluginCtx.storage.set("count", 2)
    expect(await pluginCtx.storage.get("name")).toBe("DesKit")
    expect(await pluginCtx.storage.list()).toEqual(expect.arrayContaining(["name", "count"]))

    const raw = await fs.readFile(bridge.storageFilePath("com.deskit.test"), "utf-8")
    expect(JSON.parse(raw)).toEqual({ name: "DesKit", count: 2 })
  })

  it("stores plugin blobs outside JSON storage", async () => {
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["storage:plugin"] })
    )

    await expect(pluginCtx.storage.writeBlob("images/one.txt", "payload")).resolves.toMatchObject({
      key: "images/one.txt",
      size: 7,
    })
    await expect(pluginCtx.storage.readBlob("images/one.txt")).resolves.toBe("payload")
    await expect(pluginCtx.storage.listBlobs()).resolves.toEqual([
      expect.objectContaining({ key: "images/one.txt", size: 7 }),
    ])

    await pluginCtx.storage.deleteBlob("images/one.txt")
    await expect(pluginCtx.storage.readBlob("images/one.txt")).resolves.toBeUndefined()
  })

  it("rejects plugin blob keys that escape the blob directory", async () => {
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["storage:plugin"] })
    )

    await expect(pluginCtx.storage.writeBlob("../escape.txt", "payload")).rejects.toThrow(
      "Storage blob key is invalid"
    )
    await expect(pluginCtx.storage.writeBlob("nested/../escape.txt", "payload")).rejects.toThrow(
      "Storage blob key is invalid"
    )
  })

  it("routes plugin sync through permission-checked sync bridge", async () => {
    const sync = {
      status: vi.fn(() => ({ enabled: true, available: true })),
      get: vi.fn(() => ({ value: "remote" })),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    }
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      sync,
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["sync:plugin"] })
    )

    await expect(pluginCtx.sync.status()).resolves.toEqual({ enabled: true, available: true })
    await expect(pluginCtx.sync.get("history")).resolves.toEqual({ value: "remote" })
    await pluginCtx.sync.set("history", { value: "local" })
    await pluginCtx.sync.delete("history")

    expect(sync.get).toHaveBeenCalledWith("com.deskit.test", "history")
    expect(sync.set).toHaveBeenCalledWith("com.deskit.test", "history", { value: "local" })
    expect(sync.delete).toHaveBeenCalledWith("com.deskit.test", "history")
  })

  it("denies plugin sync without permission", async () => {
    const sync = {
      status: vi.fn(() => ({ enabled: true, available: true })),
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      sync,
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext("com.deskit.test", manifest({ permissions: [] }))

    await expect(pluginCtx.sync.status()).rejects.toBeInstanceOf(PermissionDenied)
    await expect(pluginCtx.sync.set("history", [])).rejects.toBeInstanceOf(PermissionDenied)
    expect(sync.status).not.toHaveBeenCalled()
    expect(sync.set).not.toHaveBeenCalled()
  })

  it("routes clipboard helpers through the adapter", async () => {
    const read = vi.fn<() => Promise<ClipboardContent | undefined>>(() =>
      Promise.resolve({ type: "text", text: "hello" })
    )
    const write = vi.fn<(content: ClipboardContent) => Promise<void>>(() => Promise.resolve())
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ clipboard: { read, write } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["clipboard:read", "clipboard:write"] })
    )

    await expect(pluginCtx.clipboard.readText()).resolves.toBe("hello")
    await pluginCtx.clipboard.write({
      type: "image",
      dataUrl: "data:image/png;base64,a",
      mimeType: "image/png",
    })

    expect(read).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({
      type: "image",
      dataUrl: "data:image/png;base64,a",
      mimeType: "image/png",
    })
  })

  it("keeps clipboard watchers alive when adapter reads fail", async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const read = vi
      .fn<() => Promise<ClipboardContent | undefined>>()
      .mockRejectedValueOnce(new Error("busy"))
      .mockResolvedValueOnce({ type: "text", text: "hello" })
    const listener = vi.fn()
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ clipboard: { read, write: async () => {} } }),
      storageFlushMs: 0,
      clipboardPollMs: 10,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["clipboard:read"] })
    )

    const unwatch = pluginCtx.clipboard.watch(listener)
    try {
      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(10)
    } finally {
      unwatch()
      vi.useRealTimers()
      warn.mockRestore()
    }

    expect(listener).toHaveBeenCalledWith({ type: "text", text: "hello" })
  })

  it("routes network requests through the adapter when permitted", async () => {
    const request = vi.fn(async () => ({
      url: "https://example.test/sync.json",
      status: 200,
      statusText: "OK",
      ok: true,
      headers: { "content-type": "application/json" },
      body: "{}",
    }))
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ network: { request } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["network:http"] })
    )

    await expect(
      pluginCtx.network.request("https://example.test/sync.json", {
        method: "put",
        headers: { Authorization: "Basic token" },
        body: "{}",
        timeoutMs: 120_000,
      })
    ).resolves.toMatchObject({ ok: true, body: "{}" })

    expect(request).toHaveBeenCalledWith("https://example.test/sync.json", {
      method: "PUT",
      headers: { Authorization: "Basic token" },
      body: "{}",
      timeoutMs: 60_000,
    })
  })

  it("uses a default network timeout when plugins omit one", async () => {
    const request = vi.fn(async () => ({
      url: "https://example.test/sync.json",
      status: 200,
      statusText: "OK",
      ok: true,
      headers: {},
      body: "",
    }))
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ network: { request } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["network:http"] })
    )

    await pluginCtx.network.request("https://example.test/sync.json")

    expect(request).toHaveBeenCalledWith("https://example.test/sync.json", {
      method: "GET",
      timeoutMs: 5_000,
    })
  })

  it("rejects oversized plugin network request bodies", async () => {
    const request = vi.fn()
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ network: { request } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["network:http"] })
    )

    await expect(
      pluginCtx.network.request("https://example.test/sync.json", {
        method: "PUT",
        body: "x".repeat(1024 * 1024 + 1),
      })
    ).rejects.toThrow("request body exceeds 1 MiB")
    expect(request).not.toHaveBeenCalled()
  })

  it("denies plugin network requests without permission", async () => {
    const request = vi.fn()
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ network: { request } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext("com.deskit.test", manifest({ permissions: [] }))

    await expect(pluginCtx.network.request("https://example.test")).rejects.toBeInstanceOf(
      PermissionDenied
    )
    expect(request).not.toHaveBeenCalled()
  })

  it("rejects non-http plugin network URLs", async () => {
    const request = vi.fn()
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ network: { request } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["network:http"] })
    )

    await expect(pluginCtx.network.request("file:///etc/passwd")).rejects.toThrow(
      "Only http(s) URLs can be requested"
    )
    expect(request).not.toHaveBeenCalled()
  })

  it("routes region capture and image pinning through permission-checked system adapters", async () => {
    const captureRegion = vi.fn().mockResolvedValue({
      imagePath: "/tmp/capture.png",
      width: 100,
      height: 80,
      displayId: "1",
    })
    const pinImage = vi.fn().mockResolvedValue(undefined)
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters({ system: { ...adapters().system, captureRegion, pinImage } }),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["system:capture-screen", "system:pin-image"] })
    )

    await expect(pluginCtx.system.captureRegion()).resolves.toEqual({
      imagePath: "/tmp/capture.png",
      width: 100,
      height: 80,
      displayId: "1",
    })
    await pluginCtx.system.pinImage("/tmp/capture.png")

    expect(captureRegion).toHaveBeenCalledTimes(1)
    expect(pinImage).toHaveBeenCalledWith("/tmp/capture.png")
  })

  it("denies image pinning without system:pin-image", async () => {
    const bridge = new PluginBridge({
      userDataDir: dir,
      adapters: adapters(),
      storageFlushMs: 0,
    })
    const pluginCtx = bridge.createContext(
      "com.deskit.test",
      manifest({ permissions: ["system:capture-screen"] })
    )

    await expect(pluginCtx.system.pinImage("/tmp/capture.png")).rejects.toMatchObject({
      permission: "system:pin-image",
    })
  })
})

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: "com.deskit.test",
    name: "Test",
    displayName: "Test",
    description: "test",
    version: "0.1.0",
    author: "DesKit",
    engines: { deskit: "^0.1.0" },
    main: "dist/index.js",
    contributes: { commands: [{ id: "test.run", title: "Run", mode: "view" }] },
    permissions: ["storage:plugin"],
    ...overrides,
  }
}

function adapters(overrides: Partial<PluginBridgeAdapters> = {}): PluginBridgeAdapters {
  return {
    clipboard: {
      read: async () => undefined,
      write: async () => {},
    },
    notifications: { show: async () => {} },
    network: {
      request: async (url) => ({
        url,
        status: 200,
        statusText: "OK",
        ok: true,
        headers: {},
        body: "",
      }),
    },
    system: {
      openUrl: async () => {},
      openPath: async () => {},
      captureScreen: async () => ({ path: "capture.png" }),
      captureRegion: async () => null,
      pinImage: async () => {},
    },
    ...overrides,
  }
}
