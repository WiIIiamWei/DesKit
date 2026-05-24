import { describe, expect, it } from "vitest"
import { buildEntryFromAppBundle } from "./scan-macos-apps"

describe("buildEntryFromAppBundle", () => {
  it("builds an AppEntry from a .app bundle", () => {
    const entry = buildEntryFromAppBundle("/Applications/Foo.app")
    expect(entry).not.toBeNull()
    expect(entry!.id).toBe("macos:/applications/foo.app")
    expect(entry!.kind).toBe("macos")
    expect(entry!.name).toBe("Foo")
    expect(entry!.target).toBe("/Applications/Foo.app")
    expect(entry!.description).toBe("/Applications")
  })

  it("rejects non-app paths", () => {
    expect(buildEntryFromAppBundle("/Applications/Foo")).toBeNull()
  })
})
