import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"

export const SYNC_STATE_SCHEMA_VERSION = 1

export interface SyncState {
  schemaVersion: typeof SYNC_STATE_SCHEMA_VERSION
  enabled: boolean
  githubOAuthClientId?: string
  githubUserLogin?: string
  gistId?: string
  deviceId: string
  lastSyncedAt?: string
  lastRemoteUpdatedAt?: string
  lastLocalUpdatedAt?: string
  rememberPassphrase: boolean
  encryptedAccessToken?: string
  encryptedPassphrase?: string
}

export const defaultSyncState = {
  schemaVersion: SYNC_STATE_SCHEMA_VERSION,
  enabled: false,
  deviceId: "",
  rememberPassphrase: true,
} satisfies SyncState

export class SyncStateStore {
  private state: SyncState = { ...defaultSyncState, deviceId: newDeviceId() }
  private loaded = false

  constructor(private readonly filePath: string) {}

  async load(): Promise<SyncState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8")
      this.state = normalizeSyncState(JSON.parse(raw), this.state.deviceId)
    } catch (err) {
      if (!isFileNotFound(err) && !(err instanceof SyntaxError)) throw err
      this.state = { ...defaultSyncState, deviceId: this.state.deviceId || newDeviceId() }
    }
    this.loaded = true
    return this.get()
  }

  get(): SyncState {
    this.ensureLoaded()
    return { ...this.state }
  }

  async update(patch: Partial<SyncState>): Promise<SyncState> {
    this.ensureLoaded()
    this.state = normalizeSyncState({ ...this.state, ...patch }, this.state.deviceId)
    await this.save()
    return this.get()
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf-8")
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error("Sync state must be loaded before use")
  }
}

export function syncStateFilePath(userDataDir: string): string {
  return path.join(userDataDir, "sync-state.json")
}

export function normalizeSyncState(value: unknown, fallbackDeviceId = newDeviceId()): SyncState {
  const next: SyncState = {
    ...defaultSyncState,
    deviceId: fallbackDeviceId || newDeviceId(),
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return next
  const raw = value as Record<string, unknown>
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== SYNC_STATE_SCHEMA_VERSION)
    return next
  if (typeof raw.enabled === "boolean") next.enabled = raw.enabled
  if (typeof raw.githubOAuthClientId === "string" && raw.githubOAuthClientId.trim()) {
    next.githubOAuthClientId = raw.githubOAuthClientId.trim()
  }
  if (typeof raw.githubUserLogin === "string" && raw.githubUserLogin.trim()) {
    next.githubUserLogin = raw.githubUserLogin.trim()
  }
  if (typeof raw.gistId === "string" && raw.gistId.trim()) next.gistId = raw.gistId.trim()
  if (typeof raw.deviceId === "string" && raw.deviceId.trim()) next.deviceId = raw.deviceId.trim()
  if (typeof raw.lastSyncedAt === "string" && raw.lastSyncedAt.trim()) {
    next.lastSyncedAt = raw.lastSyncedAt.trim()
  }
  if (typeof raw.lastRemoteUpdatedAt === "string" && raw.lastRemoteUpdatedAt.trim()) {
    next.lastRemoteUpdatedAt = raw.lastRemoteUpdatedAt.trim()
  }
  if (typeof raw.lastLocalUpdatedAt === "string" && raw.lastLocalUpdatedAt.trim()) {
    next.lastLocalUpdatedAt = raw.lastLocalUpdatedAt.trim()
  }
  if (typeof raw.rememberPassphrase === "boolean") {
    next.rememberPassphrase = raw.rememberPassphrase
  }
  if (typeof raw.encryptedAccessToken === "string" && raw.encryptedAccessToken.trim()) {
    next.encryptedAccessToken = raw.encryptedAccessToken.trim()
  }
  if (typeof raw.encryptedPassphrase === "string" && raw.encryptedPassphrase.trim()) {
    next.encryptedPassphrase = raw.encryptedPassphrase.trim()
  }
  return next
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}

function newDeviceId(): string {
  return randomUUID()
}
