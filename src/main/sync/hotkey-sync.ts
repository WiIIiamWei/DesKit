import type { UserSettings } from "../settings/settings"
import process from "node:process"

type Platform = NodeJS.Platform | string

export function settingsForSync(
  settings: UserSettings,
  platform: Platform = process.platform
): UserSettings {
  return {
    ...settings,
    hotkey: portableHotkeyForSync(settings.hotkey, platform),
  }
}

export function settingsFromSync(
  settings: UserSettings,
  platform: Platform = process.platform
): UserSettings {
  return {
    ...settings,
    hotkey: localHotkeyFromSync(settings.hotkey, platform),
  }
}

function portableHotkeyForSync(accelerator: string, platform: Platform): string {
  return rewriteAccelerator(accelerator, (token) => {
    if (isOptionToken(token)) return "Alt"
    if (isMacPlatform(platform) && isCommandToken(token)) return "CommandOrControl"
    return normalizePortableToken(token)
  })
}

function localHotkeyFromSync(accelerator: string, platform: Platform): string {
  return rewriteAccelerator(accelerator, (token) => {
    if (isOptionToken(token)) return "Alt"
    if (!isMacPlatform(platform) && isCommandToken(token)) return "Control"
    return normalizePortableToken(token)
  })
}

function rewriteAccelerator(accelerator: string, rewriteToken: (token: string) => string): string {
  return accelerator
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean)
    .map(rewriteToken)
    .join("+")
}

function normalizePortableToken(token: string): string {
  return /^cmdorctrl$/i.test(token) ? "CommandOrControl" : token
}

function isCommandToken(token: string): boolean {
  return /^(?:command|cmd)$/i.test(token)
}

function isOptionToken(token: string): boolean {
  return /^option$/i.test(token)
}

function isMacPlatform(platform: Platform): boolean {
  return platform === "darwin"
}
