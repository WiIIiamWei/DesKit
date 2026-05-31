import type { PluginCommandResult, PluginRegistryEntry } from "./types"
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

function makeHost(): PluginHost {
  return new PluginHost({
    userDataDir: dir,
    resourcesDir: path.join(dir, "resources"),
    adapters: noopAdapters,
  })
}

async function writeMarketplaceRegistry(plugins: unknown[]): Promise<void> {
  const registryPath = path.join(dir, "resources", "mock-marketplace", "registry.json")
  await fs.mkdir(path.dirname(registryPath), { recursive: true })
  await fs.writeFile(registryPath, JSON.stringify({ plugins }, null, 2), "utf-8")
}

async function writePlugin(
  relativeDir: string,
  pluginId: string,
  options: {
    version?: string
    title?: string
    commandId?: string
    exportedCommandId?: string
  } = {}
): Promise<string> {
  const pluginDir = path.join(dir, relativeDir)
  const commandId = options.commandId ?? `${pluginId.split(".").at(-1) ?? "plugin"}.run`
  const exportedCommandId = options.exportedCommandId ?? commandId
  await fs.mkdir(path.join(pluginDir, "dist"), { recursive: true })
  await fs.writeFile(
    path.join(pluginDir, "deskit.json"),
    JSON.stringify(
      {
        id: pluginId,
        name: pluginId.split(".").at(-1) ?? pluginId,
        displayName: options.title ?? "Test Plugin",
        description: "Test plugin",
        version: options.version ?? "0.1.0",
        author: "DesKit",
        engines: { deskit: "^0.1.0" },
        main: "dist/index.js",
        contributes: {
          commands: [{ id: commandId, title: options.title ?? "Run Plugin", mode: "view" }],
        },
        permissions: [],
      },
      null,
      2
    ),
    "utf-8"
  )
  await fs.writeFile(
    path.join(pluginDir, "dist", "index.js"),
    `module.exports = { commands: { ${JSON.stringify(exportedCommandId)}: { run() { return { type: "list", items: [] } } } } }\n`,
    "utf-8"
  )
  return pluginDir
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

describe("pluginHost.installFolder", () => {
  it("copies a valid plugin folder into the user plugin directory and loads it", async () => {
    const host = makeHost()
    await host.init()
    const sourceDir = await writePlugin("source-plugin", "com.deskit.local", {
      title: "Local Plugin",
    })

    const installed = await host.installFolder(sourceDir)

    expect(installed.pluginId).toBe("com.deskit.local")
    expect(installed.source.kind).toBe("user")
    expect(installed.status).toBe("active")
    await expect(
      fs.stat(path.join(dir, "plugins", "com.deskit.local", "deskit.json"))
    ).resolves.toBeTruthy()
    expect(host.searchCommands("local").map((command) => command.pluginId)).toContain(
      "com.deskit.local"
    )
  })

  it("rejects attempts to overwrite builtin plugins", async () => {
    const host = makeHost()
    await writePlugin("resources/builtin-plugins/com.deskit.protected", "com.deskit.protected")
    await host.init()
    const sourceDir = await writePlugin("source-protected", "com.deskit.protected")

    await expect(host.installFolder(sourceDir)).rejects.toBeInstanceOf(PluginInstallError)
  })

  it("rolls back an existing user plugin when the replacement cannot load", async () => {
    const host = makeHost()
    await host.init()
    const firstSource = await writePlugin("source-good", "com.deskit.rollback", {
      version: "0.1.0",
      title: "Rollback Good",
    })
    await host.installFolder(firstSource)

    const badSource = await writePlugin("source-bad", "com.deskit.rollback", {
      version: "0.2.0",
      exportedCommandId: "rollback.missing",
    })

    await expect(host.installFolder(badSource)).rejects.toBeInstanceOf(PluginInstallError)

    const restored = host.get("com.deskit.rollback")
    expect(restored?.status).toBe("active")
    expect(restored?.manifest?.version).toBe("0.1.0")
  })
})

describe("pluginHost.uninstall", () => {
  it("rejects active builtin plugins", async () => {
    const host = makeHost()
    vi.spyOn(host.registry, "get").mockReturnValue(baseEntry)

    await expect(host.uninstall("com.deskit.test")).rejects.toBeInstanceOf(
      PluginHostNotImplementedError
    )
  })

  it("removes invalid builtin plugin directories for cleanup", async () => {
    const host = makeHost()
    await host.preferences.load()
    const rootDir = path.join(dir, "resources", "builtin-plugins", "broken")
    await fs.mkdir(rootDir, { recursive: true })
    vi.spyOn(host.registry, "get").mockReturnValue({
      pluginId: "invalid:builtin:broken",
      rootDir,
      source: { kind: "builtin", priority: 3 },
      status: "invalid",
      error: "missing manifest",
    })
    vi.spyOn(host, "reload").mockResolvedValue(undefined)

    await host.uninstall("invalid:builtin:broken")

    await expect(fs.stat(rootDir)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("removes installed user plugin directories", async () => {
    const host = makeHost()
    await host.preferences.load()
    const rootDir = path.join(dir, "plugins", "com.deskit.user")
    await fs.mkdir(rootDir, { recursive: true })
    vi.spyOn(host.registry, "get").mockReturnValue({
      ...baseEntry,
      pluginId: "com.deskit.user",
      rootDir,
      source: { kind: "user", priority: 2 },
    })
    vi.spyOn(host, "reload").mockResolvedValue(undefined)

    await host.uninstall("com.deskit.user")

    await expect(fs.stat(rootDir)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("removes dev plugin references without deleting the source folder", async () => {
    const host = makeHost()
    await host.preferences.load()
    const rootDir = path.join(dir, "dev-plugin")
    const devFilePath = path.join(dir, "dev-plugins.json")
    await fs.mkdir(rootDir, { recursive: true })
    await fs.writeFile(devFilePath, `${JSON.stringify([{ path: rootDir }], null, 2)}\n`, "utf-8")
    vi.spyOn(host.registry, "get").mockReturnValue({
      ...baseEntry,
      pluginId: "com.deskit.dev",
      rootDir,
      source: { kind: "dev", priority: 1 },
    })
    vi.spyOn(host, "reload").mockResolvedValue(undefined)

    await host.uninstall("com.deskit.dev")

    await expect(fs.stat(rootDir)).resolves.toBeTruthy()
    await expect(fs.readFile(devFilePath, "utf-8")).resolves.toBe("[]\n")
  })
})

describe("pluginHost.listMarketplacePlugins", () => {
  it("returns an empty list when the mock registry is missing", async () => {
    const host = makeHost()

    await expect(host.listMarketplacePlugins()).resolves.toEqual([])
  })

  it("reads and normalizes the mock marketplace registry", async () => {
    const host = makeHost()
    const registryPath = path.join(dir, "resources", "mock-marketplace", "registry.json")
    await fs.mkdir(path.dirname(registryPath), { recursive: true })
    await fs.writeFile(
      registryPath,
      JSON.stringify({
        plugins: [
          {
            id: "com.deskit.market",
            name: "Market",
            displayName: { en: "Market", "zh-CN": "市场" },
            description: { en: "Demo" },
            author: "DesKit",
            version: "0.1.0",
            category: "tools",
            downloads: 1200,
            sourcePath: "plugins/com.deskit.market",
            permissions: ["storage:plugin"],
          },
          { id: 1, name: "bad" },
        ],
      }),
      "utf-8"
    )

    await expect(host.listMarketplacePlugins()).resolves.toEqual([
      {
        id: "com.deskit.market",
        name: "Market",
        displayName: { en: "Market", "zh-CN": "市场" },
        description: { en: "Demo" },
        author: "DesKit",
        version: "0.1.0",
        category: "tools",
        downloads: 1200,
        icon: undefined,
        packagePath: undefined,
        sourcePath: "plugins/com.deskit.market",
        permissions: ["storage:plugin"],
      },
    ])
  })
})

describe("pluginHost.installMarketplacePlugin", () => {
  it("installs a marketplace plugin from a relative sourcePath", async () => {
    const host = makeHost()
    await host.init()
    await writePlugin("resources/mock-marketplace/plugins/com.deskit.market", "com.deskit.market", {
      title: "Market Plugin",
    })
    await writeMarketplaceRegistry([
      {
        id: "com.deskit.market",
        name: "Market",
        version: "0.1.0",
        sourcePath: "plugins/com.deskit.market",
      },
    ])

    const installed = await host.installMarketplacePlugin("com.deskit.market", "0.1.0")

    expect(installed.pluginId).toBe("com.deskit.market")
    expect(installed.status).toBe("active")
    expect(host.searchCommands("market").map((command) => command.pluginId)).toContain(
      "com.deskit.market"
    )
  })

  it("rejects marketplace source paths that escape the registry directory", async () => {
    const host = makeHost()
    await host.init()
    await writeMarketplaceRegistry([
      {
        id: "com.deskit.escape",
        name: "Escape",
        version: "0.1.0",
        sourcePath: "../escape",
      },
    ])

    await expect(host.installMarketplacePlugin("com.deskit.escape", "0.1.0")).rejects.toThrow(
      /escapes/
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
