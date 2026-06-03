import { describe, expect, it } from "vitest"
import { pluginIconImageUrl } from "./plugin-icon-url"

describe("pluginIconImageUrl", () => {
  it("builds app protocol URLs for packaged image icons", () => {
    expect(pluginIconImageUrl("com.deskit.test", "assets/icon.png")).toBe(
      "app://app/plugin-icons/com.deskit.test?path=assets%2Ficon.png"
    )
  })

  it("does not build URLs for lucide icons", () => {
    expect(pluginIconImageUrl("com.deskit.test", "lucide:clock")).toBeUndefined()
  })

  it("does not build URLs for remote icons", () => {
    expect(pluginIconImageUrl("com.deskit.test", "https://example.com/icon.png")).toBeUndefined()
  })

  it("does not build URLs for paths that escape the plugin", () => {
    expect(pluginIconImageUrl("com.deskit.test", "../icon.png")).toBeUndefined()
    expect(pluginIconImageUrl("com.deskit.test", "/icon.png")).toBeUndefined()
  })
})
