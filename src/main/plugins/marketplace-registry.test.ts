import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchMarketplaceRegistry,
  findMarketplaceEntry,
  MarketplaceRegistryError,
  parseMarketplaceRegistry,
} from "./marketplace-registry"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-marketplace-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("marketplace registry", () => {
  it("parses valid entries and filters incompatible engines", () => {
    const entries = parseMarketplaceRegistry(
      registryJson([
        registryEntry({ id: "com.deskit.ok" }),
        registryEntry({ id: "com.deskit.future", deskitEngine: "^999.0.0" }),
      ])
    )

    expect(entries.map((entry) => entry.id)).toEqual(["com.deskit.ok"])
  })

  it("rejects entries that do not use HTTPS download URLs", () => {
    expect(() =>
      parseMarketplaceRegistry(
        registryJson([registryEntry({ downloadUrl: "http://example.com/plugin.deskit" })])
      )
    ).toThrow(MarketplaceRegistryError)
  })

  it("accepts lucide marketplace icon references", () => {
    const entries = parseMarketplaceRegistry(
      registryJson([registryEntry({ id: "com.deskit.lucide", icon: "lucide:clock" })])
    )

    expect(entries.map((entry) => entry.icon)).toEqual(["lucide:clock"])
  })

  it("rejects packaged image marketplace icon paths", () => {
    expect(() =>
      parseMarketplaceRegistry(registryJson([registryEntry({ icon: "assets/icon.png" })]))
    ).toThrow(MarketplaceRegistryError)
  })

  it("rejects remote marketplace icon URLs", () => {
    expect(() =>
      parseMarketplaceRegistry(
        registryJson([registryEntry({ icon: "https://example.com/icon.png" })])
      )
    ).toThrow(MarketplaceRegistryError)
  })

  it("finds entries by id and optional version", () => {
    const entries = parseMarketplaceRegistry(
      registryJson([
        registryEntry({ id: "com.deskit.one", version: "1.0.0" }),
        registryEntry({ id: "com.deskit.one", version: "2.0.0" }),
      ])
    )

    expect(findMarketplaceEntry(entries, "com.deskit.one", "2.0.0")?.version).toBe("2.0.0")
    expect(findMarketplaceEntry(entries, "com.deskit.missing")).toBeUndefined()
  })

  it("falls back to the bundled registry when fetch fails", async () => {
    await writeBundledRegistry(registryJson([registryEntry({ id: "com.deskit.fallback" })]))
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })

    await expect(fetchMarketplaceRegistry({ fetch, resourcesDir: dir })).resolves.toMatchObject([
      { id: "com.deskit.fallback" },
    ])
  })

  it("falls back to the bundled registry on non-OK responses", async () => {
    await writeBundledRegistry(registryJson([registryEntry({ id: "com.deskit.offline" })]))
    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }))

    await expect(fetchMarketplaceRegistry({ fetch, resourcesDir: dir })).resolves.toMatchObject([
      { id: "com.deskit.offline" },
    ])
  })

  it("falls back to the bundled registry when the default registry is empty", async () => {
    await writeBundledRegistry(registryJson([registryEntry({ id: "com.deskit.demo" })]))
    const fetch = vi.fn(async () => Response.json({ version: 1, plugins: [] }))

    await expect(fetchMarketplaceRegistry({ fetch, resourcesDir: dir })).resolves.toMatchObject([
      { id: "com.deskit.demo" },
    ])
  })

  it("honors empty custom registries", async () => {
    await writeBundledRegistry(registryJson([registryEntry({ id: "com.deskit.demo" })]))
    const fetch = vi.fn(async () => Response.json({ version: 1, plugins: [] }))

    await expect(
      fetchMarketplaceRegistry({
        fetch,
        resourcesDir: dir,
        registryUrl: "https://example.com/registry.json",
      })
    ).resolves.toEqual([])
  })

  it("does not fall back when the default registry has incompatible entries", async () => {
    await writeBundledRegistry(registryJson([registryEntry({ id: "com.deskit.demo" })]))
    const fetch = vi.fn(async () =>
      Response.json({ version: 1, plugins: [registryEntry({ deskitEngine: "^999.0.0" })] })
    )

    await expect(fetchMarketplaceRegistry({ fetch, resourcesDir: dir })).resolves.toEqual([])
  })

  it("does not hide malformed fetched registries behind bundled data", async () => {
    await writeBundledRegistry(registryJson([registryEntry({ id: "com.deskit.fallback" })]))
    const fetch = vi.fn(async () => new Response("{}"))

    await expect(fetchMarketplaceRegistry({ fetch, resourcesDir: dir })).rejects.toBeInstanceOf(
      MarketplaceRegistryError
    )
  })
})

async function writeBundledRegistry(raw: string): Promise<void> {
  const registryDir = path.join(dir, "mock-marketplace")
  await fs.mkdir(registryDir, { recursive: true })
  await fs.writeFile(path.join(registryDir, "registry.json"), raw, "utf-8")
}

function registryJson(plugins: unknown[]): string {
  return JSON.stringify({ version: 1, plugins })
}

function registryEntry(
  overrides: Partial<{
    id: string
    version: string
    downloadUrl: string
    deskitEngine: string
    icon: string
  }> = {}
) {
  return {
    id: overrides.id ?? "com.deskit.test",
    name: "test",
    displayName: "Test",
    description: "Test plugin.",
    author: "DesKit",
    homepage: "https://github.com/WiIIiamWei/DesKit",
    version: overrides.version ?? "0.3.0",
    downloadUrl:
      overrides.downloadUrl ??
      "https://github.com/WiIIiamWei/DesKit/releases/download/v0.3.0/test-0.3.0.deskit",
    sha256: "a".repeat(64),
    deskitEngine: overrides.deskitEngine ?? "^0.2.0",
    icon: overrides.icon,
    categories: ["utilities"],
  }
}
