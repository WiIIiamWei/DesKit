import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LanTransferPage } from "./lan-transfer-page"

const electron = vi.hoisted(() => ({
  acceptLanTransfer: vi.fn(),
  confirmLanPairing: vi.fn(),
  getLanStatus: vi.fn().mockResolvedValue({
    enabled: false,
    discovering: false,
    localDeviceId: "local",
    localDeviceName: "Desktop",
    deviceCount: 0,
  }),
  isElectron: vi.fn(() => true),
  listLanDevices: vi.fn().mockResolvedValue([]),
  listLanPairings: vi.fn().mockResolvedValue([]),
  listLanTransfers: vi.fn().mockResolvedValue([]),
  onLanDevicesChanged: vi.fn(() => () => undefined),
  onLanPairingsChanged: vi.fn(() => () => undefined),
  onLanStatusChanged: vi.fn(() => () => undefined),
  onLanTransfersChanged: vi.fn(() => () => undefined),
  pairLanDevice: vi.fn(),
  rejectLanPairing: vi.fn(),
  rejectLanTransfer: vi.fn(),
  resumeLanTransfer: vi.fn(),
  sendLanFile: vi.fn(),
  updateSettings: vi.fn(),
}))

vi.mock("@/lib/electron", () => electron)

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const securityGuideSeenKey = "deskit:lan-security-guide-seen"

function renderPage() {
  return render(
    <TooltipProvider>
      <LanTransferPage />
    </TooltipProvider>
  )
}

describe("lan transfer security guide", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("opens on the first visit and can be reopened from the corner help button", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByTestId("lan-security-guide-spotlight")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "lan.actions.dismissGuide",
      })
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(window.localStorage.getItem(securityGuideSeenKey)).toBe("true")

    await user.click(await screen.findByRole("button", { name: "lan.securityHelp" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("starts collapsed after the guide has been seen", () => {
    window.localStorage.setItem(securityGuideSeenKey, "true")

    renderPage()

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "lan.securityHelp" })).toBeInTheDocument()
  })
})
