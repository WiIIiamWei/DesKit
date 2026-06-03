import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SyncSettings } from "./sync-settings"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

type TestElectronApi = NonNullable<Window["electronAPI"]>

function installElectronApi(status: DeskitSyncStatus): Partial<TestElectronApi> {
  const api: Partial<TestElectronApi> = {
    getSyncStatus: vi.fn().mockResolvedValue(status),
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
    openExternalUrl: vi.fn(),
  }
  window.electronAPI = api as TestElectronApi
  return api
}

describe("sync settings component", () => {
  afterEach(() => {
    cleanup()
    delete window.electronAPI
  })

  it("disables manual push while a sync conflict is pending", async () => {
    installElectronApi({
      configured: true,
      enabled: true,
      loggedIn: true,
      deviceId: "local-device",
      rememberPassphrase: true,
      hasSavedPassphrase: true,
      pendingConflict: {
        updatedAt: "2026-06-03T00:00:00.000Z",
        deviceId: "remote-device",
      },
    })

    render(<SyncSettings />)

    expect(await screen.findByText("sync.status.conflict")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "sync.push" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "sync.pull" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "sync.useRemote" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "sync.useLocal" })).toBeEnabled()
  })
})
