import type { BrowserWindow as BrowserWindowType } from "electron"
import { BrowserWindow, screen } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { completeScreenshotOverlay, selectScreenshotRegion } from "./overlay-window"

type BrowserWindowMock = BrowserWindowType & {
  emit: (event: string, ...args: unknown[]) => void
}

const deps = {
  appOrigin: "app://app",
  rendererDevUrl: undefined,
}

describe("screenshot overlay window", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(screen.getDisplayNearestPoint).mockReturnValue({
      id: 1,
      scaleFactor: 2,
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      workArea: { x: 0, y: 25, width: 1440, height: 875 },
    } as ReturnType<typeof screen.getDisplayNearestPoint>)
  })

  it("offsets selection coordinates when the OS moves the overlay window", async () => {
    const result = selectScreenshotRegion(deps)
    const win = lastWindow()
    expect(win).toBeTruthy()
    vi.mocked(win!.getBounds).mockReturnValue({ x: 0, y: 25, width: 1440, height: 875 })

    completeScreenshotOverlay(win!.webContents, { x: 10, y: 20, width: 300, height: 200 }, "copy")

    await expect(result).resolves.toEqual({
      action: "copy",
      selection: {
        displayHeight: 900,
        displayId: "1",
        displayWidth: 1440,
        height: 200,
        scaleFactor: 2,
        width: 300,
        x: 10,
        y: 45,
      },
    })
  })
})

function lastWindow(): BrowserWindowMock | undefined {
  const results = vi.mocked(BrowserWindow).mock.results
  return results.at(-1)?.value as BrowserWindowMock | undefined
}
