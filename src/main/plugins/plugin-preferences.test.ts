import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { pluginPreferenceFilePath, PluginPreferenceStore } from "./plugin-preferences"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-prefs-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("pluginPreferenceFilePath", () => {
  it("anchors the file at userData/plugin-preferences.json", () => {
    expect(pluginPreferenceFilePath("/userData")).toBe(
      path.join("/userData", "plugin-preferences.json")
    )
  })
})

describe("pluginPreferenceStore", () => {
  it("returns empty data when the file does not exist", async () => {
    const store = new PluginPreferenceStore(path.join(dir, "missing.json"))
    await store.load()
    expect(store.get("com.deskit.test")).toEqual({})
  })

  it("recovers to empty data when the file is corrupt JSON", async () => {
    const file = path.join(dir, "broken.json")
    await fs.writeFile(file, "{ not valid json", "utf-8")
    const store = new PluginPreferenceStore(file)
    await store.load()
    expect(store.get("com.deskit.test")).toEqual({})
  })

  it("ignores non-object entries during normalization", async () => {
    const file = path.join(dir, "mixed.json")
    await fs.writeFile(
      file,
      JSON.stringify({
        "com.deskit.ok": { unit: "ms" },
        "com.deskit.bad-array": [1, 2, 3],
        "com.deskit.bad-string": "nope",
      }),
      "utf-8"
    )
    const store = new PluginPreferenceStore(file)
    await store.load()
    expect(store.get("com.deskit.ok")).toEqual({ unit: "ms" })
    expect(store.get("com.deskit.bad-array")).toEqual({})
    expect(store.get("com.deskit.bad-string")).toEqual({})
  })

  it("persists set + delete and survives reload", async () => {
    const file = path.join(dir, "store.json")
    const store = new PluginPreferenceStore(file)
    await store.load()
    await store.set("com.deskit.test", "unit", "s")
    await store.set("com.deskit.test", "limit", 10)

    const reopened = new PluginPreferenceStore(file)
    await reopened.load()
    expect(reopened.get("com.deskit.test")).toEqual({ unit: "s", limit: 10 })

    await reopened.set("com.deskit.test", "limit", undefined)
    expect(reopened.get("com.deskit.test")).toEqual({ unit: "s" })
  })

  it("exports and imports preference snapshots", async () => {
    const file = path.join(dir, "store.json")
    const store = new PluginPreferenceStore(file)
    await store.load()
    await store.set("com.deskit.test", "unit", "s")

    expect(store.exportAll()).toEqual({ "com.deskit.test": { unit: "s" } })

    await store.importPreferences({
      "com.deskit.test": { unit: "ms" },
      "com.deskit.pending": { enabled: true },
    })

    expect(store.get("com.deskit.test")).toEqual({ unit: "ms" })
    expect(store.get("com.deskit.pending")).toEqual({ enabled: true })
  })

  it("delete(pluginId) drops the whole plugin from the file", async () => {
    const file = path.join(dir, "store.json")
    const store = new PluginPreferenceStore(file)
    await store.load()
    await store.set("com.deskit.a", "x", 1)
    await store.set("com.deskit.b", "y", 2)
    await store.delete("com.deskit.a")

    const reopened = new PluginPreferenceStore(file)
    await reopened.load()
    expect(reopened.get("com.deskit.a")).toEqual({})
    expect(reopened.get("com.deskit.b")).toEqual({ y: 2 })
  })

  it("throws when used before load", () => {
    const store = new PluginPreferenceStore(path.join(dir, "unused.json"))
    expect(() => store.get("com.deskit.test")).toThrow(/must be loaded/)
  })
})
