import * as path from "node:path"

const SUPPORTED_PLUGIN_ICON_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
])

export function isSafeRelativePath(value: string): boolean {
  if (path.isAbsolute(value)) return false
  const normalized = value.replace(/\\/g, "/")
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false
  if (normalized.split("/").includes("..")) return false
  const posix = path.posix.normalize(normalized)
  return posix !== ".." && !posix.startsWith("../") && !posix.includes("/../")
}

export function isLucideIcon(value: string): boolean {
  return /^lucide:[a-z0-9][a-z0-9-]*$/i.test(value)
}

export function isPluginIconImagePath(value: string): boolean {
  return isSafeRelativePath(value) && SUPPORTED_PLUGIN_ICON_EXTENSIONS.has(iconExtension(value))
}

export function isSafePluginIcon(value: string): boolean {
  if (isLucideIcon(value)) return true
  return isPluginIconImagePath(value)
}

export function resolvePluginIconFile(rootDir: string, iconPath: string): string | null {
  if (!isPluginIconImagePath(iconPath)) return null
  const root = path.resolve(rootDir)
  const target = path.resolve(root, iconPath)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (target !== root && !target.startsWith(rootWithSep)) return null
  return target
}

function iconExtension(value: string): string {
  return path.extname(value).toLowerCase()
}
