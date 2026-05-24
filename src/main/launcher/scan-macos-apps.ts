import type { AppEntry } from "./types"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import process from "node:process"

const MAX_SCAN_DEPTH = 3

export function macosApplicationDirectories(): string[] {
  if (process.platform !== "darwin") return []
  return ["/Applications", "/System/Applications", path.join(os.homedir(), "Applications")]
}

export async function scanMacosApplicationsDir(rootDir: string): Promise<AppEntry[]> {
  const entries: AppEntry[] = []
  await walk(rootDir, 0, async (bundlePath) => {
    const entry = buildEntryFromAppBundle(bundlePath)
    if (entry) entries.push(entry)
  })
  return entries
}

export function buildEntryFromAppBundle(bundlePath: string): AppEntry | null {
  const ext = path.extname(bundlePath).toLowerCase()
  if (ext !== ".app") return null

  const name = path.basename(bundlePath, ext).trim()
  if (!name) return null

  return {
    id: `macos:${bundlePath.toLowerCase()}`,
    kind: "macos",
    name,
    nameLower: name.toLowerCase(),
    target: bundlePath,
    description: path.dirname(bundlePath),
    iconPath: bundlePath,
  }
}

async function walk(
  dir: string,
  depth: number,
  visitApp: (bundlePath: string) => Promise<void> | void
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return

  let entries: { name: string; isDirectory: () => boolean }[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue

    const full = path.join(dir, entry.name)
    if (entry.name.toLowerCase().endsWith(".app")) {
      await visitApp(full)
    } else {
      await walk(full, depth + 1, visitApp)
    }
  }
}
