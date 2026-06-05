import type { AppEntry } from "../launcher/types"
import { shell } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LauncherService } from "./launcher-service"

function entry(name: string): AppEntry {
  return {
    id: `win32:${name}`,
    kind: "win32",
    name,
    nameLower: name.toLowerCase(),
    target: name,
  }
}

describe("launcherService ranking", () => {
  beforeEach(() => {
    vi.mocked(shell.openPath).mockResolvedValue("")
  })

  it("records successful app launches for dynamic ranking", async () => {
    const ranking = {
      getSignals: vi.fn(),
      recordSelection: vi.fn(async () => {}),
      prune: vi.fn(async () => {}),
    }
    const service = new LauncherService()
    await service.init({ ranking })
    ;(service.cache as unknown as { apps: AppEntry[] }).apps = [entry("Code")]

    await expect(service.launchById("win32:Code")).resolves.toBe(true)

    expect(ranking.recordSelection).toHaveBeenCalledWith("app:win32:Code", { query: undefined })
  })

  it("forwards the search query a launch was triggered from for per-query learning", async () => {
    const ranking = {
      getSignals: vi.fn(),
      recordSelection: vi.fn(async () => {}),
      prune: vi.fn(async () => {}),
    }
    const service = new LauncherService()
    await service.init({ ranking })
    ;(service.cache as unknown as { apps: AppEntry[] }).apps = [entry("Code")]

    await expect(service.launchById("win32:Code", "co")).resolves.toBe(true)

    expect(ranking.recordSelection).toHaveBeenCalledWith("app:win32:Code", { query: "co" })
  })

  it("still reports a successful launch when recording the ranking fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const ranking = {
      getSignals: vi.fn(),
      recordSelection: vi.fn(async () => {
        throw new Error("disk full")
      }),
      prune: vi.fn(async () => {}),
    }
    const service = new LauncherService()
    await service.init({ ranking })
    ;(service.cache as unknown as { apps: AppEntry[] }).apps = [entry("Code")]

    await expect(service.launchById("win32:Code")).resolves.toBe(true)

    expect(ranking.recordSelection).toHaveBeenCalledWith("app:win32:Code", { query: undefined })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("prunes stale app rankings against the refreshed inventory", async () => {
    const ranking = {
      getSignals: vi.fn(),
      recordSelection: vi.fn(async () => {}),
      prune: vi.fn(async () => {}),
    }
    const service = new LauncherService()
    await service.init({ ranking })
    vi.spyOn(service.cache, "refresh").mockResolvedValue([entry("Code"), entry("Notes")])

    await service.refreshApps()

    expect(ranking.prune).toHaveBeenCalledWith("app:", ["app:win32:Code", "app:win32:Notes"])
  })
})
