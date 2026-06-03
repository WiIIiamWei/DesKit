import { app } from "electron"

export const SCREENSHOT_COLOR_PROFILE_SWITCH = "force-color-profile"
export const SCREENSHOT_COLOR_PROFILE_VALUE = "srgb"

type CommandLine = Pick<Electron.App["commandLine"], "appendSwitch">

export function applyScreenshotColorProfileWorkaround(
  commandLine: CommandLine = app.commandLine
): void {
  commandLine.appendSwitch(SCREENSHOT_COLOR_PROFILE_SWITCH, SCREENSHOT_COLOR_PROFILE_VALUE)
}
