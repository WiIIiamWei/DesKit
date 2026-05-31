import type { ClipboardContent } from "@deskit/plugin-sdk"
import type { PluginCommandResult, PluginRegistryEntry } from "./types"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  PluginHost,
  PluginHostNotImplementedError,
  PluginInstallError,
  PluginPreferenceTypeError,
} from "./plugin-host"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-host-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const noopAdapters = {
  clipboard: { read: async () => undefined, write: async () => {} },
  notifications: { show: async () => {} },
  system: {
    openUrl: async () => {},
    openPath: async () => {},
    captureScreen: async () => ({ path: "" }),
  },
}

function makeHostWithClipboard(
  read: () => Promise<ClipboardContent | undefined>,
  clipboardPollMs = 10
): PluginHost {
  return new PluginHost({
    userDataDir: dir,
    resourcesDir: path.join(dir, "resources"),
    clipboardPollMs,
    adapters: {
      ...noopAdapters,
      clipboard: { read, write: async () => {} },
    },
  })
}

function makeHost(): PluginHost {
  return new PluginHost({
    userDataDir: dir,
    resourcesDir: path.join(dir, "resources"),
    adapters: noopAdapters,
  })
}

function makeHostWithFetch(fetch: (url: string) => Promise<Response>): PluginHost {
  return new PluginHost({
    userDataDir: dir,
    resourcesDir: path.join(dir, "resources"),
    adapters: noopAdapters,
    fetch,
  })
}

const baseEntry: PluginRegistryEntry = {
  pluginId: "com.deskit.test",
  rootDir: path.join("dir", "test"),
  source: { kind: "builtin", priority: 3 },
  status: "active",
  manifest: {
    id: "com.deskit.test",
    name: "test",
    displayName: "Test",
    description: "test",
    version: "0.1.0",
    author: "DesKit",
    engines: { deskit: "^0.1.0" },
    main: "dist/index.js",
    contributes: {
      commands: [{ id: "test.run", title: "Run", mode: "view" }],
      preferences: [
        { id: "label", type: "text", label: "Label", default: "x" },
        { id: "limit", type: "number", label: "Limit", default: 10 },
        { id: "enabled", type: "checkbox", label: "Enabled", default: true },
        {
          id: "unit",
          type: "select",
          label: "Unit",
          default: "ms",
          options: [
            { value: "ms", label: "ms" },
            { value: "s", label: "s" },
          ],
        },
      ],
    },
    permissions: [],
  },
}

function marketplaceEntry(
  overrides: Partial<{
    downloadUrl: string
    sha256: string
  }> = {}
) {
  return {
    id: "com.deskit.timestamp",
    name: "timestamp",
    displayName: "Timestamp Converter",
    description: "Convert timestamps.",
    author: "DesKit",
    homepage: "https://github.com/WiIIiamWei/DesKit",
    version: "0.2.0",
    downloadUrl:
      overrides.downloadUrl ??
      "https://github.com/WiIIiamWei/DesKit/releases/download/v0.2.0/timestamp-0.2.0.deskit",
    sha256: overrides.sha256 ?? "0".repeat(64),
    deskitEngine: "^0.2.0",
    categories: ["utilities"],
  }
}

describe("pluginHost.setPreference value validation", () => {
  it("accepts well-typed values for each preference type", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.setPreference("com.deskit.test", "label", "hello")).resolves.toBeUndefined()
    await expect(host.setPreference("com.deskit.test", "limit", 42)).resolves.toBeUndefined()
    await expect(host.setPreference("com.deskit.test", "enabled", false)).resolves.toBeUndefined()
    await expect(host.setPreference("com.deskit.test", "unit", "s")).resolves.toBeUndefined()
  })

  it("rejects mistyped text values", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.setPreference("com.deskit.test", "label", 42)).rejects.toBeInstanceOf(
      PluginPreferenceTypeError
    )
  })

  it("rejects non-finite numbers", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(
      host.setPreference("com.deskit.test", "limit", Number.POSITIVE_INFINITY)
    ).rejects.toBeInstanceOf(PluginPreferenceTypeError)
    await expect(host.setPreference("com.deskit.test", "limit", "10")).rejects.toBeInstanceOf(
      PluginPreferenceTypeError
    )
  })

  it("rejects mistyped checkbox values", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.setPreference("com.deskit.test", "enabled", 1)).rejects.toBeInstanceOf(
      PluginPreferenceTypeError
    )
  })

  it("rejects select values not in the declared options", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.setPreference("com.deskit.test", "unit", "us")).rejects.toBeInstanceOf(
      PluginPreferenceTypeError
    )
  })

  it("allows undefined to clear a preference back to its default", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await host.setPreference("com.deskit.test", "label", "custom")
    await host.setPreference("com.deskit.test", "label", undefined)
    expect(host.preferences.get("com.deskit.test")).toEqual({})
  })

  it("rejects undeclared preference keys with a plain Error", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.setPreference("com.deskit.test", "unknownKey", "x")).rejects.toThrow(
      /Unknown plugin preference/
    )
  })
})

describe("pluginHost unsupported operations", () => {
  it("installFolder throws PluginHostNotImplementedError", async () => {
    const host = makeHost()
    await expect(host.installFolder("/some/path")).rejects.toBeInstanceOf(
      PluginHostNotImplementedError
    )
  })

  it("rejects protected-source uninstall", async () => {
    const host = makeHost()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.uninstall("com.deskit.test")).rejects.toBeInstanceOf(
      PluginHostNotImplementedError
    )
  })
})

describe("pluginHost package installation", () => {
  it("installs a .deskit package into user plugins", async () => {
    const host = makeHost()
    await host.init()
    const packagePath = path.resolve(
      "resources",
      "mock-marketplace",
      "packages",
      "timestamp-0.2.0.deskit"
    )

    const entry = await host.installPackage(packagePath)

    expect(entry.pluginId).toBe("com.deskit.timestamp")
    expect(entry.source.kind).toBe("user")
    expect(entry.status).toBe("active")
    await expect(
      fs.stat(path.join(dir, "plugins", "com.deskit.timestamp", "deskit.json"))
    ).resolves.toBeTruthy()
  })

  it("installs from marketplace after checksum verification", async () => {
    const packagePath = path.resolve(
      "resources",
      "mock-marketplace",
      "packages",
      "timestamp-0.2.0.deskit"
    )
    const packageBuffer = await fs.readFile(packagePath)
    const sha256 = createHash("sha256").update(packageBuffer).digest("hex")
    const host = makeHostWithFetch(async (url) => {
      if (url.endsWith("registry.json")) {
        return Response.json({ version: 1, plugins: [marketplaceEntry({ sha256 })] })
      }
      return new Response(packageBuffer)
    })
    await host.init()

    const entry = await host.installMarketplacePlugin("com.deskit.timestamp")

    expect(entry.pluginId).toBe("com.deskit.timestamp")
    expect(entry.source.kind).toBe("user")
    expect(entry.status).toBe("active")
  })

  it("rejects marketplace packages with mismatched checksums", async () => {
    const packagePath = path.resolve(
      "resources",
      "mock-marketplace",
      "packages",
      "timestamp-0.2.0.deskit"
    )
    const packageBuffer = await fs.readFile(packagePath)
    const host = makeHostWithFetch(async (url) => {
      if (url.endsWith("registry.json")) {
        return Response.json({
          version: 1,
          plugins: [marketplaceEntry({ sha256: "0".repeat(64) })],
        })
      }
      return new Response(packageBuffer)
    })
    await host.init()

    await expect(host.installMarketplacePlugin("com.deskit.timestamp")).rejects.toBeInstanceOf(
      PluginInstallError
    )
  })
})

describe("pluginHost facade forwards to registry", () => {
  it("list exposes defaults merged with persisted preferences", async () => {
    const host = makeHost()
    await host.preferences.load()
    vi.spyOn(host.registry, "list").mockReturnValue([baseEntry])

    await host.preferences.set("com.deskit.test", "label", "custom")

    expect(host.list()[0]?.preferences).toEqual({
      label: "custom",
      limit: 10,
      enabled: true,
      unit: "ms",
    })
  })

  it("searchCommands forwards locale + limit to the registry", () => {
    const host = makeHost()
    const spy = vi
      .spyOn(host.registry, "searchCommands")
      .mockReturnValue([] as PluginCommandResult[])
    host.searchCommands("ts", "zh-CN", 5)
    expect(spy).toHaveBeenCalledWith("ts", "zh-CN", 5)
  })
})

describe("pluginHost clipboard watcher", () => {
  it("starts only when a plugin listens for clipboard changes", async () => {
    vi.useFakeTimers()
    const read = vi.fn(async () => ({ type: "text", text: "hello" }) as ClipboardContent)
    const host = makeHostWithClipboard(read)
    await host.init()

    expect(read).not.toHaveBeenCalled()
    vi.spyOn(host.registry, "list").mockReturnValue([
      {
        ...baseEntry,
        manifest: {
          ...baseEntry.manifest!,
          contributes: {
            ...baseEntry.manifest!.contributes,
            activationEvents: ["clipboard:change"],
          },
        },
      },
    ])
    vi.spyOn(host.registry, "setEnabled").mockResolvedValue({
      ...baseEntry,
      manifest: {
        ...baseEntry.manifest!,
        contributes: {
          ...baseEntry.manifest!.contributes,
          activationEvents: ["clipboard:change"],
        },
      },
    })

    await host.setEnabled("com.deskit.test", true)
    await vi.runOnlyPendingTimersAsync()

    expect(read).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("stops after clipboard listener crashes", async () => {
    vi.useFakeTimers()
    const read = vi.fn(async () => ({ type: "text", text: "hello" }) as ClipboardContent)
    const host = makeHostWithClipboard(read)
    await host.init()

    let crashed = false
    const activeEntry: PluginRegistryEntry = {
      ...baseEntry,
      manifest: {
        ...baseEntry.manifest!,
        contributes: {
          ...baseEntry.manifest!.contributes,
          activationEvents: ["clipboard:change"],
        },
      },
    }
    vi.spyOn(host.registry, "list").mockImplementation(() =>
      crashed ? [{ ...activeEntry, status: "crashed" }] : [activeEntry]
    )
    vi.spyOn(host.registry, "setEnabled").mockResolvedValue(activeEntry)
    vi.spyOn(host.registry, "dispatchClipboardChange").mockImplementationOnce(async () => {
      crashed = true
      throw new Error("boom")
    })

    await host.setEnabled("com.deskit.test", true)
    await vi.runOnlyPendingTimersAsync()
    await vi.advanceTimersByTimeAsync(20)

    expect(read).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
