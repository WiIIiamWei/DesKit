/**
 * Detects whether the app is running inside an Electron renderer.
 * Use this to gate any code that calls IPC so the same component
 * works in both `pnpm dev` (web) and `pnpm electron:dev` (desktop).
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI)
}

function api(): NonNullable<Window["electronAPI"]> {
  if (!window.electronAPI) {
    throw new Error("electronAPI is unavailable — not running in Electron (preload did not run)")
  }
  return window.electronAPI
}

export type AppEntry = LauncherAppEntry
export type SearchResult = LauncherSearchResult
export type UserSettings = DeskitUserSettings
export type FloatingBallFeature = DeskitFloatingBallFeature
export type PluginRegistryEntry = DeskitPluginRegistryEntry
export type MarketplaceEntry = DeskitMarketplaceEntry
export type PluginCommandResult = DeskitPluginCommandResult
export type PluginInvokePhase = DeskitPluginInvokePhase
export type PluginView = DeskitPluginView
export type SyncStatus = DeskitSyncStatus
export type GitHubDeviceAuthorization = DeskitGitHubDeviceAuthorization
export type GitHubLoginPollResult = DeskitGitHubLoginPollResult
export type SyncRunResult = DeskitSyncRunResult
export type PluginIpcError = DeskitPluginIpcError
export type PluginIpcErrorCode = DeskitPluginIpcErrorCode
type PluginIpcResult<T> = DeskitPluginIpcResult<T>

export class ElectronIpcError extends Error {
  readonly code: PluginIpcErrorCode
  readonly details?: Record<string, unknown>

  constructor(error: PluginIpcError) {
    super(error.message)
    this.name = "ElectronIpcError"
    this.code = error.code
    this.details = error.details
  }
}

function unwrapIpcResult<T>(result: PluginIpcResult<T>): T {
  if (result.ok) return result.data
  throw new ElectronIpcError(result.error)
}

/**
 * Type-safe wrappers for IPC commands defined in src/main/index.ts.
 * Keep this file as the SOLE caller of `window.electronAPI` — business
 * code imports named functions from here, never `electronAPI` directly.
 */
export async function searchApps(query: string): Promise<SearchResult[]> {
  return api().searchApps(query)
}

export async function launchApp(id: string): Promise<boolean> {
  return api().launchApp(id)
}

export async function refreshApps(): Promise<AppEntry[]> {
  return api().refreshApps()
}

export async function hideLauncher(): Promise<void> {
  await api().hideLauncher()
}

export async function openExternalUrl(url: string): Promise<boolean> {
  return api().openExternalUrl(url)
}

export async function writeClipboardContent(content: DeskitClipboardContent): Promise<boolean> {
  return api().writeClipboardContent(content)
}

export async function pasteClipboardContent(content: DeskitClipboardContent): Promise<boolean> {
  return api().pasteClipboardContent(content)
}

export function notifyLauncherReady(): void {
  api().notifyLauncherReady()
}

export async function openFloatingBallFeature(feature: FloatingBallFeature): Promise<void> {
  await api().openFloatingBallFeature(feature)
}

export async function toggleFloatingBallMenu(): Promise<void> {
  await api().toggleFloatingBallMenu()
}

export async function moveFloatingBallBy(delta: { x: number; y: number }): Promise<void> {
  await api().moveFloatingBallBy(delta)
}

export async function hideFloatingBall(): Promise<void> {
  await api().hideFloatingBall()
}

export async function getSettings(): Promise<UserSettings> {
  return api().getSettings()
}

export async function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  return api().updateSettings(patch)
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return api().getSyncStatus()
}

export async function saveSyncClientId(clientId: string): Promise<SyncStatus> {
  return api().saveSyncClientId(clientId)
}

export async function saveSyncGistId(gistId: string): Promise<SyncStatus> {
  return api().saveSyncGistId(gistId)
}

export async function startGitHubLogin(): Promise<GitHubDeviceAuthorization> {
  return api().startGitHubLogin()
}

export async function pollGitHubLogin(deviceCode: string): Promise<GitHubLoginPollResult> {
  return api().pollGitHubLogin(deviceCode)
}

export async function configureSyncPassphrase(
  passphrase: string,
  rememberPassphrase: boolean
): Promise<SyncStatus> {
  return api().configureSyncPassphrase(passphrase, rememberPassphrase)
}

export async function pushSync(passphrase?: string): Promise<SyncRunResult> {
  return api().pushSync(passphrase)
}

export async function pullSync(passphrase?: string): Promise<SyncRunResult> {
  return api().pullSync(passphrase)
}

export async function applyRemoteSync(): Promise<SyncStatus> {
  return api().applyRemoteSync()
}

export async function applyLocalSync(passphrase?: string): Promise<SyncRunResult> {
  return api().applyLocalSync(passphrase)
}

export async function disconnectSync(): Promise<SyncStatus> {
  return api().disconnectSync()
}

export async function completeScreenshotSelection(
  selection: { x: number; y: number; width: number; height: number },
  action: DeskitScreenshotAction
): Promise<void> {
  api().completeScreenshotSelection(selection, action)
}

export async function cancelScreenshotSelection(): Promise<void> {
  api().cancelScreenshotSelection()
}

export async function getScreenshotAnnotationImage(): Promise<string | null> {
  return api().getScreenshotAnnotationImage()
}

export async function completeScreenshotAnnotation(
  dataUrl: string,
  action: Exclude<DeskitScreenshotAction, "annotate">
): Promise<void> {
  api().completeScreenshotAnnotation(dataUrl, action)
}

export async function cancelScreenshotAnnotation(): Promise<void> {
  api().cancelScreenshotAnnotation()
}

export async function getPinnedImageData(): Promise<string | null> {
  return api().getPinnedImageData()
}

export async function copyPinnedImage(): Promise<void> {
  await api().copyPinnedImage()
}

export async function savePinnedImage(): Promise<void> {
  await api().savePinnedImage()
}

export async function setPinnedImageOpacity(opacity: number): Promise<void> {
  await api().setPinnedImageOpacity(opacity)
}

export async function closePinnedImage(): Promise<void> {
  api().closePinnedImage()
}

export async function listPlugins(): Promise<PluginRegistryEntry[]> {
  return unwrapIpcResult(await api().listPlugins())
}

export async function getPlugin(pluginId: string): Promise<PluginRegistryEntry | null> {
  return unwrapIpcResult(await api().getPlugin(pluginId))
}

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean
): Promise<PluginRegistryEntry> {
  return unwrapIpcResult(await api().setPluginEnabled(pluginId, enabled))
}

export async function setPluginPreference(
  pluginId: string,
  key: string,
  value: unknown
): Promise<void> {
  unwrapIpcResult(await api().setPluginPreference(pluginId, key, value))
}

export async function installPluginFolder(folderPath: string): Promise<PluginRegistryEntry> {
  return unwrapIpcResult(await api().installPluginFolder(folderPath))
}

export async function installPluginPackage(zipPath: string): Promise<PluginRegistryEntry> {
  return unwrapIpcResult(await api().installPluginPackage(zipPath))
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  unwrapIpcResult(await api().uninstallPlugin(pluginId))
}

export async function reloadPlugin(pluginId?: string): Promise<PluginRegistryEntry | undefined> {
  return unwrapIpcResult(await api().reloadPlugin(pluginId))
}

export async function searchPluginCommands(
  query: string,
  locale?: string,
  limit?: number
): Promise<PluginCommandResult[]> {
  return unwrapIpcResult(await api().searchPluginCommands(query, locale, limit))
}

export async function invokePluginCommand(
  pluginId: string,
  commandId: string,
  phase: PluginInvokePhase,
  payload?: unknown
): Promise<PluginView | void> {
  return unwrapIpcResult(await api().invokePluginCommand(pluginId, commandId, phase, payload))
}

export async function disposePluginCommand(pluginId: string, commandId: string): Promise<void> {
  unwrapIpcResult(await api().disposePluginCommand(pluginId, commandId))
}

export async function listMarketplacePlugins(): Promise<MarketplaceEntry[]> {
  return unwrapIpcResult(await api().listMarketplacePlugins())
}

export async function installMarketplacePlugin(
  id: string,
  version?: string
): Promise<PluginRegistryEntry> {
  return unwrapIpcResult(await api().installMarketplacePlugin(id, version))
}

export function onLauncherFocus(handler: () => void): () => void {
  return api().onLauncherFocus(handler)
}

export function onFloatingBallMenuState(handler: (expanded: boolean) => void): () => void {
  return api().onFloatingBallMenuState(handler)
}

export function onFloatingBallFeatures(
  handler: (features: FloatingBallFeature[]) => void
): () => void {
  return api().onFloatingBallFeatures(handler)
}

export function onLauncherRunPluginCommand(
  handler: (command: { pluginId: string; commandId: string }) => void
): () => void {
  return api().onLauncherRunPluginCommand(handler)
}

export function onPluginRegistryChanged(
  handler: (plugins: PluginRegistryEntry[]) => void
): () => void {
  return api().onPluginRegistryChanged(handler)
}

export function onSettingsChanged(handler: (settings: UserSettings) => void): () => void {
  return api().onSettingsChanged(handler)
}
