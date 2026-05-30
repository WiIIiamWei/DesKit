import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MarketplacePage } from "@/components/pages/marketplace-page"
import { installMarketplacePlugin, listMarketplacePlugins, listPlugins } from "@/lib/electron"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, options?: { defaultValue?: string; count?: number; source?: string }) => {
      const messages: Record<string, string> = {
        "marketplace.title": "Marketplace",
        "marketplace.subtitle": "Browse plugins.",
        "marketplace.searchPlaceholder": "Search",
        "marketplace.mockBadge": "Mock",
        "marketplace.installed": "Installed",
        "marketplace.installing": "Installing",
        "marketplace.unknownAuthor": "Unknown author",
        "marketplace.actions.install": "Install",
        "marketplace.actions.reinstall": "Reinstall",
        "marketplace.actions.installed": "Installed",
        "marketplace.actions.unavailable": "Unavailable",
        "marketplace.installState.install": "Available",
        "marketplace.installState.reinstall": "Installed",
        "marketplace.installState.installed": "Installed",
        "marketplace.installState.unavailable": "Preview",
        "marketplace.permissions.none": "No extra permissions",
        "marketplace.permissions.more": `+${options?.count ?? 0}`,
        "marketplace.protectedSource": `Provided by ${options?.source ?? ""}`,
        "marketplace.messages.installed": "Plugin installed.",
        "marketplace.category.all": "All",
        "permissions.storage:plugin": "Plugin storage",
        "plugins.source.builtin": "Builtin",
        "plugins.source.user": "Installed",
      }
      return messages[key] ?? options?.defaultValue ?? key
    },
  }),
}))

vi.mock("@/lib/electron", () => ({
  installMarketplacePlugin: vi.fn().mockResolvedValue({ pluginId: "com.deskit.notes" }),
  isElectron: () => true,
  listMarketplacePlugins: vi.fn(),
  listPlugins: vi.fn(),
  onPluginRegistryChanged: vi.fn(() => () => {}),
}))

describe("marketplacePage", () => {
  beforeEach(() => {
    vi.mocked(listMarketplacePlugins).mockResolvedValue([
      {
        id: "com.deskit.notes",
        name: "Notes",
        displayName: "Quick Notes",
        description: "Save notes",
        version: "0.1.0",
        category: "productivity",
        sourcePath: "plugins/com.deskit.notes",
        permissions: ["storage:plugin"],
      },
      {
        id: "com.deskit.builtin",
        name: "Builtin",
        displayName: "Builtin Tool",
        description: "Protected tool",
        version: "0.1.0",
        category: "utilities",
        sourcePath: "plugins/com.deskit.builtin",
        permissions: [],
      },
    ])
    vi.mocked(listPlugins).mockResolvedValue([
      registryEntry("com.deskit.notes", "user"),
      registryEntry("com.deskit.builtin", "builtin"),
    ])
    vi.mocked(installMarketplacePlugin).mockClear()
  })

  it("shows reinstall for user plugins and disables protected installed plugins", async () => {
    render(<MarketplacePage />)

    expect(await screen.findByText("Quick Notes")).toBeInTheDocument()
    expect(screen.getByText("Plugin storage")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /reinstall/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /^installed$/i })).toBeDisabled()
    expect(screen.getByText("Provided by Builtin")).toBeInTheDocument()
  })

  it("calls marketplace install when reinstalling a user plugin", async () => {
    const user = userEvent.setup()
    render(<MarketplacePage />)

    await user.click(await screen.findByRole("button", { name: /reinstall/i }))

    expect(installMarketplacePlugin).toHaveBeenCalledWith("com.deskit.notes", "0.1.0")
  })
})

function registryEntry(
  pluginId: string,
  source: DeskitPluginSourceKind
): DeskitPluginRegistryEntry {
  return {
    pluginId,
    rootDir: `/plugins/${pluginId}`,
    source: { kind: source, priority: source === "builtin" ? 3 : 2 },
    status: "active",
    manifest: {
      id: pluginId,
      name: pluginId,
      displayName: pluginId,
      description: pluginId,
      version: "0.1.0",
      author: "DesKit",
      engines: { deskit: "^0.1.0" },
      main: "dist/index.js",
      contributes: { commands: [{ id: "test.run", title: "Run", mode: "view" }] },
      permissions: [],
    },
  }
}
