import { describe, expect, it } from "vitest"
import { ManifestValidationError, parsePluginManifest } from "./manifest-loader"

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "com.deskit.test",
    name: "Test",
    displayName: { en: "Test", "zh-CN": "测试" },
    description: "A test plugin",
    version: "0.3.0",
    author: "DesKit",
    engines: { deskit: "^0.2.0" },
    main: "dist/index.js",
    contributes: {
      commands: [
        {
          id: "test.run",
          title: "Run",
          mode: "view",
        },
      ],
    },
    permissions: ["storage:plugin"],
    ...overrides,
  }
}

describe("parsePluginManifest", () => {
  it("accepts a valid manifest", () => {
    const parsed = parsePluginManifest(manifest())
    expect(parsed.id).toBe("com.deskit.test")
    expect(parsed.contributes.commands[0]?.mode).toBe("view")
  })

  it("accepts lucide icons in plugin and command manifests", () => {
    const parsed = parsePluginManifest(
      manifest({
        icon: "lucide:puzzle",
        contributes: {
          commands: [
            {
              id: "test.run",
              title: "Run",
              mode: "view",
              icon: "lucide:clock",
            },
          ],
        },
      })
    )
    expect(parsed.icon).toBe("lucide:puzzle")
    expect(parsed.contributes.commands[0]?.icon).toBe("lucide:clock")
  })

  it("accepts packaged image paths in plugin and command manifests", () => {
    const parsed = parsePluginManifest(
      manifest({
        icon: "assets/plugin.svg",
        contributes: {
          commands: [
            {
              id: "test.run",
              title: "Run",
              mode: "view",
              icon: "assets/command.png",
            },
          ],
        },
      })
    )
    expect(parsed.icon).toBe("assets/plugin.svg")
    expect(parsed.contributes.commands[0]?.icon).toBe("assets/command.png")
  })

  it("rejects remote icon URLs in plugin manifests", () => {
    expect(() =>
      parsePluginManifest(
        manifest({
          icon: "https://example.com/icon.png",
        })
      )
    ).toThrow(ManifestValidationError)
  })

  it("rejects non-image icon paths in plugin manifests", () => {
    expect(() =>
      parsePluginManifest(
        manifest({
          icon: "dist/index.js",
        })
      )
    ).toThrow(ManifestValidationError)
  })

  it("accepts clipboard activation events", () => {
    const parsed = parsePluginManifest(
      manifest({
        contributes: {
          activationEvents: ["clipboard:change"],
          commands: [{ id: "test.run", title: "Run", mode: "view" }],
        },
        permissions: ["clipboard:read"],
      })
    )
    expect(parsed.contributes.activationEvents).toEqual(["clipboard:change"])
  })

  it("accepts shortcut preferences that target contributed commands", () => {
    const parsed = parsePluginManifest(
      manifest({
        contributes: {
          commands: [{ id: "test.run", title: "Run", mode: "view" }],
          preferences: [
            {
              id: "openShortcut",
              type: "shortcut",
              label: "Open shortcut",
              default: "Super+Control+C",
              command: "test.run",
            },
          ],
        },
      })
    )

    expect(parsed.contributes.preferences?.[0]).toMatchObject({
      id: "openShortcut",
      type: "shortcut",
      command: "test.run",
    })
  })

  it("rejects shortcut preferences without a command", () => {
    expect(() =>
      parsePluginManifest(
        manifest({
          contributes: {
            commands: [{ id: "test.run", title: "Run", mode: "view" }],
            preferences: [
              {
                id: "openShortcut",
                type: "shortcut",
                label: "Open shortcut",
                default: "Super+Control+C",
              },
            ],
          },
        })
      )
    ).toThrow(ManifestValidationError)
  })

  it("rejects shortcut preferences that target missing commands", () => {
    expect(() =>
      parsePluginManifest(
        manifest({
          contributes: {
            commands: [{ id: "test.run", title: "Run", mode: "view" }],
            preferences: [
              {
                id: "openShortcut",
                type: "shortcut",
                label: "Open shortcut",
                default: "Super+Control+C",
                command: "missing.run",
              },
            ],
          },
        })
      )
    ).toThrow(ManifestValidationError)
  })

  it("rejects clipboard activation events without clipboard read permission", () => {
    expect(() =>
      parsePluginManifest(
        manifest({
          contributes: {
            activationEvents: ["clipboard:change"],
            commands: [{ id: "test.run", title: "Run", mode: "view" }],
          },
          permissions: [],
        })
      )
    ).toThrow(ManifestValidationError)
  })

  it("rejects unknown activation events", () => {
    expect(() =>
      parsePluginManifest(
        manifest({
          contributes: {
            activationEvents: ["window:focus"],
            commands: [{ id: "test.run", title: "Run", mode: "view" }],
          },
        })
      )
    ).toThrow(ManifestValidationError)
  })

  it("rejects missing required fields", () => {
    const raw = manifest()
    delete raw.main
    expect(() => parsePluginManifest(raw)).toThrow(ManifestValidationError)
  })

  it("rejects invalid command modes", () => {
    const raw = manifest({
      contributes: {
        commands: [{ id: "test.run", title: "Run", mode: "panel" }],
      },
    })
    expect(() => parsePluginManifest(raw)).toThrow(ManifestValidationError)
  })

  it("rejects invalid semantic versions", () => {
    expect(() => parsePluginManifest(manifest({ version: "next" }))).toThrow(
      ManifestValidationError
    )
  })

  it("rejects incompatible DesKit engine ranges", () => {
    expect(() =>
      parsePluginManifest(manifest({ engines: { deskit: "^2.0.0" } }), {
        hostVersion: "0.1.0",
      })
    ).toThrow(ManifestValidationError)
  })

  it("rejects manifest paths that escape the plugin directory", () => {
    expect(() => parsePluginManifest(manifest({ main: "../dist/index.js" }))).toThrow(
      ManifestValidationError
    )
  })
})
