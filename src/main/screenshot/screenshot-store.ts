import { promises as fs } from "node:fs"
import * as path from "node:path"

const SCREENSHOT_DIR_NAME = "Screenshots"
const DESKIT_DIR_NAME = "DesKit"
const TEMP_DIR_NAME = "screenshot-temp"
const DEFAULT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

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

export async function deleteScreenshotTempFile(
  userDataDir: string,
  filePath: string
): Promise<boolean> {
  if (!isPathInside(filePath, screenshotTempDir(userDataDir))) return false
  await fs.rm(filePath, { force: true })
  return true
}

export async function cleanupScreenshotTempDir(
  userDataDir: string,
  options: { maxAgeMs?: number; now?: number } = {}
): Promise<void> {
  const dir = screenshotTempDir(userDataDir)
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_TEMP_MAX_AGE_MS
  const now = options.now ?? Date.now()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return
    throw err
  }

  await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dir, entry)
      const stat = await fs.stat(filePath)
      if (!stat.isFile() || now - stat.mtimeMs < maxAgeMs) return
      await fs.rm(filePath, { force: true })
    })
  )
}

function isPathInside(filePath: string, parentDir: string): boolean {
  const relative = path.relative(path.resolve(parentDir), path.resolve(filePath))
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}
