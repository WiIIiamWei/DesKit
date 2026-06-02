import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  bindGlobalShortcut,
  currentBinding,
  unbindAllGlobalShortcuts,
  unbindGlobalShortcut,
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

  it("rejects duplicate accelerators owned by another binding", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)

    expect(bindGlobalShortcut("plugin:clipboard", "Control+Space", () => {})).toBe(false)
    expect(currentBinding("launcher")).toBe("Control+Space")
    expect(currentBinding("plugin:clipboard")).toBeNull()
  })

  it("restores the previous binding when a replacement fails", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)
    electronMock.blocked.add("Alt+Space")

    expect(bindGlobalShortcut("launcher", "Alt+Space", () => {})).toBe(false)
    expect(currentBinding("launcher")).toBe("Control+Space")
  })

  it("unbinds only the requested binding", () => {
    expect(bindGlobalShortcut("launcher", "Control+Space", () => {})).toBe(true)
    expect(bindGlobalShortcut("plugin:clipboard", "Super+Control+C", () => {})).toBe(true)

    unbindGlobalShortcut("plugin:clipboard")

    expect(currentBinding("launcher")).toBe("Control+Space")
    expect(currentBinding("plugin:clipboard")).toBeNull()
  })
})
