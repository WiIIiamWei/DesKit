import { describe, expect, it, vi } from "vitest"
import { DESKIT_SYNC_GIST_FILENAME, GitHubGistClient, GitHubGistClientError } from "./gist-client"

describe("gitHubGistClient", () => {
  it("starts GitHub device flow with gist scope", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        device_code: "device",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      })
    )
    const client = new GitHubGistClient({ fetch })

    await expect(client.startDeviceAuthorization("client-id")).resolves.toMatchObject({
      deviceCode: "device",
      userCode: "ABCD-EFGH",
    })
    expect(fetch).toHaveBeenCalledWith(
      "https://github.com/login/device/code",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      })
    )
    const calls = fetch.mock.calls as unknown as Array<[string, { body?: unknown }]>
    expect(String(calls[0]?.[1].body)).toContain("scope=gist")
  })

  it("surfaces pending device authorization as a typed error code", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        error: "authorization_pending",
        error_description: "Authorization is pending.",
      })
    )
    const client = new GitHubGistClient({ fetch })

    await expect(client.pollDeviceToken("client-id", "device")).rejects.toMatchObject({
      code: "authorization_pending",
    })
  })

  it("finds the DesKit sync gist by filename", async () => {
    const fetch = vi.fn(async () =>
      Response.json([gist("one", "other.json", "{}"), gist("two", DESKIT_SYNC_GIST_FILENAME, "{}")])
    )
    const client = new GitHubGistClient({ fetch })

    await expect(client.findSyncGist("token")).resolves.toMatchObject({ id: "two" })
  })

  it("creates secret Gists with the fixed sync filename", async () => {
    const fetch = vi.fn(async () => Response.json(gist("new", DESKIT_SYNC_GIST_FILENAME, "{}")))
    const client = new GitHubGistClient({ fetch })

    await client.createSyncGist("token", "{}")

    const calls = fetch.mock.calls as unknown as Array<[string, { body?: unknown }]>
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({
      description: "DesKit encrypted settings sync",
      public: false,
      files: {
        [DESKIT_SYNC_GIST_FILENAME]: { content: "{}" },
      },
    })
  })

  it("throws when GitHub returns invalid JSON", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 500 }))
    const client = new GitHubGistClient({ fetch })

    await expect(client.getAuthenticatedUser("token")).rejects.toBeInstanceOf(GitHubGistClientError)
  })
})

function gist(id: string, filename: string, content: string) {
  return {
    id,
    description: "test",
    updated_at: "2026-06-01T00:00:00.000Z",
    files: {
      [filename]: {
        filename,
        content,
        raw_url: `https://gist.githubusercontent.com/${id}/${filename}`,
      },
    },
  }
}
