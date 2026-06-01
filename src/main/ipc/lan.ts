import type { IpcMain, IpcMainInvokeEvent } from "electron"
import type { EventEmitter } from "node:events"
import type { LanDevice, LanPairing, LanStatus, LanTransfer } from "../lan/types"

export interface LanIpcService {
  getStatus: () => LanStatus
  listDevices: () => LanDevice[]
  listPairings: () => LanPairing[]
  pair: (deviceId: string) => Promise<LanPairing>
  confirmPairing: (pairingId: string) => Promise<LanPairing[]>
  rejectPairing: (pairingId: string) => LanPairing[]
  listTransfers: () => LanTransfer[]
  sendFile: (deviceId: string, filePath: string) => Promise<LanTransfer>
  resumeTransfer: (transferId: string) => Promise<LanTransfer>
  acceptTransfer: (transferId: string, destinationPath: string) => Promise<LanTransfer>
  rejectTransfer: (transferId: string) => Promise<LanTransfer>
}

export interface RegisterLanIpcOptions {
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  onDevicesChanged: (devices: LanDevice[]) => void
  onStatusChanged: (status: LanStatus) => void
  onPairingsChanged: (pairings: LanPairing[]) => void
  onTransfersChanged: (transfers: LanTransfer[]) => void
  selectSendFile: () => Promise<string | null>
  selectSaveFile: (suggestedName: string) => Promise<string | null>
}

export function registerLanIpc(
  ipcMain: IpcMain,
  service: LanIpcService & Pick<EventEmitter, "on">,
  options: RegisterLanIpcOptions
): void {
  ipcMain.handle("lan:status", (event) => {
    requireTrustedSender(event, "lan:status", options.isTrustedSender)
    return service.getStatus()
  })
  ipcMain.handle("lan:devices", (event) => {
    requireTrustedSender(event, "lan:devices", options.isTrustedSender)
    return service.listDevices()
  })
  ipcMain.handle("lan:pairings", (event) => {
    requireTrustedSender(event, "lan:pairings", options.isTrustedSender)
    return service.listPairings()
  })
  ipcMain.handle("lan:pair", (event, deviceId: unknown) => {
    requireTrustedSender(event, "lan:pair", options.isTrustedSender)
    return service.pair(requireString(deviceId, "deviceId"))
  })
  ipcMain.handle("lan:pairing-confirm", (event, pairingId: unknown) => {
    requireTrustedSender(event, "lan:pairing-confirm", options.isTrustedSender)
    return service.confirmPairing(requireString(pairingId, "pairingId"))
  })
  ipcMain.handle("lan:pairing-reject", (event, pairingId: unknown) => {
    requireTrustedSender(event, "lan:pairing-reject", options.isTrustedSender)
    return service.rejectPairing(requireString(pairingId, "pairingId"))
  })
  ipcMain.handle("lan:transfers", (event) => {
    requireTrustedSender(event, "lan:transfers", options.isTrustedSender)
    return service.listTransfers()
  })
  ipcMain.handle("lan:send-file", async (event, deviceId: unknown) => {
    requireTrustedSender(event, "lan:send-file", options.isTrustedSender)
    const filePath = await options.selectSendFile()
    return filePath ? service.sendFile(requireString(deviceId, "deviceId"), filePath) : null
  })
  ipcMain.handle("lan:transfer-resume", (event, transferId: unknown) => {
    requireTrustedSender(event, "lan:transfer-resume", options.isTrustedSender)
    return service.resumeTransfer(requireString(transferId, "transferId"))
  })
  ipcMain.handle("lan:transfer-accept", async (event, transferId: unknown) => {
    requireTrustedSender(event, "lan:transfer-accept", options.isTrustedSender)
    const id = requireString(transferId, "transferId")
    const transfer = service.listTransfers().find((item) => item.id === id)
    if (!transfer) throw new Error("Transfer was not found.")
    const destinationPath = await options.selectSaveFile(transfer.fileName)
    return destinationPath ? service.acceptTransfer(id, destinationPath) : null
  })
  ipcMain.handle("lan:transfer-reject", (event, transferId: unknown) => {
    requireTrustedSender(event, "lan:transfer-reject", options.isTrustedSender)
    return service.rejectTransfer(requireString(transferId, "transferId"))
  })
  service.on("devices-changed", options.onDevicesChanged)
  service.on("status-changed", options.onStatusChanged)
  service.on("pairings-changed", options.onPairingsChanged)
  service.on("transfers-changed", options.onTransfersChanged)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a string.`)
  return value.trim()
}

function requireTrustedSender(
  event: IpcMainInvokeEvent,
  channel: string,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  if (isTrustedSender(event)) return
  console.warn("[lan-ipc] rejected untrusted sender", { channel })
  throw new Error("Untrusted IPC sender.")
}
