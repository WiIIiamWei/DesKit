export function pluginIconImageUrl(pluginId?: string, icon?: string): string | undefined {
  if (!pluginId || !icon) return undefined
  if (icon.startsWith("lucide:")) return undefined
  if (!isLocalImageIconPath(icon)) return undefined
  return `app://app/plugin-icons/${encodeURIComponent(pluginId)}?path=${encodeURIComponent(icon)}`
}

function isLocalImageIconPath(icon: string): boolean {
  if (icon.startsWith("/") || icon.startsWith("\\")) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(icon)) return false
  if (icon.split(/[\\/]/).includes("..")) return false
  return /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(icon)
}
