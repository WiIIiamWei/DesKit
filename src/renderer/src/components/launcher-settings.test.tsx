import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LauncherSettings } from "./launcher-settings"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

type TestElectronApi = NonNullable<Window["electronAPI"]>

function installElectronApi(settings: DeskitUserSettings): TestElectronApi {
  const api = {
    getSettings: vi.fn().mockResolvedValue(settings),
    updateSettings: vi.fn().mockResolvedValue(settings),
    refreshApps: vi.fn().mockResolvedValue([]),
    searchApps: vi.fn().mockResolvedValue([]),
    launchApp: vi.fn().mockResolvedValue(true),
    hideLauncher: vi.fn().mockResolvedValue(undefined),
    onLauncherFocus: vi.fn(() => () => undefined),
    onSettingsChanged: vi.fn(() => () => undefined),
  } satisfies TestElectronApi

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
    installElectronApi({
      hotkey: "Control+Space",
      themeMode: "system",
      accent: "neutral",
    })
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
    fireEvent.keyDown(input, { altKey: true, code: "Space", key: " " })

    expect(input).toHaveValue("Alt+Space")
  })

  it("captures the command key as an Electron macOS accelerator on macOS", async () => {
    mockPlatform("MacIntel")
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    fireEvent.keyDown(input, { metaKey: true, code: "KeyK", key: "k" })

    expect(input).toHaveValue("Command+K")
  })

  it("keeps meta as the Windows key accelerator off macOS", async () => {
    const user = userEvent.setup()
    render(<LauncherSettings />)

    const input = await screen.findByLabelText("launcher.settings.hotkeyLabel")
    await user.click(screen.getByRole("button", { name: "launcher.settings.capture" }))
    fireEvent.keyDown(input, { metaKey: true, code: "KeyK", key: "k" })

    expect(input).toHaveValue("Meta+K")
  })
})
