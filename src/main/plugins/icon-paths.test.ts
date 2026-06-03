import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { isPluginIconImagePath, isSafePluginIcon, resolvePluginIconFile } from "./icon-paths"

const ROOT = path.resolve("/plugins/com.deskit.test")

describe("plugin icon paths", () => {
  it("accepts lucide icon references", () => {
    expect(isSafePluginIcon("lucide:clipboard-list")).toBe(true)
  })

  it("accepts packaged image paths", () => {
    expect(isSafePluginIcon("assets/icon.svg")).toBe(true)
    expect(isPluginIconImagePath("icons/plugin.webp")).toBe(true)
  })

  it("rejects remote URLs", () => {
    expect(isSafePluginIcon("https://example.com/icon.png")).toBe(false)
  })

  it("rejects non-image paths", () => {
    expect(isSafePluginIcon("dist/index.js")).toBe(false)
  })

  it("rejects paths that escape the plugin root", () => {
    expect(resolvePluginIconFile(ROOT, "../secret.png")).toBeNull()
  })

  it("resolves image paths inside the plugin root", () => {
    expect(resolvePluginIconFile(ROOT, "assets/icon.png")).toBe(
      path.resolve(ROOT, "assets/icon.png")
    )
  })
})
