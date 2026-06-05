import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getScreenshotOcrState } from "@/lib/electron"
import { ScreenshotOcrPage } from "./screenshot-ocr-page"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("@/lib/electron", () => ({
  closeScreenshotOcrWindow: vi.fn().mockResolvedValue(undefined),
  getScreenshotOcrState: vi.fn(),
  recaptureScreenshotOcr: vi.fn(),
  writeClipboardContent: vi.fn().mockResolvedValue(undefined),
}))

describe("screenshot OCR page", () => {
  beforeEach(() => {
    vi.mocked(getScreenshotOcrState).mockResolvedValue({
      imageDataUrl: "data:image/png;base64,capture",
      isLoading: false,
      text: "recognized text",
    })
    window.electronAPI = {
      onScreenshotOcrUpdated: vi.fn(() => () => undefined),
    } as unknown as Window["electronAPI"]
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    delete window.electronAPI
  })

  it("renders the screenshot preview inside a full-size containment frame", async () => {
    render(<ScreenshotOcrPage />)

    const image = await screen.findByRole("img", { name: "截图预览" })

    expect(image).toHaveAttribute("src", "data:image/png;base64,capture")
    expect(image).toHaveClass("h-full", "w-full", "object-contain")
    expect(image.parentElement).toHaveClass("overflow-hidden")
  })
})
