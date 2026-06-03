import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LauncherSettings } from "./launcher-settings"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

type TestElectronApi = NonNullable<Window["electronAPI"]>
type SettingsChangedHandler = (settings: DeskitUserSettings) => void

type TestElectronApiHarness = TestElectronApi & {
  emitSettingsChanged: (settings: Partial<DeskitUserSettings>) => void
}

function ok<T>(data: T): DeskitPluginIpcResult<T> {
  return { ok: true, data }
}

function baseSettings(overrides: Partial<DeskitUserSettings> = {}): DeskitUserSettings {
  return {
    hotkey: "Control+Space",
    themeMode: "system",
    accent: "neutral",
    floatingBallEnabled: false,
    floatingBallFeatures: [],
    lanEnabled: false,
    ...overrides,
  }
}

function installElectronApi(settings: Partial<DeskitUserSettings> = {}): TestElectronApiHarness {
  let settingsChangedHandler: SettingsChangedHandler | null = null
  const currentSettings = baseSettings(settings)
  const api = {
    getSettings: vi.fn().mockResolvedValue(currentSettings),
    updateSettings: vi.fn().mockResolvedValue(currentSettings),
    getSyncStatus: vi.fn().mockResolvedValue({
      configured: false,
      enabled: false,
      loggedIn: false,
      deviceId: "device",
      rememberPassphrase: true,
      hasSavedPassphrase: false,
    }),
    saveSyncClientId: vi.fn(),
    saveSyncGistId: vi.fn(),
    startGitHubLogin: vi.fn(),
    pollGitHubLogin: vi.fn(),
    configureSyncPassphrase: vi.fn(),
    pushSync: vi.fn(),
    pullSync: vi.fn(),
    applyRemoteSync: vi.fn(),
    applyLocalSync: vi.fn(),
    disconnectSync: vi.fn(),
    getLanStatus: vi.fn().mockResolvedValue({ enabled: false }),
    listLanDevices: vi.fn().mockResolvedValue([]),
    listLanPairings: vi.fn().mockResolvedValue([]),
    pairLanDevice: vi.fn().mockResolvedValue({ id: "pair" }),
    confirmLanPairing: vi.fn().mockResolvedValue([]),
    rejectLanPairing: vi.fn().mockResolvedValue([]),
    disconnectLanDevice: vi.fn().mockResolvedValue(undefined),
    listLanTransfers: vi.fn().mockResolvedValue([]),
    sendLanFile: vi.fn().mockResolvedValue(null),
    resumeLanTransfer: vi.fn().mockResolvedValue({ id: "transfer" }),
    acceptLanTransfer: vi.fn().mockResolvedValue(null),
    rejectLanTransfer: vi.fn().mockResolvedValue({ id: "transfer" }),
    removeLanTransferHistory: vi.fn().mockResolvedValue([]),
    refreshApps: vi.fn().mockResolvedValue([]),
    searchApps: vi.fn().mockResolvedValue([]),
    launchApp: vi.fn().mockResolvedValue(true),
    hideLauncher: vi.fn().mockResolvedValue(undefined),
    openExternalUrl: vi.fn().mockResolvedValue(true),
    writeClipboardContent: vi.fn().mockResolvedValue(true),
    pasteClipboardContent: vi.fn().mockResolvedValue(true),
    notifyLauncherReady: vi.fn(),
    openFloatingBallFeature: vi.fn().mockResolvedValue(undefined),
    toggleFloatingBallMenu: vi.fn().mockResolvedValue(undefined),
    moveFloatingBallBy: vi.fn().mockResolvedValue(undefined),
    hideFloatingBall: vi.fn().mockResolvedValue(undefined),
    listPlugins: vi.fn().mockResolvedValue(ok([])),
    getPlugin: vi.fn().mockResolvedValue(ok(null)),
    setPluginEnabled: vi.fn().mockResolvedValue(ok(null)),
    setPluginPreference: vi.fn().mockResolvedValue(ok(undefined)),
    installPluginFolder: vi.fn().mockResolvedValue(ok(null)),
    installPluginPackage: vi.fn().mockResolvedValue(ok(null)),
    uninstallPlugin: vi.fn().mockResolvedValue(ok(undefined)),
    reloadPlugin: vi.fn().mockResolvedValue(ok(undefined)),
    searchPluginCommands: vi.fn().mockResolvedValue(ok([])),
    invokePluginCommand: vi.fn().mockResolvedValue(ok(undefined)),
    disposePluginCommand: vi.fn().mockResolvedValue(ok(undefined)),
    listMarketplacePlugins: vi.fn().mockResolvedValue(ok([])),
    installMarketplacePlugin: vi.fn().mockResolvedValue(ok(null)),
    onLauncherFocus: vi.fn(() => () => undefined),
    onFloatingBallMenuState: vi.fn(() => () => undefined),
    onFloatingBallFeatures: vi.fn(() => () => undefined),
    onLauncherRunPluginCommand: vi.fn(() => () => undefined),
    onPluginRegistryChanged: vi.fn(() => () => undefined),
    onSettingsChanged: vi.fn((handler: SettingsChangedHandler) => {
      settingsChangedHandler = handler
      return () => {
        settingsChangedHandler = null
      }
    }),
    onLanDevicesChanged: vi.fn(() => () => undefined),
    onLanStatusChanged: vi.fn(() => () => undefined),
    onLanPairingsChanged: vi.fn(() => () => undefined),
    onLanTransfersChanged: vi.fn(() => () => undefined),
    emitSettingsChanged: (nextSettings: Partial<DeskitUserSettings>) => {
      act(() => settingsChangedHandler?.(baseSettings(nextSettings)))
    },
  } satisfies TestElectronApiHarness

  window.electronAPI = api
  return api
}

function mockPlatform(platform: string): void {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  })
}

describe("launcher settings", () => {
  const originalPlatform = window.navigator.platform

  beforeEach(() => {
    mockPlatform("Win32")
    installElectronApi()
  })

  afterEach(() => {
    cleanup()
    delete window.electronAPI
    mockPlatform(originalPlatform)
  })

  it("keeps the hotkey field editable until capture is requested", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.clear(input)
    fireEvent.keyDown(input, { shiftKey: true, code: "Equal", key: "+" })
    expect(input).toHaveValue("")

    fireEvent.change(input, { target: { value: "+" } })
    expect(input).toHaveValue("+")
  })

  it("captures the next key combination after capture is requested", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    const defaultAllowed = fireEvent.keyDown(input, { altKey: true, code: "Space", key: " " })

    expect(defaultAllowed).toBe(false)
    expect(input).toHaveValue("Alt+Space")
  })

  it("captures Space from the physical key code", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    const defaultAllowed = fireEvent.keyDown(input, {
      altKey: true,
      code: "Space",
      key: "Spacebar",
    })

    expect(defaultAllowed).toBe(false)
    expect(input).toHaveValue("Alt+Space")
  })

  it("captures shifted plus as the Electron Plus accelerator", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    const defaultAllowed = fireEvent.keyDown(input, {
      ctrlKey: true,
      shiftKey: true,
      code: "Equal",
      key: "+",
    })

    expect(defaultAllowed).toBe(false)
    expect(input).toHaveValue("Control+Shift+Plus")
  })

  it("cancels capture on Escape without changing the hotkey", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))

    const captureButton = screen.getByRole("button", {
      name: "launcher.settings.capturing",
    })
    expect(captureButton).toHaveAttribute("aria-pressed", "true")

    const defaultAllowed = fireEvent.keyDown(input, { code: "Escape", key: "Escape" })

    expect(defaultAllowed).toBe(false)
    expect(input).toHaveValue("Control+Space")
    expect(screen.getByRole("button", { name: "launcher.settings.capture" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("prevents browser input side effects after capturing a printable shortcut", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    const defaultAllowed = fireEvent.keyDown(input, { ctrlKey: true, code: "KeyV", key: "v" })

    expect(defaultAllowed).toBe(false)
    expect(input).toHaveValue("Control+V")
  })

  it("captures Tab when used with a modifier", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    const defaultAllowed = fireEvent.keyDown(input, { ctrlKey: true, code: "Tab", key: "Tab" })

    expect(defaultAllowed).toBe(false)
    expect(input).toHaveValue("Control+Tab")
  })

  it("captures the command key as a portable accelerator on macOS", async () => {
    mockPlatform("MacIntel")
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    fireEvent.keyDown(input, { metaKey: true, code: "KeyK", key: "k" })

    expect(input).toHaveValue("CommandOrControl+K")
  })

  it("cancels capture when the input loses focus", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))

    expect(screen.getByRole("button", { name: "launcher.settings.capturing" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    fireEvent.blur(input)

    expect(screen.getByRole("button", { name: "launcher.settings.capture" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    expect(input).toHaveValue("Control+Space")
  })

  it("captures the Windows key as the Electron Super accelerator off macOS", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    fireEvent.keyDown(input, { metaKey: true, code: "KeyK", key: "k" })

    expect(input).toHaveValue("Super+K")
  })

  it("syncs the hotkey input when a settings broadcast arrives without local edits", async () => {
    const api = installElectronApi({
      hotkey: "Control+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    api.emitSettingsChanged({
      hotkey: "Alt+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })

    expect(input).toHaveValue("Alt+Space")
    expect(screen.getByRole("button", { name: "launcher.settings.save" })).toBeDisabled()
  })

  it("keeps a dirty hotkey draft when another settings broadcast changes the saved baseline", async () => {
    const user = userEvent.setup()
    const api = installElectronApi({
      hotkey: "Control+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.clear(input)
    await user.type(input, "Alt+Space")
    api.emitSettingsChanged({
      hotkey: "Shift+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })

    expect(input).toHaveValue("Alt+Space")
    expect(screen.getByRole("button", { name: "launcher.settings.save" })).toBeEnabled()
  })

  it("uses the visible hotkey input value when reconciling settings broadcasts", async () => {
    const api = installElectronApi({
      hotkey: "Control+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    fireEvent.change(input, { target: { value: "Alt+Space" } })
    api.emitSettingsChanged({
      hotkey: "Shift+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })

    expect(input).toHaveValue("Alt+Space")
    expect(screen.getByRole("button", { name: "launcher.settings.save" })).toBeEnabled()
  })

  it("marks a dirty hotkey draft clean when a settings broadcast matches it", async () => {
    const user = userEvent.setup()
    const api = installElectronApi({
      hotkey: "Control+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.clear(input)
    await user.type(input, "Alt+Space")
    api.emitSettingsChanged({
      hotkey: "Alt+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })

    expect(input).toHaveValue("Alt+Space")
    expect(screen.getByRole("button", { name: "launcher.settings.save" })).toBeDisabled()
  })

  it("clears the save status when a settings broadcast changes the saved hotkey", async () => {
    const user = userEvent.setup()
    const api = installElectronApi({
      hotkey: "Control+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })
    api.updateSettings = vi.fn().mockResolvedValue(baseSettings({ hotkey: "Alt+Space" }))
    window.electronAPI = api
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.clear(input)
    await user.type(input, "Alt+Space")
    await user.click(screen.getByRole("button", { name: "launcher.settings.save" }))
    expect(await screen.findByRole("status")).toHaveTextContent("launcher.settings.saved")

    api.emitSettingsChanged({
      hotkey: "Shift+Space",
      themeMode: "system",
      accent: "neutral",
      floatingBallEnabled: false,
      floatingBallFeatures: [],
    })

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
