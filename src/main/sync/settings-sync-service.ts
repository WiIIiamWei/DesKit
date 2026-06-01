import type { PluginPreferenceImportResult } from "../plugins/plugin-host"
import type { PreferenceFile } from "../plugins/plugin-preferences"
import type { UserSettings } from "../settings/settings"
import type { SyncEncryptionEnvelope } from "./encryption"
import type { GistSummary, GitHubGistClient } from "./gist-client"
import type { SyncStateStore } from "./sync-store"
import { decryptSyncPayload, encryptSyncPayload } from "./encryption"
import { DESKIT_SYNC_GIST_FILENAME, GitHubGistClientError } from "./gist-client"
import { settingsForSync, settingsFromSync } from "./hotkey-sync"

export const SYNC_PAYLOAD_SCHEMA_VERSION = 1

export interface DeskitSyncPayload {
  schemaVersion: typeof SYNC_PAYLOAD_SCHEMA_VERSION
  updatedAt: string
  deviceId: string
  settings: UserSettings
  pluginPreferences: PreferenceFile
}

export interface SyncServiceDeps {
  stateStore: SyncStateStore
  gistClient: GitHubGistClient
  getSettings: () => UserSettings
  updateSettings: (patch: Partial<UserSettings>) => Promise<UserSettings>
  exportPluginPreferences: () => PreferenceFile
  importPluginPreferences: (preferences: PreferenceFile) => Promise<PluginPreferenceImportResult>
  platform?: NodeJS.Platform | string
  now?: () => Date
}

export type PullSyncResult =
  | { status: "empty" }
  | {
      status: "applied"
      payload: DeskitSyncPayload
      pluginPreferences: PluginPreferenceImportResult
    }
  | { status: "conflict"; payload: DeskitSyncPayload }

export interface PushSyncResult {
  status: "created" | "updated"
  gist: GistSummary
  payload: DeskitSyncPayload
}

export class SettingsSyncService {
  private readonly now: () => Date

  constructor(private readonly deps: SyncServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async markLocalChanged(): Promise<void> {
    await this.deps.stateStore.update({ lastLocalUpdatedAt: this.nowIso() })
  }

  async push(accessToken: string, passphrase: string): Promise<PushSyncResult> {
    const state = this.deps.stateStore.get()
    const payload = this.localPayload(state.deviceId)
    const envelope = await encryptSyncPayload(payload, passphrase)
    const content = serializeEnvelope(envelope)
    const { gist, status } = await this.writeSyncGist(accessToken, state.gistId, content)

    await this.deps.stateStore.update({
      enabled: true,
      gistId: gist.id,
      lastSyncedAt: payload.updatedAt,
      lastLocalUpdatedAt: payload.updatedAt,
      lastRemoteUpdatedAt: gist.updatedAt,
    })
    return { status, gist, payload }
  }

  async pull(accessToken: string, passphrase: string): Promise<PullSyncResult> {
    const state = this.deps.stateStore.get()
    const gist = state.gistId
      ? await this.deps.gistClient.getGist(accessToken, state.gistId)
      : await this.deps.gistClient.findSyncGist(accessToken)
    if (!gist) return { status: "empty" }

    const file = gist.files[DESKIT_SYNC_GIST_FILENAME]
    if (!file?.content) return { status: "empty" }

    const payload = normalizeSyncPayload(
      await decryptSyncPayload(JSON.parse(file.content), passphrase)
    )
    if (!isRemoteNewer(state.lastSyncedAt, payload.updatedAt)) {
      await this.deps.stateStore.update({ gistId: gist.id, lastRemoteUpdatedAt: gist.updatedAt })
      return { status: "empty" }
    }
    if (hasLocalConflict(state.lastLocalUpdatedAt, state.lastSyncedAt, payload.updatedAt)) {
      await this.deps.stateStore.update({ gistId: gist.id, lastRemoteUpdatedAt: gist.updatedAt })
      return { status: "conflict", payload }
    }

    const pluginPreferences = await this.applyPayload(payload)
    await this.deps.stateStore.update({
      enabled: true,
      gistId: gist.id,
      lastSyncedAt: payload.updatedAt,
      lastLocalUpdatedAt: payload.updatedAt,
      lastRemoteUpdatedAt: gist.updatedAt,
    })
    return { status: "applied", payload, pluginPreferences }
  }

  async applyRemote(payload: DeskitSyncPayload): Promise<PluginPreferenceImportResult> {
    const pluginPreferences = await this.applyPayload(payload)
    await this.deps.stateStore.update({
      lastSyncedAt: payload.updatedAt,
      lastLocalUpdatedAt: payload.updatedAt,
    })
    return pluginPreferences
  }

  async applyLocal(accessToken: string, passphrase: string): Promise<PushSyncResult> {
    return this.push(accessToken, passphrase)
  }

  private localPayload(deviceId: string): DeskitSyncPayload {
    return {
      schemaVersion: SYNC_PAYLOAD_SCHEMA_VERSION,
      updatedAt: this.nowIso(),
      deviceId,
      settings: settingsForSync(this.deps.getSettings(), this.deps.platform),
      pluginPreferences: this.deps.exportPluginPreferences(),
    }
  }

  private async applyPayload(payload: DeskitSyncPayload): Promise<PluginPreferenceImportResult> {
    await this.deps.updateSettings(settingsFromSync(payload.settings, this.deps.platform))
    return this.deps.importPluginPreferences(payload.pluginPreferences)
  }

  private async writeSyncGist(
    accessToken: string,
    gistId: string | undefined,
    content: string
  ): Promise<{ status: PushSyncResult["status"]; gist: GistSummary }> {
    if (!gistId) {
      return {
        status: "created",
        gist: await this.deps.gistClient.createSyncGist(accessToken, content),
      }
    }

    try {
      return {
        status: "updated",
        gist: await this.deps.gistClient.updateSyncGist(accessToken, gistId, content),
      }
    } catch (err) {
      if (!isStaleWritableGistError(err)) throw err
      return {
        status: "created",
        gist: await this.deps.gistClient.createSyncGist(accessToken, content),
      }
    }
  }

  private nowIso(): string {
    return this.now().toISOString()
  }
}

export function normalizeSyncPayload(value: unknown): DeskitSyncPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Sync payload is invalid")
  }
  const raw = value as Record<string, unknown>
  if (raw.schemaVersion !== SYNC_PAYLOAD_SCHEMA_VERSION) {
    throw new Error("Unsupported sync payload version")
  }
  if (typeof raw.updatedAt !== "string" || !raw.updatedAt) {
    throw new Error("Sync payload is missing updatedAt")
  }
  if (typeof raw.deviceId !== "string" || !raw.deviceId) {
    throw new Error("Sync payload is missing deviceId")
  }
  if (!raw.settings || typeof raw.settings !== "object" || Array.isArray(raw.settings)) {
    throw new Error("Sync payload is missing settings")
  }
  return {
    schemaVersion: SYNC_PAYLOAD_SCHEMA_VERSION,
    updatedAt: raw.updatedAt,
    deviceId: raw.deviceId,
    settings: raw.settings as UserSettings,
    pluginPreferences: normalizePluginPreferences(raw.pluginPreferences),
  }
}

function normalizePluginPreferences(value: unknown): PreferenceFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const preferences: PreferenceFile = {}
  for (const [pluginId, pluginPreferences] of Object.entries(value)) {
    if (
      !pluginPreferences ||
      typeof pluginPreferences !== "object" ||
      Array.isArray(pluginPreferences)
    ) {
      continue
    }
    preferences[pluginId] = { ...(pluginPreferences as Record<string, unknown>) }
  }
  return preferences
}

function hasLocalConflict(
  lastLocalUpdatedAt: string | undefined,
  lastSyncedAt: string | undefined,
  remoteUpdatedAt: string
): boolean {
  if (!lastLocalUpdatedAt || !lastSyncedAt) return false
  return (
    Date.parse(lastLocalUpdatedAt) > Date.parse(lastSyncedAt) &&
    Date.parse(remoteUpdatedAt) > Date.parse(lastSyncedAt)
  )
}

function isRemoteNewer(lastSyncedAt: string | undefined, remoteUpdatedAt: string): boolean {
  if (!lastSyncedAt) return true
  return Date.parse(remoteUpdatedAt) > Date.parse(lastSyncedAt)
}

function isStaleWritableGistError(err: unknown): boolean {
  if (!(err instanceof GitHubGistClientError)) return false
  if (err.status === 404) return true
  return err.status === 403 && /cannot be updated/i.test(err.message)
}

function serializeEnvelope(envelope: SyncEncryptionEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`
}
