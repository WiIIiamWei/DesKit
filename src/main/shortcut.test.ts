import { globalShortcut } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  bindNamedGlobalShortcut,
  currentBinding,
  currentBindings,
  unbindAllGlobalShortcuts,
  unbindNamedGlobalShortcut,
} from "./shortcut"

describe("global shortcut bindings", () => {
  beforeEach(() => {
    unbindAllGlobalShortcuts()
    vi.mocked(globalShortcut.register).mockReset().mockReturnValue(true)
    vi.mocked(globalShortcut.unregister).mockReset()
    vi.mocked(globalShortcut.isRegistered).mockReset().mockReturnValue(false)
  })

  it("binds multiple named shortcuts without replacing each other", () => {
    expect(bindNamedGlobalShortcut("launcher", "Control+Space", vi.fn())).toBe(true)
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)

    expect(currentBindings()).toEqual({
      launcher: "Control+Space",
      screenshot: "Control+Shift+A",
    })
    expect(globalShortcut.unregister).not.toHaveBeenCalled()
  })

  it("replaces only the shortcut with the same name", () => {
    expect(bindNamedGlobalShortcut("launcher", "Control+Space", vi.fn())).toBe(true)
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)

    expect(bindNamedGlobalShortcut("launcher", "Alt+Space", vi.fn())).toBe(true)

    expect(globalShortcut.unregister).toHaveBeenCalledWith("Control+Space")
    expect(globalShortcut.unregister).not.toHaveBeenCalledWith("Control+Shift+A")
    expect(currentBindings()).toEqual({
      launcher: "Alt+Space",
      screenshot: "Control+Shift+A",
    })
  })

  it("restores the previous named shortcut when the replacement fails", () => {
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)
    vi.mocked(globalShortcut.register).mockReturnValueOnce(false).mockReturnValueOnce(true)

    expect(bindNamedGlobalShortcut("screenshot", "Alt+Shift+A", vi.fn())).toBe(false)

    expect(globalShortcut.unregister).toHaveBeenCalledWith("Control+Shift+A")
    expect(globalShortcut.register).toHaveBeenLastCalledWith(
      "Control+Shift+A",
      expect.any(Function)
    )
    expect(currentBinding("screenshot")).toBe("Control+Shift+A")
  })

  it("unbinds one named shortcut without touching the rest", () => {
    expect(bindNamedGlobalShortcut("launcher", "Control+Space", vi.fn())).toBe(true)
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)

    unbindNamedGlobalShortcut("screenshot")

    expect(globalShortcut.unregister).toHaveBeenCalledWith("Control+Shift+A")
    expect(currentBindings()).toEqual({ launcher: "Control+Space" })
  })
})
