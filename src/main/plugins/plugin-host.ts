import type { LocalizedString } from "@deskit/plugin-sdk"
import type { PluginBridgeAdapters, PluginRuntimeSnapshot } from "./plugin-bridge"
import type {
  PluginCommandResult,
  PluginInvokeRequest,
  PluginManifest,
  PluginRegistryEntry,
} from "./types"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { createElectronPluginAdapters } from "./electron-adapters"
import { loadPluginManifest } from "./manifest-loader"
import { PluginBridge } from "./plugin-bridge"
import { discoverPlugins } from "./plugin-discovery"
import { pluginPreferenceFilePath, PluginPreferenceStore } from "./plugin-preferences"
import { PluginRegistry } from "./plugin-registry"
import { PluginSandbox } from "./plugin-sandbox"

export interface PluginHostOptions {
  userDataDir: string
  resourcesDir: string
  adapters?: PluginBridgeAdapters
  runtime?: () => PluginRuntimeSnapshot
}

export interface MarketplacePlugin {
  id: string
  name: string
  displayName?: LocalizedString
  description?: LocalizedString
  author?: string
  version?: string
  category?: string
  downloads?: number
  icon?: string
  packagePath?: string
  sourcePath?: string
  permissions?: string[]
}

/**
 * Thrown when a feature exists as an IPC channel but its host-side
 * implementation has not landed yet. The IPC layer maps it to the
 * `PLUGIN_NOT_IMPLEMENTED` result code without dragging in the IPC
 * module's error class — keeps host pure.
 */
export class PluginHostNotImplementedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PluginHostNotImplementedError"
  }
}

/**
 * Thrown when a setPreference value's runtime type does not match the
 * manifest declaration (e.g. a string assigned to a `type: "number"`
 * preference). IPC layer maps it to `IPC_INVALID_PAYLOAD`.
 */
export class PluginPreferenceTypeError extends TypeError {
  readonly pluginId: string
  readonly key: string

  constructor(pluginId: string, key: string, message: string) {
    super(message)
    this.name = "PluginPreferenceTypeError"
    this.pluginId = pluginId
    this.key = key
  }
}

export class PluginInstallError extends Error {
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "PluginInstallError"
    this.details = details
  }
}

export class PluginHost {
  readonly bridge: PluginBridge
  readonly sandbox: PluginSandbox
  readonly registry: PluginRegistry
  readonly preferences: PluginPreferenceStore
  private readonly builtinDir: string
  private readonly userDir: string
  private readonly devFilePath: string
  private readonly marketplaceRegistryPath: string

  constructor(private readonly options: PluginHostOptions) {
    this.builtinDir = path.join(options.resourcesDir, "builtin-plugins")
    this.userDir = path.join(options.userDataDir, "plugins")
    this.devFilePath = path.join(options.userDataDir, "dev-plugins.json")
    this.marketplaceRegistryPath = path.join(
      options.resourcesDir,
      "mock-marketplace",
      "registry.json"
    )
    this.preferences = new PluginPreferenceStore(pluginPreferenceFilePath(options.userDataDir))
    this.bridge = new PluginBridge({
      userDataDir: options.userDataDir,
      adapters: options.adapters ?? createElectronPluginAdapters(options.userDataDir),
      runtime: options.runtime,
      preferences: (pluginId, manifest) => this.preferencesFor(pluginId, manifest),
    })
    this.sandbox = new PluginSandbox({ bridge: this.bridge })
    this.registry = new PluginRegistry({ sandbox: this.sandbox })
  }

  async init(): Promise<void> {
    await this.preferences.load()
    const discovered = await discoverPlugins({
      builtinDir: this.builtinDir,
      userDir: this.userDir,
      devFilePath: this.devFilePath,
    })
    await this.registry.load(discovered)
  }

  list(): PluginRegistryEntry[] {
    return this.registry.list().map((entry) => this.withPreferences(entry))
  }

  get(pluginId: string): PluginRegistryEntry | undefined {
    const entry = this.registry.get(pluginId)
    return entry ? this.withPreferences(entry) : undefined
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginRegistryEntry> {
    return this.withPreferences(await this.registry.setEnabled(pluginId, enabled))
  }

  searchCommands(query: string, locale?: string, limit?: number): PluginCommandResult[] {
    return this.registry.searchCommands(query, locale, limit)
  }

  invoke(request: PluginInvokeRequest): Promise<unknown> {
    return this.registry.invoke(request)
  }

  disposeCommand(pluginId: string, commandId: string): Promise<void> {
    return this.registry.disposeCommand(pluginId, commandId)
  }

  async listMarketplacePlugins(): Promise<MarketplacePlugin[]> {
    try {
      const raw = await fs.readFile(this.marketplaceRegistryPath, "utf-8")
      const parsed = JSON.parse(raw) as unknown
      return normalizeMarketplaceRegistry(parsed)
    } catch (err) {
      if (isFileNotFound(err) || err instanceof SyntaxError) return []
      throw err
    }
  }

  async setPreference(pluginId: string, key: string, value: unknown): Promise<void> {
    const entry = this.registry.get(pluginId)
    if (!entry?.manifest) throw new Error(`Plugin not found: ${pluginId}`)

    const declared = entry.manifest.contributes.preferences?.find((item) => item.id === key)
    if (!declared) throw new Error(`Unknown plugin preference: ${pluginId}.${key}`)

    if (value !== undefined) {
      validatePreferenceValue(pluginId, key, value, declared)
    }

    await this.preferences.set(pluginId, key, value)
  }

  async installFolder(folderPath: string): Promise<PluginRegistryEntry> {
    return this.installDirectory(folderPath)
  }

  async installMarketplacePlugin(id: string, version?: string): Promise<PluginRegistryEntry> {
    const plugin = (await this.listMarketplacePlugins()).find(
      (entry) => entry.id === id && (!version || entry.version === version)
    )
    if (!plugin) {
      throw new PluginInstallError("Marketplace plugin was not found.", { pluginId: id, version })
    }
    if (!plugin.sourcePath) {
      throw new PluginInstallError("Marketplace entry is missing an install source.", {
        pluginId: id,
      })
    }

    const marketplaceDir = path.dirname(this.marketplaceRegistryPath)
    const sourceDir = resolveRelativePathInside(plugin.sourcePath, marketplaceDir)
    return this.installDirectory(sourceDir, { expectedPluginId: id })
  }

  async uninstall(pluginId: string): Promise<void> {
    const entry = this.registry.get(pluginId)
    if (!entry) return

    if (entry.source.kind === "builtin") {
      if (entry.status !== "invalid") {
        throw new PluginHostNotImplementedError("Builtin plugins cannot be uninstalled")
      }
      await removeDirectoryInside(entry.rootDir, this.builtinDir)
    } else if (entry.source.kind === "user") {
      await removeDirectoryInside(entry.rootDir, this.userDir)
    } else {
      await removeDevPluginReference(this.devFilePath, entry.rootDir)
    }

    await this.reload()
  }

  async reload(pluginId?: string): Promise<PluginRegistryEntry | undefined> {
    await this.init()
    const entry = pluginId ? this.registry.get(pluginId) : undefined
    return entry ? this.withPreferences(entry) : undefined
  }

  async flush(): Promise<void> {
    await this.bridge.flushAll()
  }

  private preferencesFor(pluginId: string, manifest: PluginManifest): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}
    for (const preference of manifest.contributes.preferences ?? []) {
      if ("default" in preference) defaults[preference.id] = preference.default
    }
    return { ...defaults, ...this.preferences.get(pluginId) }
  }

  private async installDirectory(
    sourceDir: string,
    options: { expectedPluginId?: string } = {}
  ): Promise<PluginRegistryEntry> {
    const manifest = await validateInstallSource(sourceDir)
    if (options.expectedPluginId && manifest.id !== options.expectedPluginId) {
      throw new PluginInstallError("Plugin ID does not match marketplace entry.", {
        expectedPluginId: options.expectedPluginId,
        actualPluginId: manifest.id,
      })
    }

    const existing = this.registry.get(manifest.id)
    if (existing && existing.source.kind !== "user") {
      throw new PluginInstallError("This plugin is provided by a protected source.", {
        pluginId: manifest.id,
        source: existing.source.kind,
      })
    }

    const targetDir = path.join(this.userDir, safePluginFileName(manifest.id))
    const backupDir = path.join(
      this.options.userDataDir,
      "plugin-install-backups",
      `.install-backup-${safePluginFileName(manifest.id)}-${Date.now()}`
    )
    const hadExisting = await pathExists(targetDir)
    let backupCreated = false

    await fs.mkdir(this.userDir, { recursive: true })
    if (existing?.status === "active") {
      await this.registry.setEnabled(manifest.id, false)
    }

    try {
      if (hadExisting) {
        await fs.mkdir(path.dirname(backupDir), { recursive: true })
        await fs.rm(backupDir, { recursive: true, force: true })
        await fs.rename(targetDir, backupDir)
        backupCreated = true
      }
      await copyPluginDirectory(sourceDir, targetDir)
      await this.reload()
      const installed = this.registry.get(manifest.id)
      if (
        !installed ||
        installed.source.kind !== "user" ||
        !installed.manifest ||
        installed.status !== "active"
      ) {
        throw new PluginInstallError("Installed plugin could not be loaded.", {
          pluginId: manifest.id,
          status: installed?.status,
        })
      }
      if (backupCreated) await fs.rm(backupDir, { recursive: true, force: true })
      return installed
    } catch (err) {
      await fs.rm(targetDir, { recursive: true, force: true })
      if (backupCreated) {
        await fs.rename(backupDir, targetDir)
      }
      await this.reload()
      if (err instanceof PluginInstallError) throw err
      throw new PluginInstallError(
        "Plugin installation failed and previous version was restored.",
        {
          pluginId: manifest.id,
        }
      )
    }
  }

  private withPreferences(entry: PluginRegistryEntry): PluginRegistryEntry {
    if (!entry.manifest) return entry
    return {
      ...entry,
      preferences: this.preferencesFor(entry.pluginId, entry.manifest),
    }
  }
}

async function validateInstallSource(sourceDir: string): Promise<PluginManifest> {
  const stat = await fs.stat(sourceDir)
  if (!stat.isDirectory()) {
    throw new PluginInstallError("Plugin install source must be a directory.", { sourceDir })
  }
  const manifest = await loadPluginManifest(sourceDir)
  const mainPath = path.resolve(sourceDir, manifest.main)
  if (!isInsideOrSameDirectory(mainPath, path.resolve(sourceDir))) {
    throw new PluginInstallError("Plugin main file must stay inside the plugin directory.", {
      pluginId: manifest.id,
    })
  }
  const mainStat = await fs.stat(mainPath)
  if (!mainStat.isFile()) {
    throw new PluginInstallError("Plugin main file is missing.", { pluginId: manifest.id })
  }
  return manifest
}

async function copyPluginDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (source) => !path.basename(source).startsWith(".install-backup-"),
  })
}

async function removeDirectoryInside(targetDir: string, parentDir: string): Promise<void> {
  const target = path.resolve(targetDir)
  const parent = path.resolve(parentDir)
  if (!isInsideDirectory(target, parent)) {
    throw new Error(`Refusing to remove plugin outside managed directory: ${targetDir}`)
  }
  await fs.rm(target, { recursive: true, force: true })
}

async function removeDevPluginReference(devFilePath: string, rootDir: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(devFilePath, "utf-8")) as unknown
  } catch (err) {
    if (isFileNotFound(err) || err instanceof SyntaxError) return
    throw err
  }
  if (!Array.isArray(parsed)) return

  const baseDir = path.dirname(devFilePath)
  const root = path.resolve(rootDir)
  const next = parsed.filter((entry) => {
    const value = devEntryPath(entry)
    if (!value) return true
    const resolved = path.isAbsolute(value) ? value : path.resolve(baseDir, value)
    return path.resolve(resolved) !== root
  })
  await fs.mkdir(path.dirname(devFilePath), { recursive: true })
  await fs.writeFile(devFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
}

function devEntryPath(entry: unknown): string | null {
  if (typeof entry === "string") return entry
  if (
    entry &&
    typeof entry === "object" &&
    typeof (entry as { path?: unknown }).path === "string"
  ) {
    return (entry as { path: string }).path
  }
  return null
}

function isInsideDirectory(target: string, parent: string): boolean {
  const relative = path.relative(parent, target)
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function isInsideOrSameDirectory(target: string, parent: string): boolean {
  const relative = path.relative(parent, target)
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function resolveRelativePathInside(value: string, parentDir: string): string {
  if (path.isAbsolute(value)) {
    throw new PluginInstallError("Marketplace install source must be a relative path.", {
      sourcePath: value,
    })
  }
  const target = path.resolve(parentDir, value)
  if (!isInsideDirectory(target, parentDir)) {
    throw new PluginInstallError("Marketplace install source escapes the registry directory.", {
      sourcePath: value,
    })
  }
  return target
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target)
    return true
  } catch (err) {
    if (isFileNotFound(err)) return false
    throw err
  }
}

function safePluginFileName(pluginId: string): string {
  return pluginId.replace(/[^\w.-]/g, "_")
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}

function normalizeMarketplaceRegistry(value: unknown): MarketplacePlugin[] {
  const entries =
    value && typeof value === "object" && Array.isArray((value as { plugins?: unknown }).plugins)
      ? (value as { plugins: unknown[] }).plugins
      : Array.isArray(value)
        ? value
        : []

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as Record<string, unknown>
    if (typeof item.id !== "string" || typeof item.name !== "string") return []
    return [
      {
        id: item.id,
        name: item.name,
        displayName: localizedField(item.displayName),
        description: localizedField(item.description),
        author: typeof item.author === "string" ? item.author : undefined,
        version: typeof item.version === "string" ? item.version : undefined,
        category: typeof item.category === "string" ? item.category : undefined,
        downloads: typeof item.downloads === "number" ? item.downloads : undefined,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        packagePath: typeof item.packagePath === "string" ? item.packagePath : undefined,
        sourcePath: typeof item.sourcePath === "string" ? item.sourcePath : undefined,
        permissions: Array.isArray(item.permissions)
          ? item.permissions.filter(
              (permission): permission is string => typeof permission === "string"
            )
          : undefined,
      },
    ]
  })
}

function localizedField(value: unknown): LocalizedString | undefined {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const result: Record<string, string> = {}
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === "string") result[locale] = text
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function validatePreferenceValue(
  pluginId: string,
  key: string,
  value: unknown,
  declared: NonNullable<PluginManifest["contributes"]["preferences"]>[number]
): void {
  switch (declared.type) {
    case "text":
      if (typeof value !== "string") {
        throw new PluginPreferenceTypeError(pluginId, key, `${key} must be a string`)
      }
      return
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new PluginPreferenceTypeError(pluginId, key, `${key} must be a finite number`)
      }
      return
    case "checkbox":
      if (typeof value !== "boolean") {
        throw new PluginPreferenceTypeError(pluginId, key, `${key} must be a boolean`)
      }
      return
    case "select":
      if (
        typeof value !== "string" ||
        !declared.options?.some((option) => option.value === value)
      ) {
        throw new PluginPreferenceTypeError(
          pluginId,
          key,
          `${key} must be one of the declared select options`
        )
      }
  }
}
