import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { normalizeSyncState, syncStateFilePath, SyncStateStore } from "./sync-store"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-sync-state-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("syncStateFilePath", () => {
  it("anchors sync state under userData", () => {
    expect(syncStateFilePath("/userData")).toBe(path.join("/userData", "sync-state.json"))
  })
})

describe("normalizeSyncState", () => {
  it("keeps known fields and strips unknown fields", () => {
    expect(
      normalizeSyncState(
        {
          schemaVersion: 1,
          enabled: true,
          githubOAuthClientId: " client ",
          gistId: " gist ",
          deviceId: "device",
          encryptedAccessToken: "token",
          unknown: true,
        },
        "fallback"
      )
    ).toEqual({
      schemaVersion: 1,
      enabled: true,
      githubOAuthClientId: "client",
      gistId: "gist",
      deviceId: "device",
      rememberPassphrase: true,
      encryptedAccessToken: "token",
    })
  })
})

describe("syncStateStore", () => {
  it("loads defaults when missing and persists updates", async () => {
    const store = new SyncStateStore(syncStateFilePath(dir))
    const initial = await store.load()
    expect(initial.enabled).toBe(false)
    expect(initial.deviceId).toBeTruthy()

    await store.update({ enabled: true, gistId: "abc" })

    const reopened = new SyncStateStore(syncStateFilePath(dir))
    await expect(reopened.load()).resolves.toMatchObject({
      enabled: true,
      gistId: "abc",
      deviceId: initial.deviceId,
    })
  })
})
