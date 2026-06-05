import type { SecretProtector } from "./credential-store"
import type {
  DiscoveredLanDevice,
  LanDevice,
  LanDiscoveryAdapter,
  LanPairing,
  LanStatus,
  LanTransfer,
} from "./types"
import { EventEmitter } from "node:events"
import * as path from "node:path"
import { lanCredentialFilePath, LanCredentialStore } from "./credential-store"
import { lanIdentityFilePath, LanIdentityStore } from "./identity-store"
import { LanDiscoveryService } from "./lan-discovery-service"
import { LanSecureServer } from "./lan-secure-server"
import { IncomingTransferStore, OutgoingTransferStore } from "./transfer-store"
import {
  endpointFromDiscoveredDevice,
  trustedDevicesFilePath,
  TrustedDeviceStore,
} from "./trusted-device-store"

export interface LanServiceOptions {
  userDataDir: string
  adapter: LanDiscoveryAdapter
  protector: SecretProtector
  deviceName?: string
  now?: () => number
}

export class LanService extends EventEmitter {
  private readonly identityStore: LanIdentityStore
  private readonly credentialStore: LanCredentialStore
  private readonly trustedDevices: TrustedDeviceStore
  private readonly incomingTransfers: IncomingTransferStore
  private readonly outgoingTransfers: OutgoingTransferStore
  private readonly discovery: LanDiscoveryService
  private readonly announcedEndpoints = new Map<string, string>()
  private initialized = false
  private secure: LanSecureServer | null = null

  constructor(private readonly options: LanServiceOptions) {
    super()
    this.identityStore = new LanIdentityStore(
      lanIdentityFilePath(options.userDataDir),
      options.deviceName
    )
    this.credentialStore = new LanCredentialStore(
      lanCredentialFilePath(options.userDataDir),
      options.protector
    )
    this.trustedDevices = new TrustedDeviceStore(trustedDevicesFilePath(options.userDataDir))
    this.incomingTransfers = new IncomingTransferStore(
      path.join(options.userDataDir, "lan", "incoming")
    )
    this.outgoingTransfers = new OutgoingTransferStore(
      path.join(options.userDataDir, "lan", "outgoing-transfers.json")
    )
    this.discovery = new LanDiscoveryService({
      userDataDir: options.userDataDir,
      adapter: options.adapter,
      identityStore: this.identityStore,
      endpointPort: () => this.requireSecure().port(),
      isPaired: (deviceId) => this.trustedDevices.has(deviceId),
      now: options.now,
    })
    this.discovery.on("devices-changed", (devices) => this.emit("devices-changed", devices))
    this.discovery.on("status-changed", (status) => this.emit("status-changed", status))
  }

  async init(enabled: boolean): Promise<LanStatus> {
    await this.identityStore.loadOrCreate()
    await Promise.all([
      this.trustedDevices.init(),
      this.incomingTransfers.init(),
      this.outgoingTransfers.init(),
    ])
    this.initialized = true
    await this.discovery.init(false)
    this.discovery.restoreTrustedDevices(this.trustedDevices.list())
    if (enabled) await this.start()
    return this.getStatus()
  }

  async start(): Promise<LanStatus> {
    await this.ensureSecure()
    await this.requireSecure().start()
    try {
      return await this.discovery.start()
    } catch (err) {
      await this.requireSecure().stop()
      throw err
    }
  }

  async stop(): Promise<LanStatus> {
    const status = await this.discovery.stop()
    await this.secure?.stop()
    this.announcedEndpoints.clear()
    return status
  }

  getStatus(): LanStatus {
    return this.discovery.getStatus()
  }

  listDevices(): LanDevice[] {
    return this.discovery.listDevices()
  }

  listPairings(): LanPairing[] {
    return this.secure?.listPairings() ?? []
  }

  listTransfers(): LanTransfer[] {
    return [...this.incomingTransfers.list(), ...this.outgoingTransfers.list()]
  }

  async pair(deviceId: string): Promise<LanPairing> {
    return this.requireSecure().pair(this.requireOnlineDevice(deviceId))
  }

  async confirmPairing(id: string, sas: string): Promise<LanPairing[]> {
    const pairings = await this.requireSecure().confirmPairing(id, sas)
    this.discovery.refreshDevices()
    return pairings
  }

  async rejectPairing(id: string): Promise<LanPairing[]> {
    return this.requireSecure().rejectPairing(id)
  }

  async disconnect(deviceId: string): Promise<void> {
    await this.requireSecure().disconnect(this.requireReachableDevice(deviceId))
  }

  async sendFile(deviceId: string, sourcePath: string): Promise<LanTransfer> {
    return this.requireSecure().sendFile(this.requireReachableDevice(deviceId), sourcePath)
  }

  async resumeTransfer(id: string): Promise<LanTransfer> {
    return this.requireSecure().resumeTransfer(id)
  }

  async acceptTransfer(id: string, destinationPath: string): Promise<LanTransfer> {
    return this.requireSecure().acceptTransfer(id, destinationPath)
  }

  async rejectTransfer(id: string): Promise<LanTransfer> {
    return this.requireSecure().rejectTransfer(id)
  }

  async removeTransferHistory(id: string): Promise<LanTransfer[]> {
    return this.requireSecure().removeTransferHistory(id)
  }

  private findDevice(deviceId: string): LanDevice | null {
    return this.listDevices().find((device) => device.deviceId === deviceId) ?? null
  }

  private requireOnlineDevice(deviceId: string): LanDevice {
    const device = this.findDevice(deviceId)
    if (!device?.online) throw new Error("Target device is offline.")
    return device
  }

  private requireReachableDevice(deviceId: string): LanDevice {
    const device = this.findDevice(deviceId)
    if (!device) throw new Error("Target device was not found.")
    if (!device.online && !hasReachableEndpoint(device)) {
      throw new Error("Target device is offline.")
    }
    return device
  }

  private async announcePresence(device: DiscoveredLanDevice): Promise<void> {
    const secure = this.secure
    if (!secure) return
    const key = `${device.host}:${device.port}`
    if (this.announcedEndpoints.get(device.deviceId) === key) return
    this.announcedEndpoints.set(device.deviceId, key)
    try {
      await secure.announcePresence({
        ...device,
        addresses: [...device.addresses],
        lastSeenAt: this.options.now?.() ?? Date.now(),
        online: true,
        paired: false,
      })
    } catch (err) {
      // Allow a later re-announce if this attempt failed (peer not yet ready).
      this.announcedEndpoints.delete(device.deviceId)
      console.warn("[deskit] Failed to announce LAN presence", err)
    }
  }

  private async persistLearnedEndpoint(device: DiscoveredLanDevice): Promise<void> {
    if (!this.trustedDevices.has(device.deviceId)) return
    await this.trustedDevices.updateEndpoint(
      device.deviceId,
      endpointFromDiscoveredDevice(device, this.options.now?.() ?? Date.now())
    )
  }

  private async ensureSecure(): Promise<LanSecureServer> {
    if (this.secure) return this.secure
    if (!this.initialized) await this.init(false)
    const identity = await this.identityStore.loadOrCreate()
    const credential = await this.credentialStore.loadOrCreate(identity)
    this.secure = new LanSecureServer({
      identity,
      credential,
      trustedDevices: this.trustedDevices,
      incomingTransfers: this.incomingTransfers,
      outgoingTransfers: this.outgoingTransfers,
      resolveDevice: (deviceId) => this.findDevice(deviceId),
    })
    this.secure.on("device-learned", (device) => {
      this.discovery.learnDevice(device)
      void this.persistLearnedEndpoint(device)
    })
    this.discovery.on("device-discovered", (device) => void this.announcePresence(device))
    this.secure.on("pairings-changed", (pairings) => this.emit("pairings-changed", pairings))
    this.secure.on("transfers-changed", (transfers) => this.emit("transfers-changed", transfers))
    this.secure.on("trusted-devices-changed", () => this.discovery.refreshDevices())
    return this.secure
  }

  private requireSecure(): LanSecureServer {
    if (!this.secure) throw new Error("LAN service is not initialized.")
    return this.secure
  }
}

function hasReachableEndpoint(device: LanDevice): boolean {
  return Boolean(device.host.trim() && device.port > 0)
}
