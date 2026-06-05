import type { SecretProtector } from "./credential-store"
import type { DiscoveredLanDevice, LanDiscoveryAdapter, LocalLanIdentity } from "./types"
import { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LanService } from "./lan-service"

class FakeLanDiscoveryAdapter implements LanDiscoveryAdapter {
  identity: LocalLanIdentity | null = null
  onDeviceUp: ((device: DiscoveredLanDevice) => void) | null = null
  onDeviceDown: ((deviceId: string) => void) | null = null

  start = vi.fn(
    async (
      identity: LocalLanIdentity,
      onDeviceUp: (device: DiscoveredLanDevice) => void,
      onDeviceDown: (deviceId: string) => void
    ) => {
      this.identity = identity
      this.onDeviceUp = onDeviceUp
      this.onDeviceDown = onDeviceDown
    }
  )

  stop = vi.fn(async () => {})
}

const protector: SecretProtector = {
  encrypt: (value) => Buffer.from(value).toString("base64"),
  decrypt: (value) => Buffer.from(value, "base64").toString("utf-8"),
}

describe("lanService", () => {
  const dirs: string[] = []
  const services: LanService[] = []

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.stop()))
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it("adds a direct pairing peer to the blind-side device list and can send back", async () => {
    const aliceAdapter = new FakeLanDiscoveryAdapter()
    const bobAdapter = new FakeLanDiscoveryAdapter()
    const alice = await createService("Alice desktop", aliceAdapter)
    const bob = await createService("Bob laptop", bobAdapter)

    aliceAdapter.onDeviceUp?.(deviceFor(bobAdapter.identity!))

    const outgoingPairing = await alice.service.pair(bobAdapter.identity!.deviceId)
    const incomingPairing = bob.service.listPairings()[0]!

    expect(bob.service.listDevices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: aliceAdapter.identity!.deviceId,
          name: "Alice desktop",
          online: true,
          paired: false,
        }),
      ])
    )

    await alice.service.confirmPairing(outgoingPairing.id, incomingPairing.sas)
    await bob.service.confirmPairing(incomingPairing.id, outgoingPairing.sas)

    expect(bob.service.listDevices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: aliceAdapter.identity!.deviceId,
          name: "Alice desktop",
          online: true,
          paired: true,
        }),
      ])
    )

    const sourcePath = path.join(bob.dir, "reply.txt")
    await fs.writeFile(sourcePath, "reply from blind side")
    await expect(
      bob.service.sendFile(aliceAdapter.identity!.deviceId, sourcePath)
    ).resolves.toMatchObject({
      state: "completed",
      transferredBytes: Buffer.byteLength("reply from blind side"),
    })

    const incoming = alice.service
      .listTransfers()
      .find((transfer) => transfer.direction === "incoming" && transfer.fileName === "reply.txt")
    expect(incoming).toMatchObject({ state: "awaiting-confirmation" })

    const destinationPath = path.join(alice.dir, "accepted-reply.txt")
    await alice.service.acceptTransfer(incoming!.id, destinationPath)
    await expect(fs.readFile(destinationPath, "utf-8")).resolves.toBe("reply from blind side")
  }, 30_000)

  it("restores a paired blind-side peer after restart when mDNS stays one-way", async () => {
    const aliceAdapter = new FakeLanDiscoveryAdapter()
    const bobAdapter = new FakeLanDiscoveryAdapter()
    const alice = await createService("Alice desktop", aliceAdapter)
    const bob = await createService("Bob laptop", bobAdapter)

    aliceAdapter.onDeviceUp?.(deviceFor(bobAdapter.identity!))

    const outgoingPairing = await alice.service.pair(bobAdapter.identity!.deviceId)
    const incomingPairing = bob.service.listPairings()[0]!
    await alice.service.confirmPairing(outgoingPairing.id, incomingPairing.sas)
    await bob.service.confirmPairing(incomingPairing.id, outgoingPairing.sas)

    const aliceDeviceId = aliceAdapter.identity!.deviceId
    await bob.service.stop()
    services.splice(services.indexOf(bob.service), 1)

    const restartedBob = new LanService({
      userDataDir: bob.dir,
      adapter: bobAdapter,
      deviceName: "Bob laptop",
      protector,
    })
    services.push(restartedBob)
    await restartedBob.init(true)

    expect(restartedBob.listDevices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: aliceDeviceId,
          name: "Alice desktop",
          paired: true,
          online: false,
          host: "127.0.0.1",
          port: expect.any(Number),
        }),
      ])
    )

    const sourcePath = path.join(bob.dir, "after-restart.txt")
    await fs.writeFile(sourcePath, "after restart")
    await expect(restartedBob.sendFile(aliceDeviceId, sourcePath)).resolves.toMatchObject({
      state: "completed",
      transferredBytes: Buffer.byteLength("after restart"),
    })
  }, 30_000)

  it("makes an unpaired blind-side peer mutually visible via presence announce", async () => {
    const aliceAdapter = new FakeLanDiscoveryAdapter()
    const bobAdapter = new FakeLanDiscoveryAdapter()
    const alice = await createService("Alice desktop", aliceAdapter)
    const bob = await createService("Bob laptop", bobAdapter)

    // Only Alice can see Bob over mDNS; Bob is blind to Alice.
    aliceAdapter.onDeviceUp?.(deviceFor(bobAdapter.identity!))

    // Without any pairing, Bob should still learn Alice from the presence announce.
    await vi.waitFor(
      () => {
        expect(bob.service.listDevices()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              deviceId: aliceAdapter.identity!.deviceId,
              name: "Alice desktop",
              online: true,
              paired: false,
            }),
          ])
        )
      },
      { interval: 100, timeout: 10_000 }
    )

    expect(alice.service.listDevices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deviceId: bobAdapter.identity!.deviceId, online: true }),
      ])
    )
  }, 30_000)

  async function createService(deviceName: string, adapter: FakeLanDiscoveryAdapter) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-lan-service-"))
    dirs.push(dir)
    const service = new LanService({
      userDataDir: dir,
      adapter,
      deviceName,
      protector,
    })
    services.push(service)
    await service.init(true)
    return { dir, service }
  }

  function deviceFor(identity: LocalLanIdentity): DiscoveredLanDevice {
    return {
      ...identity,
      host: "127.0.0.1",
      addresses: ["127.0.0.1"],
    }
  }
})
