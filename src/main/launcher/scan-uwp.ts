import type { AppEntry } from "./types"
import { spawn } from "node:child_process"
import process from "node:process"

/**
 * Discover UWP / MSIX packaged apps by shelling out to PowerShell's
 * `Get-StartApps`. This is the same data the Start menu uses — each row
 * carries an AppUserModelId that we can launch via
 * `shell:AppsFolder\<AppUserModelId>`.
 *
 * We avoid native Windows bindings to keep the toolchain pure Node.
 */
export async function scanUwpApps(): Promise<AppEntry[]> {
  if (process.platform !== "win32") return []

  const raw = await runPowerShell("Get-StartApps | ConvertTo-Json -Compress -Depth 2").catch(
    () => null
  )

  if (!raw) return []
  return parseGetStartApps(raw)
}

export function parseGetStartApps(jsonText: string): AppEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }

  const list = Array.isArray(parsed) ? parsed : [parsed]
  const entries: AppEntry[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const name = strField(item, "Name")
    const appId = strField(item, "AppID") || strField(item, "AppId")
    if (!name || !appId) continue
    // `Get-StartApps` returns BOTH packaged apps (AppId like
    // "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App") and shortcuts to
    // classic apps (AppId is the path to the .lnk). Only keep packaged
    // ones here — the .lnk side is covered by scan-start-menu.
    if (!appId.includes("!")) continue
    entries.push({
      id: `uwp:${appId}`,
      kind: "uwp",
      name,
      nameLower: name.toLowerCase(),
      target: `shell:AppsFolder\\${appId}`,
      description: appId.split("!")[0],
    })
  }
  return entries
}

function strField(obj: object, key: string): string {
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === "string" ? v : ""
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true }
    )
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8")
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8")
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`powershell exited ${code}: ${stderr}`))
    })
  })
}
