import { spawn } from "node:child_process"
import process from "node:process"

const DEFAULT_PASTE_DELAY_MS = 80

export interface PasteClipboardOptions {
  delayMs?: number
  platform?: NodeJS.Platform
  runCommand?: CommandRunner
}

type CommandRunner = (command: string, args: string[]) => Promise<boolean>

export async function pasteClipboardIntoActiveApp(
  options: PasteClipboardOptions = {}
): Promise<boolean> {
  const platform = options.platform ?? process.platform
  const command = systemPasteCommand(platform)
  if (!command) return false

  await delay(options.delayMs ?? DEFAULT_PASTE_DELAY_MS)
  const runCommand = options.runCommand ?? runCommandWithSpawn
  return runCommand(command.command, command.args)
}

export function systemPasteCommand(
  platform: NodeJS.Platform
): { command: string; args: string[] } | null {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
      ],
    }
  }

  if (platform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", 'tell application "System Events" to keystroke "v" using command down'],
    }
  }

  if (platform === "linux") {
    return {
      command: "xdotool",
      args: ["key", "ctrl+v"],
    }
  }

  return null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runCommandWithSpawn(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    child.once("error", () => resolve(false))
    child.once("exit", (code) => resolve(code === 0))
  })
}
