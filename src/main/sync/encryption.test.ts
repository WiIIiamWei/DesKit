import { describe, expect, it } from "vitest"
import { decryptSyncPayload, encryptSyncPayload, SyncDecryptionError } from "./encryption"

describe("sync encryption", () => {
  it("round-trips payloads without storing plaintext in the envelope", async () => {
    const payload = {
      settings: { hotkey: "Alt+Space", themeMode: "dark" },
      pluginPreferences: { "com.deskit.test": { token: "secret" } },
    }

    const envelope = await encryptSyncPayload(payload, "correct horse battery staple")
    expect(JSON.stringify(envelope)).not.toContain("Alt+Space")
    expect(JSON.stringify(envelope)).not.toContain("secret")

    await expect(decryptSyncPayload(envelope, "correct horse battery staple")).resolves.toEqual(
      payload
    )
  })

  it("rejects the wrong passphrase", async () => {
    const envelope = await encryptSyncPayload({ ok: true }, "right")

    await expect(decryptSyncPayload(envelope, "wrong")).rejects.toBeInstanceOf(SyncDecryptionError)
  })
})
