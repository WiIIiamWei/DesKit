import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  bindGlobalShortcut,
  bindNamedGlobalShortcut,
  currentBinding,
  currentBindings,
  unbindAllGlobalShortcuts,
  unbindGlobalShortcut,
  unbindNamedGlobalShortcut,
} from "./shortcut"

const electronMock = vi.hoisted(() => {
  const callbacks = new Map<string, () => void>()
  const blocked = new Set<string>()
  return {
    blocked,
    callbacks,
    globalShortcut: {
      isRegistered: vi.fn((accelerator: string) => callbacks.has(accelerator)),
      register: vi.fn((accelerator: string, handler: () => void) => {
        if (blocked.has(accelerator) || callbacks.has(accelerator)) return false
        callbacks.set(accelerator, handler)
        return true
      }),
      unregister: vi.fn((accelerator: string) => {
        callbacks.delete(accelerator)
      }),
    },
  }
})

vi.mock("electron", () => ({
  globalShortcut: electronMock.globalShortcut,
}))

beforeEach(() => {
  unbindAllGlobalShortcuts()
  electronMock.callbacks.clear()
  electronMock.blocked.clear()
  vi.clearAllMocks()
})

describe("global shortcut bindings", () => {
  it("binds independent named shortcuts", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)
    expect(bindGlobalShortcut("plugin:clipboard", "Super+Control+C", () => {})).toBe(true)

    expect(currentBinding("launcher")).toBe("Control+Space")
    expect(currentBinding("plugin:clipboard")).toBe("Super+Control+C")
  })

  it("binds multiple named shortcut aliases without replacing each other", () => {
    expect(bindNamedGlobalShortcut("launcher", "Control+Space", vi.fn())).toBe(true)
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)

    expect(currentBindings()).toEqual({
      launcher: "Control+Space",
      screenshot: "Control+Shift+A",
    })
    expect(electronMock.globalShortcut.unregister).not.toHaveBeenCalled()
  })

  it("rejects duplicate accelerators owned by another binding", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)

    expect(bindGlobalShortcut("plugin:clipboard", "Control+Space", () => {})).toBe(false)
    expect(currentBinding("launcher")).toBe("Control+Space")
    expect(currentBinding("plugin:clipboard")).toBeNull()
  })

  it("replaces only the shortcut with the same name", () => {
    expect(bindNamedGlobalShortcut("launcher", "Control+Space", vi.fn())).toBe(true)
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)

    expect(bindNamedGlobalShortcut("launcher", "Alt+Space", vi.fn())).toBe(true)

    expect(electronMock.globalShortcut.unregister).toHaveBeenCalledWith("Control+Space")
    expect(electronMock.globalShortcut.unregister).not.toHaveBeenCalledWith("Control+Shift+A")
    expect(currentBindings()).toEqual({
      launcher: "Alt+Space",
      screenshot: "Control+Shift+A",
    })
  })

  it("restores the previous binding when a replacement fails", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)
    electronMock.blocked.add("Alt+Space")

    expect(bindGlobalShortcut("launcher", "Alt+Space", () => {})).toBe(false)
    expect(currentBinding("launcher")).toBe("Control+Space")
  })

  it("restores the previous named shortcut when the replacement fails", () => {
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)
    electronMock.blocked.add("Alt+Shift+A")

    expect(bindNamedGlobalShortcut("screenshot", "Alt+Shift+A", vi.fn())).toBe(false)

    expect(electronMock.globalShortcut.unregister).toHaveBeenCalledWith("Control+Shift+A")
    expect(currentBinding("screenshot")).toBe("Control+Shift+A")
  })

  it("updates the handler when rebinding the same accelerator", () => {
    const oldHandler = vi.fn()
    const newHandler = vi.fn()
    expect(bindGlobalShortcut("launcher", "Control+Space", oldHandler)).toBe(true)

    expect(bindGlobalShortcut("launcher", "Control+Space", newHandler)).toBe(true)
    electronMock.callbacks.get("Control+Space")?.()

    expect(oldHandler).not.toHaveBeenCalled()
    expect(newHandler).toHaveBeenCalledOnce()
  })

  it("unbinds only the requested binding", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)
    expect(bindGlobalShortcut("plugin:clipboard", "Super+Control+C", () => {})).toBe(true)

    unbindGlobalShortcut("plugin:clipboard")

    expect(currentBinding("launcher")).toBe("Control+Space")
    expect(currentBinding("plugin:clipboard")).toBeNull()
  })

  it("unbinds one named shortcut alias without touching the rest", () => {
    expect(bindNamedGlobalShortcut("launcher", "Control+Space", vi.fn())).toBe(true)
    expect(bindNamedGlobalShortcut("screenshot", "Control+Shift+A", vi.fn())).toBe(true)

    unbindNamedGlobalShortcut("screenshot")

    expect(electronMock.globalShortcut.unregister).toHaveBeenCalledWith("Control+Shift+A")
    expect(currentBindings()).toEqual({ launcher: "Control+Space" })
  })
})
