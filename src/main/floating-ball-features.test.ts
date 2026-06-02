import type { PluginRegistryEntry } from "./plugins/types"
import type { FloatingBallFeature } from "./settings/settings"
import { describe, expect, it } from "vitest"
import { pruneUnavailableFloatingBallFeatures } from "./floating-ball-features"

const clipboardEntry: PluginRegistryEntry = {
  pluginId: "com.deskit.clipboard-history",
  rootDir: "plugin",
  source: { kind: "user", priority: 2 },
  status: "active",
  manifest: {
    id: "com.deskit.clipboard-history",
    name: "clipboard-history",
    displayName: "Clipboard History",
    description: "Clipboard History",
    version: "0.3.1",
    author: "DesKit",
    engines: { deskit: "^0.2.0" },
    main: "dist/index.js",
    contributes: {
      commands: [{ id: "clipboard-history.open", title: "Open", mode: "view" }],
    },
    permissions: [],
  },
}

const timestampEntry: PluginRegistryEntry = {
  pluginId: "com.deskit.timestamp",
  rootDir: "timestamp",
  source: { kind: "user", priority: 2 },
  status: "active",
  manifest: {
    id: "com.deskit.timestamp",
    name: "timestamp",
    displayName: "Timestamp Converter",
    description: "Timestamp Converter",
    version: "0.3.1",
    author: "DesKit",
    engines: { deskit: "^0.2.0" },
    main: "dist/index.js",
    contributes: {
      commands: [{ id: "timestamp.convert", title: "Convert", mode: "view" }],
    },
    permissions: [],
  },
}

describe("pruneUnavailableFloatingBallFeatures", () => {
  it("keeps built-in features and active plugin commands", () => {
    const features: FloatingBallFeature[] = [
      "appLauncher",
      "plugin:com.deskit.clipboard-history:clipboard-history.open",
      "plugin:com.deskit.timestamp:timestamp.convert",
    ]

    expect(
      pruneUnavailableFloatingBallFeatures(features, [clipboardEntry, timestampEntry])
    ).toEqual(features)
  })

  it("removes plugin commands when the plugin is disabled", () => {
    const features: FloatingBallFeature[] = [
      "appLauncher",
      "plugin:com.deskit.clipboard-history:clipboard-history.open",
    ]

    expect(
      pruneUnavailableFloatingBallFeatures(features, [{ ...clipboardEntry, status: "disabled" }])
    ).toEqual(["appLauncher"])
  })

  it("removes plugin commands when the plugin is no longer registered", () => {
    const features: FloatingBallFeature[] = [
      "appLauncher",
      "plugin:com.deskit.clipboard-history:clipboard-history.open",
    ]

    expect(pruneUnavailableFloatingBallFeatures(features, [])).toEqual(["appLauncher"])
  })

  it("removes commands from crashed, invalid, and shadowed plugins", () => {
    const features: FloatingBallFeature[] = [
      "plugin:com.deskit.clipboard-history:clipboard-history.open",
      "plugin:com.deskit.timestamp:timestamp.convert",
      "plugin:com.deskit.shadowed:shadowed.open",
    ]

    expect(
      pruneUnavailableFloatingBallFeatures(features, [
        { ...clipboardEntry, status: "crashed" },
        { ...timestampEntry, status: "invalid" },
        {
          ...clipboardEntry,
          pluginId: "com.deskit.shadowed",
          status: "shadowed",
          manifest: {
            ...clipboardEntry.manifest!,
            id: "com.deskit.shadowed",
            contributes: {
              commands: [{ id: "shadowed.open", title: "Open", mode: "view" }],
            },
          },
        },
      ])
    ).toEqual(["appLauncher"])
  })

  it("removes stale command ids from active plugins", () => {
    const features: FloatingBallFeature[] = [
      "plugin:com.deskit.clipboard-history:clipboard-history.open",
      "plugin:com.deskit.clipboard-history:clipboard-history.missing",
    ]

    expect(pruneUnavailableFloatingBallFeatures(features, [clipboardEntry])).toEqual([
      "plugin:com.deskit.clipboard-history:clipboard-history.open",
    ])
  })
})
