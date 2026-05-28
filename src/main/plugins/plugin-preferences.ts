import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"

type PreferenceFile = Record<string, Record<string, unknown>>

/**
 * JSON-backed store for plugin preferences keyed by pluginId.
 *
 * Owns the in-memory cache + file IO so the host orchestration layer
 * doesn't have to. Atomic writes go through a tmp file + rename so a
 * mid-write crash leaves the previous good copy on disk.
 */
export class PluginPreferenceStore {
  private data: PreferenceFile = {}
  private loaded = false

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8")
      const parsed = JSON.parse(raw) as unknown
      this.data = normalizePreferenceFile(parsed)
    } catch (err) {
      if (!isFileNotFound(err) && !(err instanceof SyntaxError)) throw err
      this.data = {}
    }
    this.loaded = true
  }

  get(pluginId: string): Record<string, unknown> {
    this.ensureLoaded()
    return { ...(this.data[pluginId] ?? {}) }
  }

  async set(pluginId: string, key: string, value: unknown): Promise<void> {
    this.ensureLoaded()
    const next = { ...(this.data[pluginId] ?? {}) }
    if (value === undefined) {
      delete next[key]
    } else {
      next[key] = value
    }
    this.data[pluginId] = next
    await this.save()
  }

  async delete(pluginId: string): Promise<void> {
    this.ensureLoaded()
    if (!(pluginId in this.data)) return
    delete this.data[pluginId]
    await this.save()
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    // Tmp + rename: a crash mid-write leaves the previous good copy intact
    // instead of producing a half-written JSON the next load() can't parse.
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf-8")
    await fs.rename(tempPath, this.filePath)
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("Plugin preferences must be loaded before use")
    }
  }
}

export function pluginPreferenceFilePath(userDataDir: string): string {
  return path.join(userDataDir, "plugin-preferences.json")
}

function normalizePreferenceFile(value: unknown): PreferenceFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const result: PreferenceFile = {}
  for (const [pluginId, preferences] of Object.entries(value)) {
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) continue
    result[pluginId] = { ...preferences }
  }
  return result
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}
