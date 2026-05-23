import type { AppEntry } from "./types"
import { describe, expect, it } from "vitest"
import { buildEntryFromShortcut, dedupeEntries } from "./scan-start-menu"

const shellOk = {
  readShortcutLink: (_path: string) => ({
    target: "C:\\Program Files\\Foo\\foo.exe",
    description: "Foo launcher",
    icon: "C:\\Program Files\\Foo\\foo.exe",
  }),
}

describe("buildEntryFromShortcut", () => {
  it("builds an AppEntry from a valid .lnk", () => {
    const entry = buildEntryFromShortcut(
      "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk",
      ".lnk",
      shellOk
    )
    expect(entry).not.toBeNull()
    expect(entry!.name).toBe("Foo")
    expect(entry!.kind).toBe("win32")
    expect(entry!.target.endsWith("Foo.lnk")).toBe(true)
    expect(entry!.description).toBe("Foo launcher")
  })

  it("skips uninstaller-style noise", () => {
    const entry = buildEntryFromShortcut("C:\\Start Menu\\Uninstall Foo.lnk", ".lnk", shellOk)
    expect(entry).toBeNull()
  })

  it("rejects shortcuts whose target is not launchable", () => {
    const entry = buildEntryFromShortcut("C:\\Start Menu\\Foo Readme.lnk", ".lnk", {
      readShortcutLink: () => ({ target: "C:\\Program Files\\Foo\\readme.txt" }),
    })
    expect(entry).toBeNull()
  })

  it("returns null when the resolver throws", () => {
    const entry = buildEntryFromShortcut("C:\\bad.lnk", ".lnk", {
      readShortcutLink: () => {
        throw new Error("unreadable")
      },
    })
    expect(entry).toBeNull()
  })

  it("handles .url shortcuts without resolving them", () => {
    const entry = buildEntryFromShortcut("C:\\Start Menu\\Docs.url", ".url", shellOk)
    expect(entry).not.toBeNull()
    expect(entry!.kind).toBe("url")
    expect(entry!.target.endsWith("Docs.url")).toBe(true)
  })
})

describe("dedupeEntries", () => {
  it("removes duplicate ids and sorts by name", () => {
    const a: AppEntry = {
      id: "x:foo",
      kind: "win32",
      name: "Banana",
      nameLower: "banana",
      target: "Banana",
    }
    const b: AppEntry = { ...a, name: "Apple", nameLower: "apple", id: "x:bar" }
    const dup: AppEntry = { ...a }
    const result = dedupeEntries([a, b, dup])
    expect(result.map((r) => r.name)).toEqual(["Apple", "Banana"])
  })
})
