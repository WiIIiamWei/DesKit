import { describe, expect, it, vi } from "vitest"
import { pasteClipboardIntoActiveApp, systemPasteCommand } from "./system-paste"

describe("system paste", () => {
  it("uses a fixed PowerShell SendKeys command on Windows", () => {
    const command = systemPasteCommand("win32")

    expect(command?.command).toBe("powershell.exe")
    expect(command?.args).toContain(
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
    )
  })

  it("uses osascript on macOS", () => {
    expect(systemPasteCommand("darwin")).toEqual({
      command: "osascript",
      args: ["-e", 'tell application "System Events" to keystroke "v" using command down'],
    })
  })

  it("uses xdotool on Linux", () => {
    expect(systemPasteCommand("linux")).toEqual({
      command: "xdotool",
      args: ["key", "ctrl+v"],
    })
  })

  it("returns false on unsupported platforms", async () => {
    await expect(pasteClipboardIntoActiveApp({ platform: "freebsd", delayMs: 0 })).resolves.toBe(
      false
    )
  })

  it("runs the selected command after the focus delay", async () => {
    const runCommand = vi.fn<(command: string, args: string[]) => Promise<boolean>>()
    runCommand.mockResolvedValue(true)

    await expect(
      pasteClipboardIntoActiveApp({ platform: "win32", delayMs: 0, runCommand })
    ).resolves.toBe(true)

    expect(runCommand).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-NoProfile", "-Command"])
    )
  })
})
