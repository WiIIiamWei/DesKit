import { describe, expect, it } from "vitest"
import { nextGitHubLoginPollInterval, syncErrorMessageKey } from "./sync-settings-utils"

describe("sync settings", () => {
  it("backs off GitHub device polling by five seconds after slow_down", () => {
    expect(nextGitHubLoginPollInterval(5)).toBe(10)
    expect(nextGitHubLoginPollInterval(10)).toBe(15)
  })

  it("maps sync decryption failures to a specific message", () => {
    expect(
      syncErrorMessageKey(
        "Error invoking remote method 'sync:pull': SyncDecryptionError: Unable to decrypt sync payload"
      )
    ).toBe("sync.messages.decryptFailed")
  })
})
