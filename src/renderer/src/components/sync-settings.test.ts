import { describe, expect, it } from "vitest"
import { nextGitHubLoginPollInterval } from "./sync-settings-utils"

describe("sync settings", () => {
  it("backs off GitHub device polling by five seconds after slow_down", () => {
    expect(nextGitHubLoginPollInterval(5)).toBe(10)
    expect(nextGitHubLoginPollInterval(10)).toBe(15)
  })
})
