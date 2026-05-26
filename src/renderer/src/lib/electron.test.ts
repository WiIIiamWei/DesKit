import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getSettings,
  hideFloatingBall,
  hideLauncher,
  isElectron,
  launchApp,
  moveFloatingBallBy,
  notifyLauncherReady,
  onFloatingBallFeatures,
  onFloatingBallMenuState,
  onLauncherFocus,
  onSettingsChanged,
  openFloatingBallFeature,
  refreshApps,
  searchApps,
  toggleFloatingBallMenu,
  updateSettings,
} from "./electron"

function mockApi() {
  const api = {
    searchApps: vi.fn().mockResolvedValue([]),
    launchApp: vi.fn().mockResolvedValue(true),
    refreshApps: vi.fn().mockResolvedValue([]),
    hideLauncher: vi.fn().mockResolvedValue(undefined),
    notifyLauncherReady: vi.fn(),
    openFloatingBallFeature: vi.fn().mockResolvedValue(undefined),
    toggleFloatingBallMenu: vi.fn().mockResolvedValue(undefined),
    moveFloatingBallBy: vi.fn().mockResolvedValue(undefined),
    hideFloatingBall: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({
      hotkey: "CommandOrControl+Space",
      themeMode: "system",
      accent: "blue",
      floatingBallEnabled: true,
      floatingBallFeatures: ["appLauncher"],
    }),
    updateSettings: vi.fn().mockResolvedValue({
      hotkey: "CommandOrControl+Space",
      themeMode: "dark",
      accent: "blue",
      floatingBallEnabled: true,
      floatingBallFeatures: ["appLauncher"],
    }),
    onLauncherFocus: vi.fn().mockReturnValue(() => {}),
    onFloatingBallMenuState: vi.fn().mockReturnValue(() => {}),
    onFloatingBallFeatures: vi.fn().mockReturnValue(() => {}),
    onSettingsChanged: vi.fn().mockReturnValue(() => {}),
  }
  ;(window as unknown as { electronAPI: object }).electronAPI = api
  return api
}

describe("lib/electron", () => {
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  describe("isElectron", () => {
    it("returns false in jsdom (no electronAPI marker)", () => {
      expect(isElectron()).toBe(false)
    })

    it("returns true when window.electronAPI is present", () => {
      ;(window as unknown as { electronAPI: object }).electronAPI = {}
      expect(isElectron()).toBe(true)
    })
  })

  describe("iPC wrappers (api() throws when electronAPI missing)", () => {
    it("throws when electronAPI is not set", async () => {
      await expect(searchApps("test")).rejects.toThrow("electronAPI is unavailable")
    })
  })

  describe("iPC wrappers delegate to electronAPI", () => {
    it("searchApps forwards query", async () => {
      const api = mockApi()
      await searchApps("vscode")
      expect(api.searchApps).toHaveBeenCalledWith("vscode")
    })

    it("launchApp forwards id", async () => {
      const api = mockApi()
      await launchApp("app-id")
      expect(api.launchApp).toHaveBeenCalledWith("app-id")
    })

    it("refreshApps calls refreshApps", async () => {
      const api = mockApi()
      await refreshApps()
      expect(api.refreshApps).toHaveBeenCalled()
    })

    it("hideLauncher calls hideLauncher", async () => {
      const api = mockApi()
      await hideLauncher()
      expect(api.hideLauncher).toHaveBeenCalled()
    })

    it("notifyLauncherReady calls notifyLauncherReady", () => {
      const api = mockApi()
      notifyLauncherReady()
      expect(api.notifyLauncherReady).toHaveBeenCalled()
    })

    it("openFloatingBallFeature forwards feature", async () => {
      const api = mockApi()
      await openFloatingBallFeature("appLauncher")
      expect(api.openFloatingBallFeature).toHaveBeenCalledWith("appLauncher")
    })

    it("toggleFloatingBallMenu calls toggleFloatingBallMenu", async () => {
      const api = mockApi()
      await toggleFloatingBallMenu()
      expect(api.toggleFloatingBallMenu).toHaveBeenCalled()
    })

    it("moveFloatingBallBy forwards delta", async () => {
      const api = mockApi()
      await moveFloatingBallBy({ x: 10, y: -5 })
      expect(api.moveFloatingBallBy).toHaveBeenCalledWith({ x: 10, y: -5 })
    })

    it("hideFloatingBall calls hideFloatingBall", async () => {
      const api = mockApi()
      await hideFloatingBall()
      expect(api.hideFloatingBall).toHaveBeenCalled()
    })

    it("getSettings calls getSettings", async () => {
      const api = mockApi()
      await getSettings()
      expect(api.getSettings).toHaveBeenCalled()
    })

    it("updateSettings forwards patch", async () => {
      const api = mockApi()
      await updateSettings({ themeMode: "dark" })
      expect(api.updateSettings).toHaveBeenCalledWith({ themeMode: "dark" })
    })

    it("onLauncherFocus forwards handler and returns unsubscribe", () => {
      const api = mockApi()
      const handler = vi.fn()
      const unsub = onLauncherFocus(handler)
      expect(api.onLauncherFocus).toHaveBeenCalledWith(handler)
      expect(typeof unsub).toBe("function")
    })

    it("onFloatingBallMenuState forwards handler", () => {
      const api = mockApi()
      const handler = vi.fn()
      onFloatingBallMenuState(handler)
      expect(api.onFloatingBallMenuState).toHaveBeenCalledWith(handler)
    })

    it("onFloatingBallFeatures forwards handler", () => {
      const api = mockApi()
      const handler = vi.fn()
      onFloatingBallFeatures(handler)
      expect(api.onFloatingBallFeatures).toHaveBeenCalledWith(handler)
    })

    it("onSettingsChanged forwards handler", () => {
      const api = mockApi()
      const handler = vi.fn()
      onSettingsChanged(handler)
      expect(api.onSettingsChanged).toHaveBeenCalledWith(handler)
    })
  })
})
