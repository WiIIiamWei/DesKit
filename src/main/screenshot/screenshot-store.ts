import { promises as fs } from "node:fs"
import * as path from "node:path"

const SCREENSHOT_DIR_NAME = "Screenshots"
const DESKIT_DIR_NAME = "DesKit"
const TEMP_DIR_NAME = "screenshot-temp"

export function screenshotSaveDir(picturesDir: string): string {
  return path.join(picturesDir, DESKIT_DIR_NAME, SCREENSHOT_DIR_NAME)
}

export function screenshotTempDir(userDataDir: string): string {
  return path.join(userDataDir, TEMP_DIR_NAME)
}

export function screenshotFileName(date = new Date()): string {
  return `Screenshot ${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}.${pad2(date.getMinutes())}.${pad2(date.getSeconds())}.png`
}

export function screenshotSavePath(picturesDir: string, date = new Date()): string {
  return path.join(screenshotSaveDir(picturesDir), screenshotFileName(date))
}

export async function ensureScreenshotSavePath(
  picturesDir: string,
  date = new Date()
): Promise<string> {
  const filePath = screenshotSavePath(picturesDir, date)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  return filePath
}

export async function ensureScreenshotTempDir(userDataDir: string): Promise<string> {
  const dir = screenshotTempDir(userDataDir)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}
