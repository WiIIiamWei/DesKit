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

  it("maps common network and GitHub sync failures to localized messages", () => {
    expect(syncErrorMessageKey("Error: net::ERR_TUNNEL_CONNECTION_FAILED")).toBe(
      "sync.messages.network.proxyFailed"
    )
    expect(syncErrorMessageKey("Error: net::ERR_NAME_NOT_RESOLVED")).toBe(
      "sync.messages.network.dnsFailed"
    )
    expect(syncErrorMessageKey("GitHubGistClientError: Bad credentials")).toBe(
      "sync.messages.authExpired"
    )
    expect(syncErrorMessageKey("GitHubGistClientError: 403 Gist cannot be updated.")).toBe(
      "sync.messages.gistNotWritable"
    )
    expect(syncErrorMessageKey("GitHubGistClientError: Not Found")).toBe(
      "sync.messages.gistNotFound"
    )
    expect(syncErrorMessageKey("GitHubGistClientError: Forbidden")).toBe(
      "sync.messages.githubForbidden"
    )
  })
})
