import type { ClipboardContent } from "@deskit/plugin-sdk"
import type { IpcMainInvokeEvent } from "electron"
import type { PluginRegistryEntry } from "./plugins/types"
import type { SearchWindowDeps } from "./search-window"
import type { FloatingBallFeature, UserSettingsPatch } from "./settings/settings"
import type {
  DeskitSyncPayload,
  PullSyncResult,
  PushSyncResult,
} from "./sync/settings-sync-service"
import { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron"
import { defaultAppIcon } from "./app-icon"
import { applyScreenshotColorProfileWorkaround } from "./chromium-color-profile"
import { pruneUnavailableFloatingBallFeatures } from "./floating-ball-features"
import {
  destroyFloatingBallWindow,
  hideFloatingBallWindow,
  moveFloatingBallBy,
  openFloatingBallFeature,
  syncFloatingBallWindow,
  toggleFloatingBallMenu,
} from "./floating-ball-window"
import { LauncherService } from "./ipc/launcher-service"
import { registerPluginIpc } from "./ipc/plugins"
import { defaultNotificationIcon, showStartupNotification } from "./notifications"
import { collectPluginShortcutBindings } from "./plugin-shortcuts"
import { createElectronPluginAdapters } from "./plugins/electron-adapters"
import { resolvePluginIconFile } from "./plugins/icon-paths"
import { PluginHost } from "./plugins/plugin-host"
import { getContentType, resolveStaticPath } from "./protocol/resolve-static-path"
import {
  cancelScreenshotAnnotation,
  completeScreenshotAnnotation,
  getScreenshotAnnotatorImage,
  openScreenshotAnnotator,
} from "./screenshot/annotator-window"
import { captureSelectionBitmap } from "./screenshot/capture-bitmap"
import { captureRegion } from "./screenshot/capture-region"
import {
  cancelScreenshotOverlay,
  completeScreenshotOverlay,
  selectScreenshotRegion,
} from "./screenshot/overlay-window"
import {
  closePinnedImageWindow,
  createPinnedImageState,
  createPinnedImageWindow,
  getPinnedImageDataUrl,
  setPinnedImageOpacity,
} from "./screenshot/pinned-image-window"
import {
  cleanupScreenshotTempDir,
  deleteScreenshotTempFile,
  ensureScreenshotSavePath,
  ensureScreenshotTempDir,
} from "./screenshot/screenshot-store"
import {
  consumeSearchWindowTrayOpenSuppression,
  ensureSearchWindow,
  hideSearchWindow,
  markSearchWindowReady,
  setSearchWindowQuitting,
  showSearchWindow,
  showSearchWindowForPluginCommand,
  toggleSearchWindow,
} from "./search-window"
import {
  bindGlobalShortcut,
  currentBinding,
  unbindAllGlobalShortcuts,
  unbindGlobalShortcut,
} from "./shortcut"
import { DEFAULT_GITHUB_OAUTH_CLIENT_ID } from "./sync/defaults"
import { GitHubGistClient, GitHubGistClientError } from "./sync/gist-client"
import { SettingsSyncService } from "./sync/settings-sync-service"
import { syncStateFilePath, SyncStateStore } from "./sync/sync-store"
import { pasteClipboardIntoActiveApp } from "./system-paste"
import { createTray, defaultTrayIcon, destroyTray, refreshTrayMenu } from "./tray"
import { attachWindowSecurity } from "./window-security"

const isDev = !app.isPackaged
// electron-vite injects this in dev (Vite dev server URL). Undefined in prod.
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL

// Custom scheme used for the production renderer. Loading the renderer at
// `app://app/index.html` makes absolute asset paths (`/assets/...`) resolve
// to `app://app/assets/...`, which the handler maps to files under
// `out/renderer/`. Loading via `file://` would make the same paths resolve
// to the filesystem root and 404 every asset.
const APP_SCHEME = "app"
const APP_ORIGIN = `${APP_SCHEME}://app`
const PLUGIN_ICON_PATH_PREFIX = "/plugin-icons/"
const LAUNCHER_SHORTCUT_ID = "launcher"
const SCREENSHOT_SHORTCUT_ID = "screenshot"

applyScreenshotColorProfileWorkaround()

// Must be called *before* app is ready. Marking the scheme `standard` and
// `secure` makes its origin behave like https for CORS, cookies, and CSP.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
  "object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'"

function devCsp(devOrigin: string): string {
  const ws = devOrigin.replace(/^http/, "ws")
  return (
    `default-src 'self' ${devOrigin} ${ws}; ` +
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devOrigin}; ` +
    `style-src 'self' 'unsafe-inline' ${devOrigin}; ` +
    `img-src 'self' data: blob: ${devOrigin} ${APP_ORIGIN}; ` +
    `font-src 'self' data: ${devOrigin}; ` +
    `connect-src 'self' ${devOrigin} ${ws}`
  )
}

function applyCsp(): void {
  const csp = isDev && rendererDevUrl ? devCsp(rendererDevUrl) : PROD_CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    })
  })
}

const launcher = new LauncherService()
let plugins: PluginHost
let syncState: SyncStateStore
let syncService: SettingsSyncService
let syncUploadTimer: NodeJS.Timeout | undefined
let sessionPassphrase: string | undefined
let pendingSyncConflict: DeskitSyncPayload | undefined
let mainWindow: BrowserWindow | null = null
let pluginShortcutIds = new Set<string>()
// Tracks whether quit was explicitly requested through the tray menu, so
// the main-window close handler can distinguish "user clicked X" (hide)
// from "user picked Quit" (let the close go through).
let quitRequested = false

function registerStaticProtocol(): void {
  // electron-vite emits the renderer bundle to out/renderer/, which sits
  // next to out/main/index.js after build.
  const root = path.join(__dirname, "../renderer")

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.pathname.startsWith(PLUGIN_ICON_PATH_PREFIX)) {
      return servePluginIcon(url)
    }

    const resolved = resolveStaticPath(url.pathname, root)

    if (resolved.kind === "forbidden") {
      return new Response("Forbidden", { status: 403 })
    }

    // `net.fetch` reads the file (transparently handling asar) and returns a
    // Response with proper streaming. We override Content-Type because some
    // extensions (`.woff2`, `.wasm`) are not always inferred correctly.
    const fileUrl = pathToFileURL(resolved.filePath).toString()
    const response = await net.fetch(fileUrl, { bypassCustomProtocolHandlers: true })
    if (!response.ok) {
      return response
    }
    const headers = new Headers(response.headers)
    headers.set("content-type", getContentType(resolved.filePath))
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  })
}

async function servePluginIcon(url: URL): Promise<Response> {
  const pluginId = parsePluginIconRequestPluginId(url)
  const iconPath = url.searchParams.get("path")
  if (!pluginId || !iconPath) {
    return new Response("Forbidden", { status: 403 })
  }

  const entry = plugins?.get(pluginId)
  if (!entry?.manifest || !isDeclaredPluginIcon(entry, iconPath)) {
    return new Response("Not Found", { status: 404 })
  }

  const filePath = resolvePluginIconFile(entry.rootDir, iconPath)
  if (!filePath) {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const response = await net.fetch(pathToFileURL(filePath).toString(), {
      bypassCustomProtocolHandlers: true,
    })
    if (!response.ok) return response
    const headers = new Headers(response.headers)
    headers.set("content-type", getContentType(filePath))
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch {
    return new Response("Not Found", { status: 404 })
  }
}

function parsePluginIconRequestPluginId(url: URL): string | null {
  const encoded = url.pathname.slice(PLUGIN_ICON_PATH_PREFIX.length)
  if (!encoded || encoded.includes("/")) return null
  let pluginId: string
  try {
    pluginId = decodeURIComponent(encoded)
  } catch {
    return null
  }
  if (!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/.test(pluginId)) return null
  return pluginId
}

function isDeclaredPluginIcon(entry: PluginRegistryEntry, iconPath: string): boolean {
  if (entry.manifest?.icon === iconPath) return true
  return entry.manifest?.contributes.commands.some((command) => command.icon === iconPath) ?? false
}

function registerIpc(): void {
  ipcMain.handle("launcher:search", (_event, query: unknown) => {
    return launcher.search(typeof query === "string" ? query : "")
  })

  ipcMain.handle("launcher:launch", async (_event, id: unknown) => {
    if (typeof id !== "string") return false
    const ok = await launcher.launchById(id)
    if (ok) hideSearchWindow()
    return ok
  })

  ipcMain.handle("launcher:refresh", () => launcher.refreshApps())

  ipcMain.handle("launcher:hide", () => {
    hideSearchWindow()
  })

  ipcMain.handle("system:open-external", async (event, url: unknown) => {
    if (!isTrustedIpcSender(event) || typeof url !== "string") return false
    let target: URL
    try {
      target = new URL(url)
    } catch {
      return false
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") return false
    await shell.openExternal(target.toString())
    return true
  })

  ipcMain.handle("system:write-clipboard", async (event, content: unknown) => {
    if (!isTrustedIpcSender(event) || !isClipboardContent(content)) return false
    writeClipboardContent(content)
    return true
  })

  ipcMain.handle("system:paste-clipboard", async (event, content: unknown) => {
    if (!isTrustedIpcSender(event) || !isClipboardContent(content)) return false
    writeClipboardContent(content)
    hideSearchWindow()
    return pasteClipboardIntoActiveApp()
  })

  ipcMain.on("launcher:ready", (event) => {
    markSearchWindowReady(event.sender)
  })

  ipcMain.handle("floating-ball:toggle-menu", () => {
    toggleFloatingBallMenu()
  })

  ipcMain.handle("floating-ball:open-feature", (_event, feature: unknown) => {
    if (isFloatingBallFeature(feature)) {
      openFloatingBallFeature(feature)
    }
  })

  ipcMain.handle("floating-ball:hide", async () => {
    await disableFloatingBall()
  })

  ipcMain.handle("floating-ball:move-by", (_event, delta: unknown) => {
    if (!delta || typeof delta !== "object") return
    const value = delta as Record<string, unknown>
    if (typeof value.x !== "number" || typeof value.y !== "number") return
    moveFloatingBallBy({ x: value.x, y: value.y })
  })

  ipcMain.handle("settings:get", () => launcher.getSettings())

  ipcMain.handle("settings:update", async (_event, patch: unknown) => {
    const previous = launcher.getSettings()
    let next = await launcher.updateSettings(coercePatch(patch))

    if (
      next.hotkeys.launcher !== previous.hotkeys.launcher &&
      !rebindLauncherHotkey(next.hotkeys.launcher)
    ) {
      next = await launcher.updateSettings({
        hotkeys: { ...next.hotkeys, launcher: previous.hotkeys.launcher },
      })
    }
    if (
      next.hotkeys.screenshot !== previous.hotkeys.screenshot &&
      !rebindScreenshotHotkey(next.hotkeys.screenshot)
    ) {
      next = await launcher.updateSettings({
        hotkeys: { ...next.hotkeys, screenshot: previous.hotkeys.screenshot },
      })
    }

    refreshTrayMenu(trayActions())
    syncFloatingBallWindow(floatingBallDeps())
    broadcastSettingsChanged(next)
    markSyncLocalChanged()
    return next
  })

  ipcMain.on("screenshot:selection-complete", (event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return
    const value = payload as Record<string, unknown>
    const selection = value.selection
    if (!selection || typeof selection !== "object") return
    const s = selection as Record<string, unknown>
    const action = value.action
    if (action !== "copy" && action !== "save" && action !== "pin" && action !== "annotate") {
      return
    }
    if (
      typeof s.x !== "number" ||
      typeof s.y !== "number" ||
      typeof s.width !== "number" ||
      typeof s.height !== "number"
    ) {
      return
    }
    completeScreenshotOverlay(
      event.sender,
      { x: s.x, y: s.y, width: s.width, height: s.height },
      action
    )
  })

  ipcMain.on("screenshot:selection-cancel", (event) => {
    cancelScreenshotOverlay(event.sender)
  })

  ipcMain.handle("screenshot:annotation-image", (event) => {
    return getScreenshotAnnotatorImage(event.sender)
  })

  ipcMain.on("screenshot:annotation-complete", (event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return
    const value = payload as Record<string, unknown>
    const action = value.action
    if (action !== "copy" && action !== "save" && action !== "pin") return
    if (typeof value.dataUrl !== "string" || !value.dataUrl.startsWith("data:image/png;base64,")) {
      return
    }
    completeScreenshotAnnotation(event.sender, { action, dataUrl: value.dataUrl })
  })

  ipcMain.on("screenshot:annotation-cancel", (event) => {
    cancelScreenshotAnnotation(event.sender)
  })

  ipcMain.handle("pinned-image:data", (event) => {
    return getPinnedImageDataUrl(event.sender)
  })

  ipcMain.handle("pinned-image:copy", (event) => {
    const dataUrl = getPinnedImageDataUrl(event.sender)
    if (dataUrl) clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
  })

  ipcMain.handle("pinned-image:save", async (event) => {
    const dataUrl = getPinnedImageDataUrl(event.sender)
    if (dataUrl) await handleScreenshotDataUrl(dataUrl, "save")
  })

  ipcMain.handle("pinned-image:set-opacity", (event, opacity: unknown) => {
    if (typeof opacity === "number") setPinnedImageOpacity(event.sender, opacity)
  })

  ipcMain.on("pinned-image:close", (event) => {
    closePinnedImageWindow(event.sender)
  })

  ipcMain.handle("sync:get-status", () => syncStatus())

  ipcMain.handle("sync:save-client-id", async (_event, clientId: unknown) => {
    await syncState.update({ githubOAuthClientId: requireString(clientId, "clientId") })
    return syncStatus()
  })

  ipcMain.handle("sync:save-gist-id", async (_event, gistId: unknown) => {
    await syncState.update({ gistId: requireString(gistId, "gistId") })
    return syncStatus()
  })

  ipcMain.handle("sync:github-login-start", async () => {
    const state = syncState.get()
    if (!state.githubOAuthClientId) throw new Error("GitHub OAuth client ID is not configured")
    return githubSyncClient().startDeviceAuthorization(state.githubOAuthClientId)
  })

  ipcMain.handle("sync:github-login-poll", async (_event, deviceCode: unknown) => {
    const state = syncState.get()
    if (!state.githubOAuthClientId) throw new Error("GitHub OAuth client ID is not configured")
    try {
      const token = await githubSyncClient().pollDeviceToken(
        state.githubOAuthClientId,
        requireString(deviceCode, "deviceCode")
      )
      const user = await githubSyncClient().getAuthenticatedUser(token.accessToken)
      await syncState.update({
        encryptedAccessToken: encryptLocalSecret(token.accessToken),
        githubUserLogin: user.login,
      })
      return { status: "authenticated", login: user.login }
    } catch (err) {
      if (err instanceof GitHubGistClientError && err.code) {
        if (err.code === "authorization_pending") return { status: "pending" }
        if (err.code === "slow_down") return { status: "slow_down" }
        if (err.code === "expired_token") return { status: "expired" }
        if (err.code === "access_denied") return { status: "denied" }
      }
      throw err
    }
  })

  ipcMain.handle("sync:configure-passphrase", async (_event, payload: unknown) => {
    const value = requireRecord(payload, "sync passphrase payload")
    const passphrase = requireString(value.passphrase, "passphrase")
    const rememberPassphrase = Boolean(value.rememberPassphrase)
    sessionPassphrase = passphrase
    await syncState.update({
      enabled: true,
      rememberPassphrase,
      encryptedPassphrase: rememberPassphrase ? encryptLocalSecret(passphrase) : undefined,
    })
    void pullSyncWithSavedCredentials().catch((err) =>
      console.warn("[deskit] initial sync pull failed", err)
    )
    return syncStatus()
  })

  ipcMain.handle("sync:push", async (_event, passphrase: unknown) => {
    if (pendingSyncConflict) throw new Error("Resolve the pending sync conflict before pushing")
    return syncRunResult(
      await syncService.push(requireAccessToken(), requirePassphrase(passphrase))
    )
  })

  ipcMain.handle("sync:pull", async (_event, passphrase: unknown) =>
    syncRunResult(await pullSyncWithPassphrase(requirePassphrase(passphrase)))
  )

  ipcMain.handle("sync:use-remote", async () => {
    if (!pendingSyncConflict) throw new Error("No sync conflict is pending")
    await syncService.applyRemote(pendingSyncConflict)
    pendingSyncConflict = undefined
    afterSyncedStateApplied()
    return syncStatus()
  })

  ipcMain.handle("sync:use-local", async (_event, passphrase: unknown) => {
    const result = await syncService.applyLocal(requireAccessToken(), requirePassphrase(passphrase))
    pendingSyncConflict = undefined
    return syncRunResult(result)
  })

  ipcMain.handle("sync:disconnect", async () => {
    sessionPassphrase = undefined
    pendingSyncConflict = undefined
    await syncState.update({
      enabled: false,
      encryptedAccessToken: undefined,
      encryptedPassphrase: undefined,
      githubUserLogin: undefined,
    })
    return syncStatus()
  })

  registerPluginIpc(ipcMain, plugins, {
    isTrustedSender: isTrustedIpcSender,
    onRegistryChanged: handlePluginRegistryChanged,
    onPreferencesChanged: markSyncLocalChanged,
  })
}

function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url || event.sender.getURL()
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }

  if (target.origin === APP_ORIGIN) return true
  if (rendererDevUrl && target.origin === new URL(rendererDevUrl).origin) return true
  return false
}

function isClipboardContent(value: unknown): value is ClipboardContent {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (record.type === "text") return typeof record.text === "string"
  if (record.type === "image") {
    return typeof record.dataUrl === "string" && typeof record.mimeType === "string"
  }
  return false
}

function writeClipboardContent(content: ClipboardContent): void {
  if (content.type === "text") {
    clipboard.writeText(content.text)
    return
  }
  if (content.type === "image") {
    clipboard.writeImage(nativeImage.createFromDataURL(content.dataUrl))
  }
}

function handlePluginRegistryChanged(entries: unknown): void {
  if (isPluginRegistryEntries(entries)) {
    void pruneFloatingBallFeaturesForPlugins(entries).catch((err) =>
      console.error("[floating-ball] failed to prune unavailable plugin features", err)
    )
  }
  syncPluginShortcuts()
  broadcastPluginRegistryChanged(entries)
}

function isPluginRegistryEntries(entries: unknown): entries is PluginRegistryEntry[] {
  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as PluginRegistryEntry).pluginId === "string" &&
        typeof (entry as PluginRegistryEntry).status === "string"
    )
  )
}

async function pruneFloatingBallFeaturesForPlugins(entries: PluginRegistryEntry[]): Promise<void> {
  const current = launcher.getSettings().floatingBallFeatures
  const next = pruneUnavailableFloatingBallFeatures(current, entries)
  if (
    next.length === current.length &&
    next.every((feature, index) => feature === current[index])
  ) {
    return
  }

  const settings = await launcher.updateSettings({ floatingBallFeatures: next })
  refreshTrayMenu(trayActions())
  syncFloatingBallWindow(floatingBallDeps())
  broadcastSettingsChanged(settings)
  markSyncLocalChanged()
}

function broadcastPluginRegistryChanged(entries: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("plugins:registry-changed", entries)
    }
  }
}

function broadcastSettingsChanged(settings: ReturnType<typeof launcher.getSettings>): void {
  // Notify every renderer (main shell + long-lived launcher window) so
  // they can re-apply theme/hotkey state without reloading. Skip
  // destroyed windows defensively to avoid sending to torn-down webContents.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("settings:changed", settings)
    }
  }
}

function coercePatch(value: unknown): UserSettingsPatch {
  if (!value || typeof value !== "object") return {}
  const v = value as Record<string, unknown>
  const out: ReturnType<typeof coercePatch> = {}
  if (typeof v.hotkey === "string") {
    out.hotkeys = { ...out.hotkeys, launcher: v.hotkey }
  }
  if (v.hotkeys && typeof v.hotkeys === "object" && !Array.isArray(v.hotkeys)) {
    const hotkeys = v.hotkeys as Record<string, unknown>
    if (typeof hotkeys.launcher === "string") {
      out.hotkeys = { ...out.hotkeys, launcher: hotkeys.launcher }
    }
    if (typeof hotkeys.screenshot === "string") {
      out.hotkeys = { ...out.hotkeys, screenshot: hotkeys.screenshot }
    }
  }
  if (v.themeMode === "light" || v.themeMode === "dark" || v.themeMode === "system") {
    out.themeMode = v.themeMode
  }
  if (
    v.accent === "neutral" ||
    v.accent === "blue" ||
    v.accent === "green" ||
    v.accent === "rose" ||
    v.accent === "violet"
  ) {
    out.accent = v.accent
  }
  if (typeof v.floatingBallEnabled === "boolean") out.floatingBallEnabled = v.floatingBallEnabled
  if (Array.isArray(v.floatingBallFeatures)) {
    out.floatingBallFeatures = v.floatingBallFeatures.filter(isFloatingBallFeature)
  }
  return out
}

function isFloatingBallFeature(value: unknown): value is FloatingBallFeature {
  return (
    typeof value === "string" &&
    (value === "appLauncher" || value === "screenshot" || isPluginFloatingBallFeature(value))
  )
}

function isPluginFloatingBallFeature(value: string): value is `plugin:${string}:${string}` {
  return /^plugin:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/.test(
    value
  )
}

function createSyncService(): SettingsSyncService {
  return new SettingsSyncService({
    stateStore: syncState,
    gistClient: githubSyncClient(),
    getSettings: () => launcher.getSettings(),
    updateSettings: applySyncedSettings,
    exportPluginPreferences: () => plugins.exportPreferences(),
    importPluginPreferences: (preferences) => plugins.importSyncedPreferences(preferences),
  })
}

function githubSyncClient(): GitHubGistClient {
  return new GitHubGistClient({
    fetch: (url, init) => net.fetch(url instanceof URL ? url.toString() : url, init),
  })
}

async function applySyncedSettings(patch: Partial<ReturnType<typeof launcher.getSettings>>) {
  const previous = launcher.getSettings()
  const requested = coercePatch(patch)
  const requestedHotkeys = requested.hotkeys
  if (
    requestedHotkeys?.launcher &&
    requestedHotkeys.launcher !== previous.hotkeys.launcher &&
    !rebindLauncherHotkey(requestedHotkeys.launcher)
  ) {
    delete requestedHotkeys.launcher
  }
  if (
    requestedHotkeys?.screenshot &&
    requestedHotkeys.screenshot !== previous.hotkeys.screenshot &&
    !rebindScreenshotHotkey(requestedHotkeys.screenshot)
  ) {
    delete requestedHotkeys.screenshot
  }
  if (requestedHotkeys && Object.keys(requestedHotkeys).length === 0) {
    delete requested.hotkeys
  }
  const next = await launcher.updateSettings(requested)
  afterSyncedStateApplied()
  return next
}

function afterSyncedStateApplied(): void {
  refreshTrayMenu(trayActions())
  syncFloatingBallWindow(floatingBallDeps())
  broadcastSettingsChanged(launcher.getSettings())
  broadcastPluginRegistryChanged(plugins.list())
}

function markSyncLocalChanged(): void {
  if (!syncService) return
  void syncService
    .markLocalChanged()
    .then(scheduleSyncUpload)
    .catch((err) => console.warn("[deskit] failed to mark sync local change", err))
}

function scheduleSyncUpload(): void {
  if (pendingSyncConflict) {
    clearScheduledSyncUpload()
    return
  }
  if (syncUploadTimer) clearTimeout(syncUploadTimer)
  syncUploadTimer = setTimeout(() => {
    syncUploadTimer = undefined
    void pushSyncWithSavedCredentials().catch((err) =>
      console.warn("[deskit] background sync upload failed", err)
    )
  }, 3000)
}

function clearScheduledSyncUpload(): void {
  if (!syncUploadTimer) return
  clearTimeout(syncUploadTimer)
  syncUploadTimer = undefined
}

async function pushSyncWithSavedCredentials(): Promise<PushSyncResult | undefined> {
  if (pendingSyncConflict) return undefined
  const state = syncState.get()
  if (!state.enabled || !state.encryptedAccessToken) return undefined
  const passphrase = savedPassphrase()
  if (!passphrase) return undefined
  return syncService.push(decryptLocalSecret(state.encryptedAccessToken), passphrase)
}

async function pullSyncWithSavedCredentials(): Promise<PullSyncResult | undefined> {
  const state = syncState.get()
  if (!state.enabled || !state.encryptedAccessToken) return undefined
  const passphrase = savedPassphrase()
  if (!passphrase) return undefined
  return pullSyncWithPassphrase(passphrase)
}

async function pullSyncWithPassphrase(passphrase: string): Promise<PullSyncResult> {
  const result = await syncService.pull(requireAccessToken(), passphrase)
  if (result.status === "conflict") {
    pendingSyncConflict = result.payload
    clearScheduledSyncUpload()
  }
  if (result.status === "applied") {
    pendingSyncConflict = undefined
    afterSyncedStateApplied()
  }
  return result
}

function syncRunResult(
  result: PullSyncResult | PushSyncResult
):
  | { status: "empty" | "created" | "updated" | "applied" }
  | { status: "conflict"; conflict: { updatedAt: string; deviceId: string } } {
  if (result.status === "conflict") {
    return {
      status: "conflict",
      conflict: {
        updatedAt: result.payload.updatedAt,
        deviceId: result.payload.deviceId,
      },
    }
  }
  return { status: result.status }
}

function syncStatus() {
  const state = syncState.get()
  return {
    configured: Boolean(state.githubOAuthClientId),
    enabled: state.enabled,
    loggedIn: Boolean(state.encryptedAccessToken),
    githubUserLogin: state.githubUserLogin,
    gistId: state.gistId,
    deviceId: state.deviceId,
    lastSyncedAt: state.lastSyncedAt,
    lastRemoteUpdatedAt: state.lastRemoteUpdatedAt,
    lastLocalUpdatedAt: state.lastLocalUpdatedAt,
    rememberPassphrase: state.rememberPassphrase,
    hasSavedPassphrase: Boolean(state.encryptedPassphrase || sessionPassphrase),
    pendingConflict: pendingSyncConflict
      ? { updatedAt: pendingSyncConflict.updatedAt, deviceId: pendingSyncConflict.deviceId }
      : undefined,
  }
}

function requireAccessToken(): string {
  const state = syncState.get()
  if (!state.encryptedAccessToken) throw new Error("GitHub is not connected")
  return decryptLocalSecret(state.encryptedAccessToken)
}

function requirePassphrase(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    sessionPassphrase = value.trim()
    return sessionPassphrase
  }
  const saved = savedPassphrase()
  if (!saved) throw new Error("Sync passphrase is required")
  return saved
}

function savedPassphrase(): string | undefined {
  const state = syncState.get()
  if (sessionPassphrase) return sessionPassphrase
  if (!state.encryptedPassphrase) return undefined
  sessionPassphrase = decryptLocalSecret(state.encryptedPassphrase)
  return sessionPassphrase
}

function encryptLocalSecret(value: string): string {
  ensureSafeStorageEncryptionAvailable()
  return safeStorage.encryptString(value).toString("base64")
}

function decryptLocalSecret(value: string): string {
  ensureSafeStorageEncryptionAvailable()
  return safeStorage.decryptString(Buffer.from(value, "base64"))
}

function ensureSafeStorageEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is not available")
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function searchWindowDeps(): SearchWindowDeps {
  return { rendererDevUrl, appOrigin: APP_ORIGIN }
}

function createPluginHost(): PluginHost {
  const userDataDir = app.getPath("userData")
  const fetchWithNet: typeof fetch = (input, init) =>
    net.fetch(input instanceof URL ? input.toString() : input, init)
  const adapters = createElectronPluginAdapters(userDataDir, { fetch: fetchWithNet })
  return new PluginHost({
    fetch: (url) => fetchWithNet(url),
    userDataDir,
    resourcesDir: pluginResourcesDir(),
    adapters: {
      ...adapters,
      system: {
        ...adapters.system,
        captureRegion: async () => {
          const result = await captureRegion({
            selectRegion: () =>
              selectScreenshotRegion(
                { rendererDevUrl, appOrigin: APP_ORIGIN },
                { mode: "capture" }
              ),
            captureSelection: (selection) => captureSelectionBitmap(selection, { userDataDir }),
          })
          return result
            ? {
                imagePath: result.imagePath,
                width: result.width,
                height: result.height,
                displayId: result.displayId,
              }
            : null
        },
        pinImage: async (imagePath) => {
          createPinnedImageWindow(createPinnedImageState(`pin-${Date.now()}`, imagePath), {
            rendererDevUrl,
            appOrigin: APP_ORIGIN,
          })
        },
      },
    },
    runtime: () => {
      const settings = launcher.getSettings()
      return {
        locale: app.getLocale(),
        theme: {
          mode: settings.themeMode === "dark" ? "dark" : "light",
          accent: settings.accent,
        },
      }
    },
  })
}

function pluginResourcesDir(): string {
  return path.join(app.getAppPath(), "resources")
}

function floatingBallDeps() {
  return {
    rendererDevUrl,
    appOrigin: APP_ORIGIN,
    getSettings: () => launcher.getSettings(),
    getLocale: () => app.getLocale(),
    onOpenFeature: (feature: FloatingBallFeature) => {
      if (feature === "appLauncher") {
        showSearchWindow(searchWindowDeps())
        return
      }
      if (feature === "screenshot") {
        void startScreenshotCapture()
        return
      }
      const command = parseFloatingBallPluginCommand(feature)
      if (!command) return
      showSearchWindowForPluginCommand(searchWindowDeps(), command)
    },
    onDisable: () => {
      void disableFloatingBall()
    },
  }
}

function parseFloatingBallPluginCommand(
  feature: FloatingBallFeature
): { pluginId: string; commandId: string } | null {
  if (!feature.startsWith("plugin:")) return null
  const [, pluginId, commandId] = feature.split(":")
  if (!pluginId || !commandId) return null
  return { pluginId, commandId }
}

async function disableFloatingBall(): Promise<void> {
  const next = await launcher.updateSettings({ floatingBallEnabled: false })
  hideFloatingBallWindow()
  refreshTrayMenu(trayActions())
  broadcastSettingsChanged(next)
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: "DesKit",
    show: false, // launcher app stays in tray; window is shown on demand
    backgroundColor: "#0a0a0a",
    icon: defaultAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  // Closing the main window should hide it, not quit the app — quitting is
  // reserved for the tray menu.
  win.on("close", (event) => {
    if (!quitRequested) {
      event.preventDefault()
      win.hide()
    }
  })

  if (rendererDevUrl) {
    void win.loadURL(rendererDevUrl)
    attachWindowSecurity(win, new URL(rendererDevUrl).origin)
    win.webContents.openDevTools({ mode: "detach" })
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`)
    attachWindowSecurity(win, APP_ORIGIN)
  }

  return win
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function rebindLauncherHotkey(accelerator: string): boolean {
  const ok = bindGlobalShortcut(LAUNCHER_SHORTCUT_ID, accelerator, () =>
    toggleSearchWindow(searchWindowDeps())
  )
  if (!ok) {
    console.warn(`[deskit] failed to register launcher shortcut: ${accelerator}`)
  }
  return ok
}

function rebindScreenshotHotkey(accelerator: string): boolean {
  const ok = bindGlobalShortcut(SCREENSHOT_SHORTCUT_ID, accelerator, () => {
    void startScreenshotCapture()
  })
  if (!ok) {
    console.warn(`[deskit] failed to register screenshot shortcut: ${accelerator}`)
  }
  return ok
}

async function startScreenshotCapture(): Promise<void> {
  const userDataDir = app.getPath("userData")
  let capturedTempPath: string | null = null
  try {
    await cleanupScreenshotTempDir(userDataDir)
    const result = await captureRegion({
      selectRegion: () => selectScreenshotRegion({ rendererDevUrl, appOrigin: APP_ORIGIN }),
      captureSelection: (selection) => captureSelectionBitmap(selection, { userDataDir }),
    })
    if (!result) return
    capturedTempPath = result.imagePath

    if (result.action === "copy") {
      clipboard.writeImage(nativeImage.createFromPath(result.imagePath))
      return
    }
    if (result.action === "save") {
      const savePath = await ensureScreenshotSavePath(app.getPath("pictures"))
      await fs.copyFile(result.imagePath, savePath)
      shell.showItemInFolder(savePath)
      return
    }
    if (result.action === "pin") {
      createPinnedImageWindow(
        createPinnedImageState(`pin-${Date.now()}`, result.imagePath, { deleteOnClose: true }),
        {
          rendererDevUrl,
          appOrigin: APP_ORIGIN,
        }
      )
      capturedTempPath = null
      return
    }
    if (result.action === "annotate") {
      const annotated = await openScreenshotAnnotator(
        { rendererDevUrl, appOrigin: APP_ORIGIN },
        result.imagePath
      )
      await deleteScreenshotTempFile(userDataDir, result.imagePath)
      capturedTempPath = null
      if (!annotated) return
      await handleScreenshotDataUrl(annotated.dataUrl, annotated.action)
    }
  } catch (err) {
    console.error("[deskit] screenshot capture failed", err)
  } finally {
    if (capturedTempPath) await deleteScreenshotTempFile(userDataDir, capturedTempPath)
  }
}

async function handleScreenshotDataUrl(
  dataUrl: string,
  action: "copy" | "save" | "pin"
): Promise<void> {
  if (action === "copy") {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    return
  }

  const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")
  if (action === "save") {
    const savePath = await ensureScreenshotSavePath(app.getPath("pictures"))
    await fs.writeFile(savePath, buffer)
    shell.showItemInFolder(savePath)
    return
  }

  const tempPath = path.join(
    app.getPath("userData"),
    "screenshot-temp",
    `annotated-${Date.now()}.png`
  )
  await ensureScreenshotTempDir(app.getPath("userData"))
  await fs.writeFile(tempPath, buffer)
  createPinnedImageWindow(
    createPinnedImageState(`pin-${Date.now()}`, tempPath, { deleteOnClose: true }),
    {
      rendererDevUrl,
      appOrigin: APP_ORIGIN,
    }
  )
}

function syncPluginShortcuts(): void {
  if (!plugins) return

  const bindings = collectPluginShortcutBindings(plugins.list())
  const nextIds = new Set(bindings.map((binding) => binding.id))
  for (const id of pluginShortcutIds) {
    if (!nextIds.has(id)) unbindGlobalShortcut(id)
  }

  for (const binding of bindings) {
    const ok = bindGlobalShortcut(binding.id, binding.accelerator, () => {
      showSearchWindowForPluginCommand(searchWindowDeps(), {
        pluginId: binding.pluginId,
        commandId: binding.commandId,
      })
    })
    if (!ok) {
      console.warn(
        `[deskit] failed to register plugin shortcut: ${binding.pluginId}.${binding.commandId} (${binding.accelerator})`
      )
      if (!currentBinding(binding.id)) {
        nextIds.delete(binding.id)
      }
    }
  }

  pluginShortcutIds = nextIds
}

function trayActions() {
  return {
    onOpenSearch: () => showSearchWindow(searchWindowDeps()),
    onShowMainWindow: showMainWindow,
    onRefreshApps: () => {
      void launcher.refreshApps()
    },
    onQuit: () => {
      quitRequested = true
      setSearchWindowQuitting(true)
      app.quit()
    },
    getHotkey: () => launcher.getSettings().hotkeys.launcher,
    shouldIgnoreOpenSearch: consumeSearchWindowTrayOpenSuppression,
    getLocale: () => app.getLocale(),
  }
}

// Single-instance lock: focusing the existing packaged app is friendlier than
// silently launching a duplicate process that fights for the same resources.
// In dev, skip the lock so stale Electron processes do not steal restarts and
// leave the visible window stuck on only the BrowserWindow background.
const shouldUseSingleInstanceLock = app.isPackaged
const gotLock = !shouldUseSingleInstanceLock || app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  if (shouldUseSingleInstanceLock) {
    app.on("second-instance", () => {
      // Second launch should re-open the launcher rather than steal focus
      // from whatever the user is doing — matches PowerToys behaviour.
      showSearchWindow(searchWindowDeps())
    })
  }

  void app.whenReady().then(async () => {
    // Match package.json build.appId so Windows recognises the app
    // identity and the post-install Start Menu shortcut's icon flows
    // through to toast notifications. Without this the OS treats us
    // as "electron.app.Electron" and shows Electron's default logo.
    if (process.platform === "win32") {
      app.setAppUserModelId("com.deskit.desktop")
    }

    applyCsp()
    registerStaticProtocol()
    plugins = createPluginHost()
    syncState = new SyncStateStore(syncStateFilePath(app.getPath("userData")))
    await syncState.load()
    const defaultClientId =
      process.env.DESKIT_GITHUB_OAUTH_CLIENT_ID || DEFAULT_GITHUB_OAUTH_CLIENT_ID
    if (!syncState.get().githubOAuthClientId && defaultClientId) {
      await syncState.update({ githubOAuthClientId: defaultClientId })
    }
    syncService = createSyncService()
    registerIpc()

    // Remove the default File/Edit/View… menu bar — the app uses a tray icon
    // and sidebar navigation instead.
    Menu.setApplicationMenu(null)

    const settings = await launcher.init()
    await plugins.init()
    void pullSyncWithSavedCredentials().catch((err) =>
      console.warn("[deskit] startup sync pull failed", err)
    )

    // Pre-warm both the main window (so the first show is instant) and the
    // app cache (so the first launcher query has results).
    mainWindow = createMainWindow()
    ensureSearchWindow(searchWindowDeps())
    void launcher.refreshApps()

    createTray(defaultTrayIcon(), trayActions())
    rebindLauncherHotkey(settings.hotkeys.launcher)
    rebindScreenshotHotkey(settings.hotkeys.screenshot)
    syncPluginShortcuts()
    syncFloatingBallWindow(floatingBallDeps())
    showStartupNotification({
      hotkey: settings.hotkeys.launcher,
      locale: app.getLocale(),
      iconPath: defaultNotificationIcon(),
    })

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
      showMainWindow()
    })
  })

  app.on("will-quit", () => {
    setSearchWindowQuitting(true)
    destroyFloatingBallWindow()
    unbindAllGlobalShortcuts()
    destroyTray()
    plugins?.dispose()
  })

  // Plugin storage uses a 250ms throttled tmp+rename flush. Without this
  // hook the user clicks Quit at t=240ms after a `storage.set` and Electron
  // exits before the flush timer fires — the write is dropped. We block
  // before-quit once, run flushAll, then quit again. The `pluginsFlushed`
  // flag ensures the second quit goes through normally instead of looping.
  let pluginsFlushed = false
  app.on("before-quit", (event) => {
    quitRequested = true
    setSearchWindowQuitting(true)
    if (pluginsFlushed || !plugins) return
    event.preventDefault()
    void plugins
      .flush()
      .catch((err) => console.error("[deskit] plugin flush failed during shutdown", err))
      .finally(() => {
        pluginsFlushed = true
        app.quit()
      })
  })

  // Tray-resident launcher: do NOT quit when all windows are closed.
  // Subscribing with a no-op handler suppresses Electron's default
  // "quit when last window closes" behaviour on Windows/Linux.
  app.on("window-all-closed", () => {
    // intentionally empty
  })
}
