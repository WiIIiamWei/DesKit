import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { app } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanOcrText, ocrLanguagePath } from "./ocr-engine"

describe("screenshot OCR engine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("trims outer whitespace and compresses excessive blank lines", () => {
    expect(cleanOcrText("  第一行  \r\n\r\n\r\n第二行\t\n  ")).toBe("第一行\n\n第二行")
  })

  it("preserves natural OCR line breaks", () => {
    expect(cleanOcrText("one\ntwo\nthree")).toBe("one\ntwo\nthree")
  })

  it("prefers the higher accuracy OCR model when it is bundled", () => {
    vi.mocked(app.getAppPath).mockReturnValue(process.cwd())

    expect(ocrLanguagePath()).toBe(path.join(process.cwd(), "resources", "ocr", "tessdata_best"))
  })

  it("falls back to the compact OCR model when the higher accuracy model is incomplete", async () => {
    const appPath = await fs.mkdtemp(path.join(os.tmpdir(), "deskit-ocr-model-"))
    const tessdataPath = path.join(appPath, "resources", "ocr", "tessdata")
    await fs.mkdir(tessdataPath, { recursive: true })
    await fs.writeFile(path.join(tessdataPath, "eng.traineddata"), "")
    await fs.writeFile(path.join(tessdataPath, "chi_sim.traineddata"), "")
    vi.mocked(app.getAppPath).mockReturnValue(appPath)

    expect(ocrLanguagePath()).toBe(tessdataPath)
  })
})
