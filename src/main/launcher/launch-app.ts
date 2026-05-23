import type { AppEntry } from "./types"
import { spawn } from "node:child_process"
import process from "node:process"
import { shell } from "electron"

/**
 * Launch an app. Returns true on success.
 *
 * - .lnk / .url / .exe: delegate to the shell so Windows resolves working
 *   directory + arguments stored inside the shortcut.
 * - UWP (`shell:AppsFolder\<AppId>`): use `explorer.exe` because
 *   `shell.openPath` does not understand the `shell:` virtual scheme.
 */
export async function launchApp(entry: AppEntry): Promise<boolean> {
  if (entry.kind === "uwp") {
    return launchViaExplorer(entry.target)
  }

  const result = await shell.openPath(entry.target)
  // `openPath` returns "" on success, error message otherwise.
  return result === ""
}

function launchViaExplorer(target: string): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false)
  return new Promise((resolve) => {
    const child = spawn("explorer.exe", [target], { detached: true, windowsHide: true })
    child.on("error", () => resolve(false))
    child.on("spawn", () => {
      child.unref()
      resolve(true)
    })
  })
}
