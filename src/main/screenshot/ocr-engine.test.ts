import { describe, expect, it } from "vitest"
import { cleanOcrText } from "./ocr-engine"

describe("screenshot OCR engine", () => {
  it("trims outer whitespace and compresses excessive blank lines", () => {
    expect(cleanOcrText("  第一行  \r\n\r\n\r\n第二行\t\n  ")).toBe("第一行\n\n第二行")
  })

  it("preserves natural OCR line breaks", () => {
    expect(cleanOcrText("one\ntwo\nthree")).toBe("one\ntwo\nthree")
  })
})
