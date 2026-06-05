export const PLUGIN_SYNC_PREFERENCE_PREFIX = "__sync."
export const MAX_PLUGIN_SYNC_VALUE_BYTES = 512 * 1024

export function pluginSyncPreferenceKey(key: string): string {
  const normalized = normalizePluginSyncKey(key)
  return `${PLUGIN_SYNC_PREFERENCE_PREFIX}${normalized}`
}

export function isPluginSyncPreferenceKey(key: string): boolean {
  return key.startsWith(PLUGIN_SYNC_PREFERENCE_PREFIX)
}

export function normalizePluginSyncPreferenceKey(key: string): string {
  if (!isPluginSyncPreferenceKey(key)) {
    throw new Error("Plugin sync preference keys must use the reserved sync prefix")
  }
  return pluginSyncPreferenceKey(key.slice(PLUGIN_SYNC_PREFERENCE_PREFIX.length))
}

export function visiblePluginPreferences(
  preferences: Record<string, unknown>
): Record<string, unknown> {
  const visible: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(preferences)) {
    if (!isPluginSyncPreferenceKey(key)) visible[key] = value
  }
  return visible
}

export function normalizePluginSyncKey(key: string): string {
  const normalized = key.trim()
  if (!/^[a-z0-9][\w.-]{0,79}$/i.test(normalized)) {
    throw new Error(
      "Plugin sync keys must be 1-80 characters of letters, numbers, dot, dash, or underscore"
    )
  }
  if (isPluginSyncPreferenceKey(normalized)) {
    throw new Error("Plugin sync keys must not use reserved prefixes")
  }
  return normalized
}

export function validatePluginSyncPreferenceValue(value: unknown): void {
  if (!isJsonCompatible(value)) {
    throw new Error("Plugin sync values must be JSON-compatible")
  }
  if (jsonSize(value) > MAX_PLUGIN_SYNC_VALUE_BYTES) {
    throw new Error("Plugin sync value exceeds 512 KiB")
  }
}

export function clonePluginSyncValue<T = unknown>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function jsonSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function isJsonCompatible(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonCompatible)
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonCompatible)
  }
  return false
}
