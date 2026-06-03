import type { LanDevice, StoredLanIdentity } from "./types"
import { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import { createServer } from "node:https"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { lanCredentialFilePath, LanCredentialStore } from "./credential-store"
import { candidateHosts, LanSecureServer } from "./lan-secure-server"
import { IncomingTransferStore, OutgoingTransferStore } from "./transfer-store"
import { trustedDevicesFilePath, TrustedDeviceStore } from "./trusted-device-store"

const protector = {
  encrypt: (value: string) => Buffer.from(value).toString("base64"),
  decrypt: (value: string) => Buffer.from(value, "base64").toString("utf-8"),
}

describe("lanSecureServer", () => {
  const dirs: string[] = []
  const servers: LanSecureServer[] = []
  const hangingServers: ReturnType<typeof createServer>[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()))
    await Promise.all(hangingServers.splice(0).map(closeServer))
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it("prioritizes likely reachable LAN addresses before virtual adapter addresses", () => {
    expect(
      candidateHosts({
        deviceId: "bob",
        name: "Bob laptop",
        host: "bob.local",
        addresses: ["172.27.208.1", "192.168.1.8", "fe80::1"],
        port: 43123,
        platform: "win32",
        capabilities: ["discover", "pair", "https-chunks"],
        lastSeenAt: 1,
        online: true,
        paired: false,
      })
    ).toEqual(["192.168.1.8", "bob.local", "172.27.208.1", "fe80::1"])
  })

  it("pairs two peers and transfers a file over pinned HTTPS chunks", async () => {
    const alice = await createPeer("alice", "Alice desktop")
    const bob = await createPeer("bob", "Bob laptop")
    alice.devices.set("bob", deviceFor(bob))
    bob.devices.set("alice", deviceFor(alice))

    const outgoingPairing = await alice.server.pair(deviceFor(bob))
    const incomingPairing = bob.server.listPairings()[0]
    expect(incomingPairing?.sas).toMatch(/^\d{6}$/)
    expect(incomingPairing?.sas).not.toBe(outgoingPairing.sas)
    await expect(
      alice.server.confirmPairing(outgoingPairing.id, outgoingPairing.sas)
    ).rejects.toThrow("Security code is incorrect.")

    await alice.server.confirmPairing(outgoingPairing.id, incomingPairing.sas)
    expect(bob.trustedDevices.has("alice")).toBe(false)
    expect(alice.trustedDevices.has("bob")).toBe(false)

    await bob.server.confirmPairing(incomingPairing.id, outgoingPairing.sas)
    expect(bob.trustedDevices.has("alice")).toBe(true)
    expect(alice.trustedDevices.has("bob")).toBe(true)

    const sourcePath = path.join(alice.dir, "payload.bin")
    const payload = Buffer.alloc(1024 * 1024 + 37, 7)
    await fs.writeFile(sourcePath, payload)
    await expect(alice.server.sendFile(deviceFor(bob), sourcePath)).resolves.toMatchObject({
      state: "completed",
      completedChunks: 2,
    })

    const incoming = bob.server
      .listTransfers()
      .find((transfer) => transfer.direction === "incoming")
    expect(incoming).toMatchObject({ state: "awaiting-confirmation", completedChunks: 2 })
    const destinationPath = path.join(bob.dir, "accepted.bin")
    await bob.server.acceptTransfer(incoming!.id, destinationPath)
    await expect(fs.readFile(destinationPath)).resolves.toEqual(payload)

    await expect(bob.server.removeTransferHistory(incoming!.id)).resolves.toEqual([])
    await expect(fs.readFile(destinationPath)).resolves.toEqual(payload)

    await alice.server.disconnect(deviceFor(bob))
    expect(alice.trustedDevices.has("bob")).toBe(false)
    expect(bob.trustedDevices.has("alice")).toBe(false)
    // Self-signed TLS keygen + handshake + chunked transfer is CPU-bound and runs
    // markedly slower on shared CI runners than locally; allow generous headroom.
  }, 30_000)

  it("rejects a server whose certificate no longer matches the pinned fingerprint", async () => {
    const alice = await createPeer("alice", "Alice desktop")
    const bob = await createPeer("bob", "Bob laptop")
    const impostor = await createPeer("impostor", "Impostor")
    alice.devices.set("bob", deviceFor(bob))
    bob.devices.set("alice", deviceFor(alice))

    const outgoingPairing = await alice.server.pair(deviceFor(bob))
    const incomingPairing = bob.server.listPairings()[0]!
    await alice.server.confirmPairing(outgoingPairing.id, incomingPairing.sas)
    await bob.server.confirmPairing(incomingPairing.id, outgoingPairing.sas)

    const sourcePath = path.join(alice.dir, "private.txt")
    await fs.writeFile(sourcePath, "private payload")
    const impersonatedBob = { ...deviceFor(bob), port: impostor.server.port() }

    await expect(alice.server.sendFile(impersonatedBob, sourcePath)).resolves.toMatchObject({
      error: "Peer TLS certificate fingerprint mismatch.",
      state: "paused",
      transferredBytes: 0,
    })
    const paused = alice.server.listTransfers()[0]!
    await expect(alice.server.removeTransferHistory(paused.id)).resolves.toEqual([])
    expect(impostor.server.listTransfers()).toEqual([])
  }, 30_000)

  it("pauses a timed-out upload and can resume it later", async () => {
    const alice = await createPeer("alice", "Alice desktop", { requestTimeoutMs: 50 })
    const bob = await createPeer("bob", "Bob laptop")
    alice.devices.set("bob", deviceFor(bob))
    bob.devices.set("alice", deviceFor(alice))
    await alice.trustedDevices.trust({
      deviceId: bob.identity.deviceId,
      name: bob.identity.name,
      certificatePem: bob.credential.certificatePem,
      certificateFingerprint: bob.credential.certificateFingerprint,
      pairedAt: 1,
    })
    await bob.trustedDevices.trust({
      deviceId: alice.identity.deviceId,
      name: alice.identity.name,
      certificatePem: alice.credential.certificatePem,
      certificateFingerprint: alice.credential.certificateFingerprint,
      pairedAt: 1,
    })
    const hanging = createServer(
      {
        cert: bob.credential.certificatePem,
        key: bob.credential.privateKeyPem,
        requestCert: true,
        rejectUnauthorized: false,
      },
      (req) => {
        req.resume()
      }
    )
    await listen(hanging)
    hanging.unref()
    hangingServers.push(hanging)

    const sourcePath = path.join(alice.dir, "resume.txt")
    await fs.writeFile(sourcePath, "resume payload")
    const paused = await alice.server.sendFile(
      { ...deviceFor(bob), port: port(hanging) },
      sourcePath
    )

    expect(paused).toMatchObject({
      error: "LAN request timed out.",
      state: "paused",
      transferredBytes: 0,
    })

    const resumed = await alice.server.resumeTransfer(paused.id)

    expect(resumed).toMatchObject({
      state: "completed",
      transferredBytes: Buffer.byteLength("resume payload"),
    })
    expect(bob.server.listTransfers()).toHaveLength(1)
  }, 30_000)

  async function createPeer(
    deviceId: string,
    name: string,
    options: { requestTimeoutMs?: number } = {}
  ) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `deskit-lan-${deviceId}-`))
    dirs.push(dir)
    const identity: StoredLanIdentity = { deviceId, name }
    const credential = await new LanCredentialStore(
      lanCredentialFilePath(dir),
      protector
    ).loadOrCreate(identity)
    const trustedDevices = new TrustedDeviceStore(trustedDevicesFilePath(dir))
    const incomingTransfers = new IncomingTransferStore(path.join(dir, "incoming"))
    const outgoingTransfers = new OutgoingTransferStore(path.join(dir, "outgoing.json"))
    await Promise.all([trustedDevices.init(), incomingTransfers.init(), outgoingTransfers.init()])
    const devices = new Map<string, LanDevice>()
    const server = new LanSecureServer({
      identity,
      credential,
      trustedDevices,
      incomingTransfers,
      outgoingTransfers,
      requestTimeoutMs: options.requestTimeoutMs,
      resolveDevice: (id) => devices.get(id) ?? null,
    })
    await server.start()
    servers.push(server)
    return { credential, devices, dir, identity, server, trustedDevices }
  }

  function deviceFor(peer: Awaited<ReturnType<typeof createPeer>>): LanDevice {
    return {
      deviceId: peer.identity.deviceId,
      name: peer.identity.name,
      host: "localhost",
      addresses: ["127.0.0.1"],
      port: peer.server.port(),
      platform: "win32",
      capabilities: ["discover", "pair", "https-chunks"],
      lastSeenAt: Date.now(),
      online: true,
      paired: false,
    }
  }

  async function listen(server: ReturnType<typeof createServer>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen({ host: "127.0.0.1", port: 0 }, () => {
        server.off("error", reject)
        resolve()
      })
    })
  }

  async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
    if (!server.listening) return
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  function port(server: ReturnType<typeof createServer>): number {
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Test HTTPS server is not running.")
    return address.port
  }
})
