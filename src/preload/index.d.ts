// Global typings for the surface exposed by src/preload/index.ts.
// Kept in the preload package so the renderer and the preload always
// agree on the contract.

export {}

declare global {
  type LauncherAppKind = "win32" | "uwp" | "url" | "macos"
  type DeskitFloatingBallFeature = "appLauncher" | "screenshot" | `plugin:${string}:${string}`

  interface LauncherAppEntry {
    id: string
    kind: LauncherAppKind
    name: string
    nameLower: string
    target: string
    description?: string
    iconPath?: string
  }

  interface LauncherSearchResult {
    entry: LauncherAppEntry
    score: number
    matches: number[]
  }

  type DeskitThemeMode = "light" | "dark" | "system"
  type DeskitThemeAccent = "neutral" | "blue" | "green" | "rose" | "violet"

  interface DeskitHotkeySettings {
    launcher: string
    screenshot: string
  }

  interface DeskitUserSettings {
    hotkey: string
    hotkeys: DeskitHotkeySettings
    themeMode: DeskitThemeMode
    accent: DeskitThemeAccent
    floatingBallEnabled: boolean
    floatingBallFeatures: DeskitFloatingBallFeature[]
  }

  interface DeskitSyncStatus {
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
    pendingConflict?: DeskitSyncConflict
  }

  interface DeskitSyncConflict {
    updatedAt: string
    deviceId: string
  }

  interface DeskitGitHubDeviceAuthorization {
    deviceCode: string
    userCode: string
    verificationUri: string
    expiresIn: number
    interval: number
  }

  type DeskitGitHubLoginPollResult =
    | { status: "pending" | "slow_down" | "expired" | "denied" }
    | { status: "authenticated"; login: string }

  type DeskitSyncRunResult =
    | { status: "empty" | "created" | "updated" | "applied" }
    | { status: "conflict"; conflict: DeskitSyncConflict }

  type DeskitScreenshotAction = "copy" | "save" | "pin" | "annotate"
  type DeskitLocalizedString = string | Record<string, string>
  type DeskitClipboardContent =
    | { type: "text"; text: string }
    | {
        type: "image"
        dataUrl: string
        mimeType: string
        width?: number
        height?: number
        name?: string
      }
  type DeskitPluginSourceKind = "builtin" | "user" | "dev"
  type DeskitPluginRuntimeStatus = "active" | "disabled" | "invalid" | "crashed" | "shadowed"
  type DeskitPluginCommandMode = "view" | "no-view"
  type DeskitPluginActivationEvent = "clipboard:change"
  type DeskitPluginInvokePhase = "run" | "onSearchChange" | "onAction"
  type DeskitPluginIpcErrorCode =
    | "IPC_FORBIDDEN"
    | "IPC_INVALID_PAYLOAD"
    | "PLUGIN_NOT_FOUND"
    | "PLUGIN_NOT_ACTIVE"
    | "PLUGIN_PERMISSION_DENIED"
    | "PLUGIN_CRASHED"
    | "PLUGIN_NOT_IMPLEMENTED"
    | "PLUGIN_INSTALL_ERROR"
    | "PLUGIN_IO_ERROR"
    | "UNKNOWN_ERROR"

  interface DeskitPluginIpcError {
    code: DeskitPluginIpcErrorCode
    message: string
    details?: Record<string, unknown>
  }

  type DeskitPluginIpcResult<T> = { ok: true; data: T } | { ok: false; error: DeskitPluginIpcError }

  interface DeskitPluginSource {
    kind: DeskitPluginSourceKind
    priority: number
  }

  interface DeskitManifestCommand {
    id: string
    title: DeskitLocalizedString
    subtitle?: DeskitLocalizedString
    keywords?: string[]
    mode: DeskitPluginCommandMode
    icon?: string
  }

  interface DeskitPluginManifest {
    id: string
    name: string
    displayName: DeskitLocalizedString
    description: DeskitLocalizedString
    version: string
    author: string
    icon?: string
    engines: { deskit: string }
    main: string
    contributes: {
      activationEvents?: DeskitPluginActivationEvent[]
      commands: DeskitManifestCommand[]
      preferences?: Array<{
        id: string
        type: "text" | "number" | "checkbox" | "select" | "shortcut"
        label: DeskitLocalizedString
        default?: unknown
        options?: Array<{ value: string; label: DeskitLocalizedString }>
        command?: string
      }>
    }
    permissions: string[]
  }

  interface DeskitPluginRegistryEntry {
    pluginId: string
    rootDir: string
    source: DeskitPluginSource
    status: DeskitPluginRuntimeStatus
    manifest?: DeskitPluginManifest
    preferences?: Record<string, unknown>
    error?: string
    shadowedBy?: DeskitPluginSourceKind
    loadedAt?: number
  }

  interface DeskitMarketplaceEntry {
    id: string
    name: string
    displayName: DeskitLocalizedString
    description: DeskitLocalizedString
    author: string
    homepage: string
    version: string
    downloadUrl: string
    sha256: string
    deskitEngine: string
    icon?: string
    categories?: string[]
    permissions?: string[]
  }

  interface DeskitMarketplaceInstallPreview {
    entry: DeskitMarketplaceEntry
    manifest: DeskitPluginManifest
  }

  interface DeskitPluginCommandResult {
    kind: "plugin-command"
    pluginId: string
    commandId: string
    title: DeskitLocalizedString
    subtitle?: DeskitLocalizedString
    icon?: string
    mode: DeskitPluginCommandMode
    score: number
    matches: number[]
  }

  type DeskitPluginView =
    | { type: "list"; [key: string]: unknown }
    | { type: "detail"; [key: string]: unknown }
    | { type: "form"; [key: string]: unknown }
    | { type: "toast"; [key: string]: unknown }

  interface Window {
    electronAPI?: {
      searchApps: (query: string) => Promise<LauncherSearchResult[]>
      launchApp: (id: string) => Promise<boolean>
      refreshApps: () => Promise<LauncherAppEntry[]>
      hideLauncher: () => Promise<void>
      openExternalUrl: (url: string) => Promise<boolean>
      writeClipboardContent: (content: DeskitClipboardContent) => Promise<boolean>
      pasteClipboardContent: (content: DeskitClipboardContent) => Promise<boolean>
      notifyLauncherReady: () => void
      openFloatingBallFeature: (feature: DeskitFloatingBallFeature) => Promise<void>
      toggleFloatingBallMenu: () => Promise<void>
      startFloatingBallDrag: () => Promise<void>
      moveFloatingBallDrag: () => Promise<void>
      finishFloatingBallDrag: () => Promise<void>
      moveFloatingBallBy: (delta: { x: number; y: number }) => Promise<void>
      hideFloatingBall: () => Promise<void>
      notifyFloatingBallMenuPainted: (expanded: boolean) => void
      getSettings: () => Promise<DeskitUserSettings>
      updateSettings: (patch: Partial<DeskitUserSettings>) => Promise<DeskitUserSettings>
      getSyncStatus: () => Promise<DeskitSyncStatus>
      saveSyncClientId: (clientId: string) => Promise<DeskitSyncStatus>
      saveSyncGistId: (gistId: string) => Promise<DeskitSyncStatus>
      startGitHubLogin: () => Promise<DeskitGitHubDeviceAuthorization>
      pollGitHubLogin: (deviceCode: string) => Promise<DeskitGitHubLoginPollResult>
      configureSyncPassphrase: (
        passphrase: string,
        rememberPassphrase: boolean
      ) => Promise<DeskitSyncStatus>
      pushSync: (passphrase?: string) => Promise<DeskitSyncRunResult>
      pullSync: (passphrase?: string) => Promise<DeskitSyncRunResult>
      applyRemoteSync: () => Promise<DeskitSyncStatus>
      applyLocalSync: (passphrase?: string) => Promise<DeskitSyncRunResult>
      disconnectSync: () => Promise<DeskitSyncStatus>
      completeScreenshotSelection: (
        selection: { x: number; y: number; width: number; height: number },
        action: DeskitScreenshotAction
      ) => void
      cancelScreenshotSelection: () => void
      getScreenshotAnnotationImage: () => Promise<string | null>
      completeScreenshotAnnotation: (
        dataUrl: string,
        action: Exclude<DeskitScreenshotAction, "annotate">
      ) => void
      cancelScreenshotAnnotation: () => void
      getPinnedImageData: () => Promise<string | null>
      copyPinnedImage: () => Promise<void>
      savePinnedImage: () => Promise<void>
      setPinnedImageOpacity: (opacity: number) => Promise<void>
      closePinnedImage: () => void
      listPlugins: () => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry[]>>
      getPlugin: (
        pluginId: string
      ) => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry | null>>
      setPluginEnabled: (
        pluginId: string,
        enabled: boolean
      ) => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry>>
      setPluginPreference: (
        pluginId: string,
        key: string,
        value: unknown
      ) => Promise<DeskitPluginIpcResult<void>>
      installPluginFolder: (
        folderPath: string
      ) => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry>>
      installPluginPackage: (
        zipPath: string
      ) => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry>>
      installPluginPackageFromDialog: () => Promise<
        DeskitPluginIpcResult<DeskitPluginRegistryEntry | null>
      >
      uninstallPlugin: (pluginId: string) => Promise<DeskitPluginIpcResult<void>>
      reloadPlugin: (
        pluginId?: string
      ) => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry | undefined>>
      searchPluginCommands: (
        query: string,
        locale?: string,
        limit?: number
      ) => Promise<DeskitPluginIpcResult<DeskitPluginCommandResult[]>>
      invokePluginCommand: (
        pluginId: string,
        commandId: string,
        phase: DeskitPluginInvokePhase,
        payload?: unknown
      ) => Promise<DeskitPluginIpcResult<DeskitPluginView | void>>
      disposePluginCommand: (
        pluginId: string,
        commandId: string
      ) => Promise<DeskitPluginIpcResult<void>>
      listMarketplacePlugins: () => Promise<DeskitPluginIpcResult<DeskitMarketplaceEntry[]>>
      previewMarketplacePluginInstall: (
        id: string,
        version?: string
      ) => Promise<DeskitPluginIpcResult<DeskitMarketplaceInstallPreview>>
      installMarketplacePlugin: (
        id: string,
        version?: string
      ) => Promise<DeskitPluginIpcResult<DeskitPluginRegistryEntry>>
      onLauncherFocus: (handler: () => void) => () => void
      onFloatingBallMenuState: (handler: (expanded: boolean) => void) => () => void
      onFloatingBallFeatures: (
        handler: (features: DeskitFloatingBallFeature[]) => void
      ) => () => void
      onLauncherRunPluginCommand: (
        handler: (command: { pluginId: string; commandId: string }) => void
      ) => () => void
      onPluginRegistryChanged: (
        handler: (plugins: DeskitPluginRegistryEntry[]) => void
      ) => () => void
      onSettingsChanged: (handler: (settings: DeskitUserSettings) => void) => () => void
    }
  }
}
