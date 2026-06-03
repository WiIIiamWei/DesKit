import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createElectronPluginAdapters } from "./electron-adapters"

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-electron-adapters-"))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe("electron plugin adapters", () => {
  it("aborts plugin network requests when the timeout expires", async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")))
        })
    )
    const adapters = createElectronPluginAdapters(dir, { fetch: fetchImpl })

    try {
      const request = adapters.network.request("https://example.test/sync.json", { timeoutMs: 10 })
      const assertion = expect(request).rejects.toThrow("Aborted")
      await vi.advanceTimersByTimeAsync(10)

      await assertion
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://example.test/sync.json",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects plugin network responses larger than the content-length limit", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("", {
          headers: { "content-length": String(2 * 1024 * 1024 + 1) },
        })
    )
    const adapters = createElectronPluginAdapters(dir, { fetch: fetchImpl })

    await expect(adapters.network.request("https://example.test/large")).rejects.toThrow(
      "response body exceeds 2 MiB"
    )
  })

  it("rejects plugin network responses larger than the streamed body limit", async () => {
    const chunk = new Uint8Array(1024 * 1024 + 1)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.close()
      },
    })
    const fetchImpl = vi.fn(async () => new Response(body))
    const adapters = createElectronPluginAdapters(dir, { fetch: fetchImpl })

    await expect(adapters.network.request("https://example.test/large")).rejects.toThrow(
      "response body exceeds 2 MiB"
    )
  })
})
