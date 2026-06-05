import type { AppEntry } from "../launcher/types"
import { promises as fs } from "node:fs"
import { shell } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { settingsFilePath } from "../settings/settings"
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
  beforeEach(async () => {
    vi.mocked(shell.openPath).mockResolvedValue("")
    // app.getPath("userData") is mocked to a fixed path, so settings.json
    // persists on the real disk between tests/runs. Start each test from a
    // clean slate so settings reads return defaults regardless of order.
    await fs.rm(settingsFilePath("/mock/userData"), { force: true })
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

  it("applies the search-learning preference to the ranking store on init", async () => {
    const ranking = {
      getSignals: vi.fn(),
      recordSelection: vi.fn(async () => {}),
      prune: vi.fn(async () => {}),
      setQueryLearningEnabled: vi.fn(),
      clearQueryLearning: vi.fn(async () => {}),
    }
    const service = new LauncherService()

    // Defaults enable learning; updating the setting re-applies the gate.
    await service.init({ ranking })
    expect(ranking.setQueryLearningEnabled).toHaveBeenLastCalledWith(true)

    await service.updateSettings({ learnFromSearchHistory: false })
    expect(ranking.setQueryLearningEnabled).toHaveBeenLastCalledWith(false)
  })

  it("clearSearchLearning delegates to the ranking store and swallows failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const ranking = {
      getSignals: vi.fn(),
      recordSelection: vi.fn(async () => {}),
      prune: vi.fn(async () => {}),
      setQueryLearningEnabled: vi.fn(),
      clearQueryLearning: vi.fn(async () => {
        throw new Error("disk full")
      }),
    }
    const service = new LauncherService()
    await service.init({ ranking })

    await expect(service.clearSearchLearning()).resolves.toBeUndefined()

    expect(ranking.clearQueryLearning).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
