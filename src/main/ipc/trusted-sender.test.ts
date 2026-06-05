import { describe, expect, it } from "vitest"
import { isTrustedSenderUrl } from "./trusted-sender"

const options = {
  appScheme: "app",
  appHost: "app",
}

describe("trusted sender url", () => {
  it("trusts the packaged app custom scheme", () => {
    expect(isTrustedSenderUrl("app://app/index.html#search", options)).toBe(true)
  })

  it("rejects other custom scheme hosts", () => {
    expect(isTrustedSenderUrl("app://evil/index.html", options)).toBe(false)
  })

  it("trusts the configured renderer dev origin", () => {
    expect(
      isTrustedSenderUrl("http://localhost:5173/#search", {
        ...options,
        rendererDevUrl: "http://localhost:5173",
      })
    ).toBe(true)
  })
})
