import { describe, expect, it } from "vitest"
import { clipboardText, localize, normalizeClipboardContent } from "@/components/plugins/view-utils"

describe("plugin view utils", () => {
  describe("localize", () => {
    it("returns plain strings as-is", () => {
      expect(localize("Copy", "zh-CN")).toBe("Copy")
    })

    it("prefers the exact locale before language and fallback values", () => {
      expect(
        localize(
          {
            en: "Open",
            zh: "打开",
            "zh-CN": "打开文件",
          },
          "zh-CN"
        )
      ).toBe("打开文件")
    })

    it("falls back to language, English, zh-CN, then first value", () => {
      expect(localize({ zh: "复制" }, "zh-TW")).toBe("复制")
      expect(localize({ en: "Copy", "zh-CN": "复制" }, "fr-FR")).toBe("Copy")
      expect(localize({ "zh-CN": "复制" }, "fr-FR")).toBe("复制")
      expect(localize({ ja: "コピー" }, "fr-FR")).toBe("コピー")
    })
  })

  describe("clipboardText", () => {
    it("returns string values unchanged", () => {
      expect(clipboardText("hello")).toBe("hello")
    })

    it("extracts text clipboard content", () => {
      expect(clipboardText({ type: "text", text: "hello" })).toBe("hello")
    })

    it("extracts image clipboard data URLs", () => {
      expect(clipboardText({ type: "image", dataUrl: "data:image/png;base64,a" })).toBe(
        "data:image/png;base64,a"
      )
    })
  })

  describe("normalizeClipboardContent", () => {
    it("wraps string actions as text clipboard content", () => {
      expect(normalizeClipboardContent("hello")).toEqual({ type: "text", text: "hello" })
    })

    it("preserves structured clipboard content", () => {
      const content = {
        type: "image" as const,
        dataUrl: "data:image/png;base64,a",
        mimeType: "image/png",
      }
      expect(normalizeClipboardContent(content)).toBe(content)
    })
  })
})
