import * as path from "node:path"
import process from "node:process"
import { Notification } from "electron"

export interface StartupNotificationOptions {
  hotkey: string
  iconPath?: string
}

/**
 * Show the "DesKit is running" toast on launch. Tells the user where the
 * app went (it's in the tray) and what shortcut summons the launcher.
 */
export function showStartupNotification(options: StartupNotificationOptions): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: "DesKit is running",
    body: `Press ${prettyHotkey(options.hotkey)} to open the command launcher.`,
    silent: false,
    icon: options.iconPath,
  })
  notification.show()
}

export function prettyHotkey(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => {
      switch (part.toLowerCase()) {
        case "commandorcontrol":
        case "cmdorctrl":
          return process.platform === "darwin" ? "⌘" : "Ctrl"
        case "control":
        case "ctrl":
          return "Ctrl"
        case "command":
        case "cmd":
          return "⌘"
        case "alt":
        case "option":
          return process.platform === "darwin" ? "⌥" : "Alt"
        case "shift":
          return "Shift"
        case "super":
        case "meta":
          return process.platform === "darwin" ? "⌘" : "Win"
        case "space":
          return "Space"
        default:
          return part.length === 1 ? part.toUpperCase() : part
      }
    })
    .join("+")
}

export function defaultNotificationIcon(): string {
  // Pulled from resources/ which electron-builder ships and dev mode
  // reads from the repo root.
  return path.join(__dirname, "../../resources/icon.png")
}
