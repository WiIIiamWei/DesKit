import { describe, expect, it } from "vitest"
import { parseGetStartApps } from "./scan-uwp"

describe("parseGetStartApps", () => {
  it("keeps packaged apps (AppId with !) and drops .lnk shortcuts", () => {
    const json = JSON.stringify([
      { Name: "Calculator", AppID: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" },
      {
        Name: "Notepad++",
        AppID: "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Notepad++.lnk",
      },
      { Name: "", AppID: "Foo!Bar" },
    ])
    const entries = parseGetStartApps(json)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe("uwp")
    expect(entries[0].name).toBe("Calculator")
    expect(entries[0].target).toBe(
      "shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"
    )
  })

  it("accepts a single-object response (PowerShell collapses one-element arrays)", () => {
    const json = JSON.stringify({ Name: "Photos", AppID: "Microsoft.Photos_x!App" })
    const entries = parseGetStartApps(json)
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe("Photos")
  })

  it("returns an empty array on invalid JSON", () => {
    expect(parseGetStartApps("not json")).toEqual([])
  })
})
