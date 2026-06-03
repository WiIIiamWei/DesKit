import type { PluginRegistryEntry } from "./plugins/types"
import type { FloatingBallFeature } from "./settings/settings"
import { defaultSettings } from "./settings/settings"

export function pruneUnavailableFloatingBallFeatures(
  features: FloatingBallFeature[],
  entries: PluginRegistryEntry[]
): FloatingBallFeature[] {
  const activePluginCommands = new Set<string>()

  for (const entry of entries) {
    if (entry.status !== "active" || !entry.manifest) continue

    for (const command of entry.manifest.contributes.commands) {
      activePluginCommands.add(pluginFeatureId(entry.pluginId, command.id))
    }
  }

  const next = features.filter((feature) => {
    if (!feature.startsWith("plugin:")) return true
    return activePluginCommands.has(feature)
  })

  return next.length > 0 ? next : [...defaultSettings.floatingBallFeatures]
}

function pluginFeatureId(pluginId: string, commandId: string): FloatingBallFeature {
  return `plugin:${pluginId}:${commandId}`
}
