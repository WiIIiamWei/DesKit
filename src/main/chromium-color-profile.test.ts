import { describe, expect, it, vi } from "vitest"
import {
  applyScreenshotColorProfileWorkaround,
  SCREENSHOT_COLOR_PROFILE_SWITCH,
  SCREENSHOT_COLOR_PROFILE_VALUE,
} from "./chromium-color-profile"

describe("chromium color profile", () => {
  it("forces sRGB before Chromium initializes screen capture", () => {
    const appendSwitch = vi.fn()

    applyScreenshotColorProfileWorkaround({ appendSwitch })

    expect(appendSwitch).toHaveBeenCalledWith(
      SCREENSHOT_COLOR_PROFILE_SWITCH,
      SCREENSHOT_COLOR_PROFILE_VALUE
    )
  })
})
