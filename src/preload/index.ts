import type { IpcRendererEvent } from "electron"
import { contextBridge, ipcRenderer } from "electron"

// Local mirror of the renderer-visible global DeskitUserSettings shape.
// The global declared in index.d.ts is only loaded into the renderer's
// compilation; the preload tsconfig doesn't pick up that .d.ts, so we
// keep a structurally identical type here for type-only use.
type FloatingBallFeature = "appLauncher" | "screenshot" | `plugin:${string}:${string}`

interface SettingsPatch {
  hotkey?: string
  hotkeys?: {
    launcher?: string
    screenshot?: string
  }
  themeMode?: "light" | "dark" | "system"
  accent?: "neutral" | "blue" | "green" | "rose" | "violet"
  floatingBallEnabled?: boolean
  floatingBallFeatures?: FloatingBallFeature[]
  lanEnabled?: boolean
}

interface Settings {
  hotkey: string
  hotkeys: {
    launcher: string
    screenshot: string
  }
  themeMode: "light" | "dark" | "system"
  accent: "neutral" | "blue" | "green" | "rose" | "violet"
  floatingBallEnabled: boolean
  floatingBallFeatures: FloatingBallFeature[]
  lanEnabled: boolean
}

type ScreenshotAction = "copy" | "save" | "pin" | "annotate" | "ocr"

interface SyncStatus {
  configured: boolean
  enabled: boolean
  loggedIn: boolean
  githubUserLogin?: string
  gistId?: string
  deviceId: string
  lastSyncedAt?: string
  lastRemoteUpdatedAt?: string
  lastLocalUpdatedAt?: string
  rememberPassphrase: boolean
  hasSavedPassphrase: boolean
  pendingConflict?: { updatedAt: string; deviceId: string }
}

interface GitHubDeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

type GitHubLoginPollResult =
  | { status: "pending" | "slow_down" | "expired" | "denied" }
  | { status: "authenticated"; login: string }

type SyncRunResult =
  | { status: "empty" | "created" | "updated" | "applied" }
  | { status: "conflict"; conflict: { updatedAt: string; deviceId: string } }

const electronAPI = {
  // ---- Launcher ----
  searchApps: (query: string) => ipcRenderer.invoke("launcher:search", query),
  launchApp: (id: string, query?: string) => ipcRenderer.invoke("launcher:launch", id, query),
  refreshApps: () => ipcRenderer.invoke("launcher:refresh"),
  clearSearchLearning: () => ipcRenderer.invoke("launcher:clear-search-learning"),
  hideLauncher: () => ipcRenderer.invoke("launcher:hide"),
  openExternalUrl: (url: string) => ipcRenderer.invoke("system:open-external", url),
  writeClipboardContent: (content: unknown) =>
    ipcRenderer.invoke("system:write-clipboard", content),
  pasteClipboardContent: (content: unknown) =>
    ipcRenderer.invoke("system:paste-clipboard", content),
  notifyLauncherReady: () => ipcRenderer.send("launcher:ready"),

  // ---- Floating Ball ----
  openFloatingBallFeature: (feature: FloatingBallFeature) =>
    ipcRenderer.invoke("floating-ball:open-feature", feature),
  toggleFloatingBallMenu: () => ipcRenderer.invoke("floating-ball:toggle-menu"),
  startFloatingBallDrag: () => ipcRenderer.invoke("floating-ball:drag-start"),
  moveFloatingBallDrag: () => ipcRenderer.invoke("floating-ball:drag-move"),
  finishFloatingBallDrag: () => ipcRenderer.invoke("floating-ball:drag-end"),
  moveFloatingBallBy: (delta: { x: number; y: number }) =>
    ipcRenderer.invoke("floating-ball:move-by", delta),
  hideFloatingBall: () => ipcRenderer.invoke("floating-ball:hide"),
  notifyFloatingBallMenuPainted: (expanded: boolean) =>
    ipcRenderer.send("floating-ball:menu-painted", expanded),

  // ---- Settings ----
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: SettingsPatch) => ipcRenderer.invoke("settings:update", patch),
  getSyncStatus: (): Promise<SyncStatus> => ipcRenderer.invoke("sync:get-status"),
  saveSyncClientId: (clientId: string): Promise<SyncStatus> =>
    ipcRenderer.invoke("sync:save-client-id", clientId),
  saveSyncGistId: (gistId: string): Promise<SyncStatus> =>
    ipcRenderer.invoke("sync:save-gist-id", gistId),
  startGitHubLogin: (): Promise<GitHubDeviceAuthorization> =>
    ipcRenderer.invoke("sync:github-login-start"),
  pollGitHubLogin: (deviceCode: string): Promise<GitHubLoginPollResult> =>
    ipcRenderer.invoke("sync:github-login-poll", deviceCode),
  configureSyncPassphrase: (passphrase: string, rememberPassphrase: boolean): Promise<SyncStatus> =>
    ipcRenderer.invoke("sync:configure-passphrase", { passphrase, rememberPassphrase }),
  pushSync: (passphrase?: string): Promise<SyncRunResult> =>
    ipcRenderer.invoke("sync:push", passphrase),
  pullSync: (passphrase?: string): Promise<SyncRunResult> =>
    ipcRenderer.invoke("sync:pull", passphrase),
  applyRemoteSync: (): Promise<SyncStatus> => ipcRenderer.invoke("sync:use-remote"),
  applyLocalSync: (passphrase?: string): Promise<SyncRunResult> =>
    ipcRenderer.invoke("sync:use-local", passphrase),
  disconnectSync: (): Promise<SyncStatus> => ipcRenderer.invoke("sync:disconnect"),

  // ---- LAN Transfer ----
  getLanStatus: () => ipcRenderer.invoke("lan:status"),
  listLanDevices: () => ipcRenderer.invoke("lan:devices"),
  listLanPairings: () => ipcRenderer.invoke("lan:pairings"),
  pairLanDevice: (deviceId: string) => ipcRenderer.invoke("lan:pair", deviceId),
  confirmLanPairing: (pairingId: string, sas: string) =>
    ipcRenderer.invoke("lan:pairing-confirm", pairingId, sas),
  rejectLanPairing: (pairingId: string) => ipcRenderer.invoke("lan:pairing-reject", pairingId),
  disconnectLanDevice: (deviceId: string) => ipcRenderer.invoke("lan:disconnect", deviceId),
  listLanTransfers: () => ipcRenderer.invoke("lan:transfers"),
  sendLanFile: (deviceId: string) => ipcRenderer.invoke("lan:send-file", deviceId),
  resumeLanTransfer: (transferId: string) => ipcRenderer.invoke("lan:transfer-resume", transferId),
  acceptLanTransfer: (transferId: string) => ipcRenderer.invoke("lan:transfer-accept", transferId),
  rejectLanTransfer: (transferId: string) => ipcRenderer.invoke("lan:transfer-reject", transferId),
  removeLanTransferHistory: (transferId: string) =>
    ipcRenderer.invoke("lan:transfer-history-remove", transferId),

  // ---- Screenshot ----
  completeScreenshotSelection: (
    selection: { x: number; y: number; width: number; height: number },
    action: ScreenshotAction
  ) => ipcRenderer.send("screenshot:selection-complete", { selection, action }),
  cancelScreenshotSelection: () => ipcRenderer.send("screenshot:selection-cancel"),
  getScreenshotAnnotationImage: () => ipcRenderer.invoke("screenshot:annotation-image"),
  completeScreenshotAnnotation: (dataUrl: string, action: Exclude<ScreenshotAction, "annotate">) =>
    ipcRenderer.send("screenshot:annotation-complete", { dataUrl, action }),
  cancelScreenshotAnnotation: () => ipcRenderer.send("screenshot:annotation-cancel"),
  getPinnedImageData: () => ipcRenderer.invoke("pinned-image:data"),
  copyPinnedImage: () => ipcRenderer.invoke("pinned-image:copy"),
  savePinnedImage: () => ipcRenderer.invoke("pinned-image:save"),
  setPinnedImageOpacity: (opacity: number) =>
    ipcRenderer.invoke("pinned-image:set-opacity", opacity),
  closePinnedImage: () => ipcRenderer.send("pinned-image:close"),
  getScreenshotOcrState: () => ipcRenderer.invoke("screenshot:ocr-state"),
  closeScreenshotOcrWindow: () => ipcRenderer.send("screenshot:ocr-close"),
  recaptureScreenshotOcr: () => ipcRenderer.send("screenshot:ocr-recapture"),
  onScreenshotOcrUpdated: (handler: () => void) => {
    ipcRenderer.on("screenshot:ocr-updated", handler)
    return () => ipcRenderer.off("screenshot:ocr-updated", handler)
  },

  // ---- Plugins ----
  listPlugins: () => ipcRenderer.invoke("plugin:list"),
  getPlugin: (pluginId: string) => ipcRenderer.invoke("plugin:get", pluginId),
  setPluginEnabled: (pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke("plugin:set-enabled", { pluginId, enabled }),
  setPluginPreference: (pluginId: string, key: string, value: unknown) =>
    ipcRenderer.invoke("plugin:set-preference", { pluginId, key, value }),
  installPluginFolder: (folderPath: string) =>
    ipcRenderer.invoke("plugin:install-folder", folderPath),
  installPluginPackage: (zipPath: string) => ipcRenderer.invoke("plugin:install-package", zipPath),
  installPluginPackageFromDialog: () => ipcRenderer.invoke("plugin:install-package-from-dialog"),
  uninstallPlugin: (pluginId: string) => ipcRenderer.invoke("plugin:uninstall", pluginId),
  reloadPlugin: (pluginId?: string) => ipcRenderer.invoke("plugin:reload", pluginId),
  searchPluginCommands: (query: string, locale?: string, limit?: number) =>
    ipcRenderer.invoke("plugin:search-commands", { query, locale, limit }),
  invokePluginCommand: (
    pluginId: string,
    commandId: string,
    phase: "run" | "onSearchChange" | "onAction",
    payload?: unknown,
    query?: string
  ) => ipcRenderer.invoke("plugin:invoke", { pluginId, commandId, phase, payload, query }),
  disposePluginCommand: (pluginId: string, commandId: string) =>
    ipcRenderer.invoke("plugin:dispose-command", { pluginId, commandId }),
  listMarketplacePlugins: () => ipcRenderer.invoke("marketplace:list"),
  previewMarketplacePluginInstall: (id: string, version?: string) =>
    ipcRenderer.invoke("marketplace:preview-install", { id, version }),
  installMarketplacePlugin: (id: string, version?: string) =>
    ipcRenderer.invoke("marketplace:install", { id, version }),

  // Subscribe to the "search window just gained focus" pulse so the
  // renderer can reset its input + selection without polling.
  onLauncherFocus: (handler: () => void): (() => void) => {
    const listener = (): void => handler()
    ipcRenderer.on("launcher:focus", listener)
    return () => ipcRenderer.removeListener("launcher:focus", listener)
  },

  onFloatingBallMenuState: (handler: (expanded: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, expanded: boolean): void => handler(expanded)
    ipcRenderer.on("floating-ball:menu-state", listener)
    return () => ipcRenderer.removeListener("floating-ball:menu-state", listener)
  },

  onFloatingBallFeatures: (handler: (features: FloatingBallFeature[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, features: FloatingBallFeature[]): void =>
      handler(features)
    ipcRenderer.on("floating-ball:features", listener)
    return () => ipcRenderer.removeListener("floating-ball:features", listener)
  },

  onLauncherRunPluginCommand: (
    handler: (command: { pluginId: string; commandId: string }) => void
  ): (() => void) => {
    const listener = (
      _event: IpcRendererEvent,
      command: { pluginId: string; commandId: string }
    ): void => handler(command)
    ipcRenderer.on("launcher:run-plugin-command", listener)
    return () => ipcRenderer.removeListener("launcher:run-plugin-command", listener)
  },

  onPluginRegistryChanged: (handler: (plugins: unknown[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, plugins: unknown[]): void => handler(plugins)
    ipcRenderer.on("plugins:registry-changed", listener)
    return () => ipcRenderer.removeListener("plugins:registry-changed", listener)
  },

  // Pushed by main after any settings:update so that windows other than
  // the one that initiated the change (notably the long-lived launcher
  // window) can re-apply theme/hotkey state without a reload.
  onSettingsChanged: (handler: (settings: Settings) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, settings: Settings): void => handler(settings)
    ipcRenderer.on("settings:changed", listener)
    return () => ipcRenderer.removeListener("settings:changed", listener)
  },

  onLanDevicesChanged: (handler: (devices: unknown[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, devices: unknown[]): void => handler(devices)
    ipcRenderer.on("lan:devices-changed", listener)
    return () => ipcRenderer.removeListener("lan:devices-changed", listener)
  },

  onLanStatusChanged: (handler: (status: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: unknown): void => handler(status)
    ipcRenderer.on("lan:status-changed", listener)
    return () => ipcRenderer.removeListener("lan:status-changed", listener)
  },

  onLanPairingsChanged: (handler: (pairings: unknown[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, pairings: unknown[]): void => handler(pairings)
    ipcRenderer.on("lan:pairings-changed", listener)
    return () => ipcRenderer.removeListener("lan:pairings-changed", listener)
  },

  onLanTransfersChanged: (handler: (transfers: unknown[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, transfers: unknown[]): void => handler(transfers)
    ipcRenderer.on("lan:transfers-changed", listener)
    return () => ipcRenderer.removeListener("lan:transfers-changed", listener)
  },
} as const

contextBridge.exposeInMainWorld("electronAPI", electronAPI)

export type ElectronAPI = typeof electronAPI
