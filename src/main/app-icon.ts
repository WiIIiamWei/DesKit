import * as path from "node:path"
import process from "node:process"

export function defaultAppIcon(): string {
  if (process.platform === "win32") {
    return path.join(__dirname, "../../resources/icon.ico")
  }
  if (process.platform === "darwin") {
    return path.join(__dirname, "../../resources/icon.icns")
  }
  return path.join(__dirname, "../../resources/icon.png")
}
