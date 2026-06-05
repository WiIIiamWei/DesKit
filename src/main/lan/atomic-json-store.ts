import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import process from "node:process"

export async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown
  } catch (err) {
    if (isFileNotFound(err) || err instanceof SyntaxError) return null
    throw err
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  // A random suffix keeps the temp path unique across concurrent processes
  // (and same-millisecond writes), so renames never collide.
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
  await fs.rename(tempPath, filePath)
}

function isFileNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT")
}
