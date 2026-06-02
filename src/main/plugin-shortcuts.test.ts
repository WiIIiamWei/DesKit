import type { PluginRegistryEntry } from "./plugins/types"
import { describe, expect, it } from "vitest"
import { collectPluginShortcutBindings, pluginShortcutId } from "./plugin-shortcuts"

const baseEntry: PluginRegistryEntry = {
  pluginId: "com.deskit.clipboard-history",
  rootDir: "plugin",
  source: { kind: "user", priority: 2 },
  status: "active",
  manifest: {
    id: "com.deskit.clipboard-history",
    name: "clipboard-history",
    displayName: "Clipboard History",
    description: "Clipboard History",
    version: "0.3.0",
    author: "DesKit",
    engines: { deskit: "^0.2.0" },
    main: "dist/index.js",
    contributes: {
      commands: [{ id: "clipboard-history.open", title: "Open", mode: "view" }],
      preferences: [
        {
          id: "openShortcut",
          type: "shortcut",
          label: "Open shortcut",
          default: "Super+Control+C",
          command: "clipboard-history.open",
        },
      ],
    },
    permissions: [],
  },
  preferences: {
    openShortcut: "Super+Control+C",
  },
}

describe("collectPluginShortcutBindings", () => {
  it("collects active shortcut preferences with their target command", () => {
    expect(collectPluginShortcutBindings([baseEntry])).toEqual([
      {
        id: pluginShortcutId("com.deskit.clipboard-history", "openShortcut"),
        pluginId: "com.deskit.clipboard-history",
        commandId: "clipboard-history.open",
        accelerator: "Super+Control+C",
      },
    ])
  })

  it("uses manifest defaults when no override is saved", () => {
    const entry = { ...baseEntry, preferences: {} }

    expect(collectPluginShortcutBindings([entry])[0]?.accelerator).toBe("Super+Control+C")
  })

  it("skips disabled plugins and empty shortcut overrides", () => {
    expect(
      collectPluginShortcutBindings([
        { ...baseEntry, status: "disabled" },
        { ...baseEntry, preferences: { openShortcut: "" } },
      ])
    ).toEqual([])
  })
})
