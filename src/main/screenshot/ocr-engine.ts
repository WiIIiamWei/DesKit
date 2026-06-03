import * as path from "node:path"
import process from "node:process"
import { app } from "electron"

const OCR_TIMEOUT_MS = 10_000
const OCR_LANGUAGES = ["eng", "chi_sim"]

type TesseractModule = typeof import("tesseract.js")
type TesseractWorker = Awaited<ReturnType<TesseractModule["createWorker"]>>

export class OcrTimeoutError extends Error {
  constructor() {
    super("OCR timed out")
    this.name = "OcrTimeoutError"
  }
}

export class OcrEngineLoadError extends Error {
  constructor(message = "OCR engine failed to load") {
    super(message)
    this.name = "OcrEngineLoadError"
  }
}

let workerPromise: Promise<TesseractWorker> | null = null
let workerReady = false

export async function recognizeScreenshotText(imagePath: string): Promise<string> {
  const worker = await getWorker()
  const result = await withTimeout(worker.recognize(imagePath), OCR_TIMEOUT_MS).catch(
    async (error: unknown) => {
      if (error instanceof OcrTimeoutError) await resetWorker()
      throw error
    }
  )
  return cleanOcrText(result.data.text)
}

export function isOcrWorkerReady(): boolean {
  return workerReady
}

export function ocrLanguagePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "ocr", "tessdata")
    : path.join(app.getAppPath(), "resources", "ocr", "tessdata")
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createWorker()
  }
  try {
    const worker = await workerPromise
    workerReady = true
    return worker
  } catch (error) {
    workerPromise = null
    workerReady = false
    throw error instanceof OcrEngineLoadError
      ? error
      : new OcrEngineLoadError(error instanceof Error ? error.message : undefined)
  }
}

async function createWorker(): Promise<TesseractWorker> {
  const tesseract = (await import("tesseract.js")) as TesseractModule
  return tesseract.createWorker(OCR_LANGUAGES, 1, {
    langPath: ocrLanguagePath(),
    cachePath: ocrLanguagePath(),
    cacheMethod: "readOnly",
    gzip: false,
    logger: () => {},
  })
}

async function resetWorker(): Promise<void> {
  const worker = workerPromise
  workerPromise = null
  workerReady = false
  await worker
    ?.then((value) => value.terminate())
    .catch(() => {
      // A timed-out or failed worker can reject while it is being torn down.
    })
}

export function cleanOcrText(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n")
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new OcrTimeoutError()), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
