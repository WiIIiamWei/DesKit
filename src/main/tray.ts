import * as path from "node:path"
import { app, Menu, nativeImage, Tray } from "electron"
import { prettyHotkey } from "./notifications"

export interface TrayActions {
  onOpenSearch: () => void
  onShowMainWindow: () => void
  onRefreshApps: () => void
  onQuit: () => void
  getHotkey: () => string
}

let tray: Tray | null = null

export function createTray(iconPath: string, actions: TrayActions): Tray {
  // nativeImage automatically picks @2x / @3x variants next to the base
  // file on HiDPI displays (e.g. tray@2x.png for a 200% scale display),
  // so we hand it the 16x16 base path and let it scale.
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip("DesKit")
  refreshTrayMenu(actions)
  tray.on("click", actions.onOpenSearch)
  tray.on("double-click", actions.onShowMainWindow)
  return tray
}

export function refreshTrayMenu(actions: TrayActions): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: `Open launcher (${prettyHotkey(actions.getHotkey())})`,
      click: actions.onOpenSearch,
    },
    { label: "Show DesKit window", click: actions.onShowMainWindow },
    { type: "separator" },
    { label: "Reload installed apps", click: actions.onRefreshApps },
    { type: "separator" },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: "Quit DesKit", click: actions.onQuit },
  ])
  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function defaultTrayIcon(): string {
  return path.join(__dirname, "../../resources/tray.png")
}
