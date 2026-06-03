import type { PluginRegistryEntry } from "./plugins/types"

export interface PluginShortcutBinding {
  id: string
  pluginId: string
  commandId: string
  accelerator: string
}

export function collectPluginShortcutBindings(
  entries: PluginRegistryEntry[]
): PluginShortcutBinding[] {
  const bindings: PluginShortcutBinding[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (entry.status !== "active" || !entry.manifest) continue

    const commands = new Set(entry.manifest.contributes.commands.map((command) => command.id))
    for (const preference of entry.manifest.contributes.preferences ?? []) {
      if (preference.type !== "shortcut" || !preference.command) continue
      if (!commands.has(preference.command)) continue

      const value =
        entry.preferences && preference.id in entry.preferences
          ? entry.preferences[preference.id]
          : preference.default
      if (typeof value !== "string" || !value.trim()) continue

      const id = pluginShortcutId(entry.pluginId, preference.id)
      if (seen.has(id)) continue
      seen.add(id)
      bindings.push({
        id,
        pluginId: entry.pluginId,
        commandId: preference.command,
        accelerator: value.trim(),
      })
    }
  }

  return bindings
}

export function pluginShortcutId(pluginId: string, preferenceId: string): string {
  return `plugin-shortcut:${pluginId}:${preferenceId}`
}
