import type { UserSettings } from "../settings/settings"
import type { GistSummary, GitHubGistClient } from "./gist-client"
import type { DeskitSyncPayload } from "./settings-sync-service"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultSettings } from "../settings/settings"
import { encryptSyncPayload } from "./encryption"
import { DESKIT_SYNC_GIST_FILENAME } from "./gist-client"
import { SettingsSyncService } from "./settings-sync-service"
import { syncStateFilePath, SyncStateStore } from "./sync-store"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-settings-sync-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("settingsSyncService", () => {
  it("pushes encrypted settings and plugin preferences to a new secret Gist", async () => {
    const stateStore = await loadedStateStore()
    const createSyncGist = vi.fn(async (_token: string, content: string) =>
      gist("gist-id", content, "2026-06-01T00:00:02.000Z")
    )
    const gistClient = {
      createSyncGist,
    } as unknown as GitHubGistClient
    const service = new SettingsSyncService({
      stateStore,
      gistClient,
      getSettings: () => ({ ...defaultSettings, themeMode: "dark" }),
      updateSettings: vi.fn(),
      exportPluginPreferences: () => ({ "com.deskit.test": { unit: "s" } }),
      importPluginPreferences: vi.fn(),
      now: () => new Date("2026-06-01T00:00:01.000Z"),
    })

    const result = await service.push("token", "passphrase")

    expect(result.status).toBe("created")
    expect(stateStore.get()).toMatchObject({
      enabled: true,
      gistId: "gist-id",
      lastSyncedAt: "2026-06-01T00:00:01.000Z",
    })
    const uploadedContent = createSyncGist.mock.calls[0]?.[1]
    expect(uploadedContent).not.toContain("com.deskit.test")
    expect(uploadedContent).not.toContain("dark")
  })

  it("pulls and applies remote payloads when there is no local conflict", async () => {
    const stateStore = await loadedStateStore()
    await stateStore.update({
      gistId: "gist-id",
      lastSyncedAt: "2026-06-01T00:00:00.000Z",
      lastLocalUpdatedAt: "2026-06-01T00:00:00.000Z",
    })
    const remotePayload = payload({
      updatedAt: "2026-06-01T00:01:00.000Z",
      settings: { ...defaultSettings, accent: "blue" },
      pluginPreferences: { "com.deskit.test": { unit: "s" } },
    })
    const remoteContent = JSON.stringify(await encryptSyncPayload(remotePayload, "passphrase"))
    const updateSettings = vi.fn(async (patch: Partial<UserSettings>) => ({
      ...defaultSettings,
      ...patch,
    }))
    const importPluginPreferences = vi.fn(async () => ({ applied: 1, pending: 0, skipped: [] }))
    const service = new SettingsSyncService({
      stateStore,
      gistClient: {
        getGist: vi.fn(async () => gist("gist-id", remoteContent, "2026-06-01T00:01:01.000Z")),
      } as unknown as GitHubGistClient,
      getSettings: () => defaultSettings,
      updateSettings,
      exportPluginPreferences: () => ({}),
      importPluginPreferences,
    })

    await expect(service.pull("token", "passphrase")).resolves.toMatchObject({ status: "applied" })
    expect(updateSettings).toHaveBeenCalledWith(remotePayload.settings)
    expect(importPluginPreferences).toHaveBeenCalledWith(remotePayload.pluginPreferences)
  })

  it("returns conflicts when local and remote both changed since last sync", async () => {
    const stateStore = await loadedStateStore()
    await stateStore.update({
      gistId: "gist-id",
      lastSyncedAt: "2026-06-01T00:00:00.000Z",
      lastLocalUpdatedAt: "2026-06-01T00:02:00.000Z",
    })
    const remotePayload = payload({ updatedAt: "2026-06-01T00:01:00.000Z" })
    const remoteContent = JSON.stringify(await encryptSyncPayload(remotePayload, "passphrase"))
    const updateSettings = vi.fn()
    const service = new SettingsSyncService({
      stateStore,
      gistClient: {
        getGist: vi.fn(async () => gist("gist-id", remoteContent, "2026-06-01T00:01:01.000Z")),
      } as unknown as GitHubGistClient,
      getSettings: () => defaultSettings,
      updateSettings,
      exportPluginPreferences: () => ({}),
      importPluginPreferences: vi.fn(),
    })

    await expect(service.pull("token", "passphrase")).resolves.toMatchObject({
      status: "conflict",
    })
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it("does not apply remote payloads that are not newer than the last sync", async () => {
    const stateStore = await loadedStateStore()
    await stateStore.update({
      gistId: "gist-id",
      lastSyncedAt: "2026-06-01T00:02:00.000Z",
      lastLocalUpdatedAt: "2026-06-01T00:03:00.000Z",
    })
    const remotePayload = payload({ updatedAt: "2026-06-01T00:01:00.000Z" })
    const remoteContent = JSON.stringify(await encryptSyncPayload(remotePayload, "passphrase"))
    const updateSettings = vi.fn()
    const service = new SettingsSyncService({
      stateStore,
      gistClient: {
        getGist: vi.fn(async () => gist("gist-id", remoteContent, "2026-06-01T00:01:01.000Z")),
      } as unknown as GitHubGistClient,
      getSettings: () => defaultSettings,
      updateSettings,
      exportPluginPreferences: () => ({}),
      importPluginPreferences: vi.fn(),
    })

    await expect(service.pull("token", "passphrase")).resolves.toMatchObject({
      status: "empty",
    })
    expect(updateSettings).not.toHaveBeenCalled()
  })
})

async function loadedStateStore(): Promise<SyncStateStore> {
  const store = new SyncStateStore(syncStateFilePath(dir))
  await store.load()
  return store
}

function payload(overrides: Partial<DeskitSyncPayload> = {}): DeskitSyncPayload {
  return {
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    deviceId: "device",
    settings: defaultSettings,
    pluginPreferences: {},
    ...overrides,
  }
}

function gist(id: string, content: string, updatedAt: string): GistSummary {
  return {
    id,
    description: "DesKit encrypted settings sync",
    updatedAt,
    files: {
      [DESKIT_SYNC_GIST_FILENAME]: {
        filename: DESKIT_SYNC_GIST_FILENAME,
        content,
      },
    },
  }
}
