import { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { IncomingTransferStore, OutgoingTransferStore, sha256Buffer } from "./transfer-store"

describe("incomingTransferStore", () => {
  let dir: string
  const transferId = "9d5f9b48-9f21-4d01-b1a5-9f77b45dd81b"

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-lan-transfer-"))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("reports missing chunks, assembles a verified file, and waits for confirmation", async () => {
    const store = new IncomingTransferStore(dir)
    await store.init()
    const chunks = [Buffer.from("abc"), Buffer.from("def"), Buffer.from("ghi")]
    const file = Buffer.concat(chunks)
    const request = {
      id: transferId,
      deviceId: "sender",
      deviceName: "Sender",
      fileName: "../safe.txt",
      size: file.length,
      sha256: sha256Buffer(file),
      chunkSize: 3,
    }
    await store.create(request)
    await store.putChunk(transferId, 0, chunks[0], sha256Buffer(chunks[0]))
    await store.putChunk(transferId, 2, chunks[2], sha256Buffer(chunks[2]))

    await expect(store.create(request)).resolves.toMatchObject({ missingChunks: [1] })
    await store.putChunk(transferId, 1, chunks[1], sha256Buffer(chunks[1]))
    await expect(store.complete(transferId)).resolves.toMatchObject({
      fileName: "safe.txt",
      state: "awaiting-confirmation",
    })

    const destination = path.join(dir, "received.txt")
    await store.accept(transferId, destination)
    await expect(fs.readFile(destination, "utf-8")).resolves.toBe("abcdefghi")

    await store.remove(transferId)
    expect(store.list()).toEqual([])
    await expect(fs.readFile(destination, "utf-8")).resolves.toBe("abcdefghi")
  })

  it("rejects transfer ids that could escape the incoming root", async () => {
    const store = new IncomingTransferStore(path.join(dir, "incoming"))
    await store.init()
    const outside = path.join(dir, "escape")

    await expect(
      store.create({
        id: "../escape",
        deviceId: "sender",
        deviceName: "Sender",
        fileName: "payload.txt",
        size: 7,
        sha256: sha256Buffer(Buffer.from("payload")),
        chunkSize: 7,
      })
    ).rejects.toThrow("Transfer id is invalid.")
    await expect(fs.stat(outside)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects invalid transfer size and chunk metadata", async () => {
    const store = new IncomingTransferStore(dir)
    await store.init()
    const base = {
      id: "df83fb3a-e3f0-41f8-81c0-e51af7dc5a0a",
      deviceId: "sender",
      deviceName: "Sender",
      fileName: "payload.txt",
      size: 7,
      sha256: sha256Buffer(Buffer.from("payload")),
      chunkSize: 7,
    }

    await expect(store.create({ ...base, size: -1 })).rejects.toThrow("Transfer size is invalid.")
    await expect(store.create({ ...base, chunkSize: 0 })).rejects.toThrow(
      "Transfer chunk size is invalid."
    )
    await expect(store.create({ ...base, sha256: "not-a-sha" })).rejects.toThrow(
      "Transfer SHA-256 is invalid."
    )
  })

  it("persists removed outgoing transfer history", async () => {
    const filePath = path.join(dir, "outgoing.json")
    const sourcePath = path.join(dir, "source.txt")
    await fs.writeFile(sourcePath, "payload")
    const store = new OutgoingTransferStore(filePath)
    await store.init()
    const transfer = await store.create("peer", "Peer", sourcePath)
    await store.update(transfer.id, { state: "completed" })

    await store.remove(transfer.id)

    const restored = new OutgoingTransferStore(filePath)
    await restored.init()
    expect(restored.list()).toEqual([])
  })
})
