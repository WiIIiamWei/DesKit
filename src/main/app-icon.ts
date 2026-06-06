import * as path from "node:path"
import process from "node:process"
import { app } from "electron"

export function defaultAppIcon(): string {
  const resourcesRoot = app.isPackaged
    ? path.join(process.resourcesPath, "resources")
    : path.join(__dirname, "../../resources")

  if (process.platform === "win32") {
    return path.join(resourcesRoot, "icon.ico")
  }
  if (process.platform === "darwin") {
    return path.join(resourcesRoot, "icon.icns")
  }
  return path.join(resourcesRoot, "icon.png")
}
