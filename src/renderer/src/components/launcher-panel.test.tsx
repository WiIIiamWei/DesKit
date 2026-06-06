import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LauncherPanel } from "./launcher-panel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
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

type TestElectronApi = NonNullable<Window["electronAPI"]>

class ResizeObserverMock implements ResizeObserver {
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
}

let previousResizeObserver: typeof globalThis.ResizeObserver | undefined
let runByIdHandler: ((command: { pluginId: string; commandId: string }) => void) | null = null

function ok<T>(data: T): DeskitPluginIpcResult<T> {
  return { ok: true, data }
}

function pluginCommand(
  overrides: Partial<DeskitPluginCommandResult> = {}
): DeskitPluginCommandResult {
  return {
    kind: "plugin-command",
    pluginId: "com.sanqian.dev-utilities",
    commandId: "dev.json",
    title: { en: "JSON Formatter", "zh-CN": "JSON 格式化" },
    subtitle: { en: "Format or minify JSON", "zh-CN": "格式化或压缩 JSON" },
    icon: "lucide:braces",
    mode: "view",
    score: 100,
    matches: [],
    ...overrides,
  }
}

function installElectronApi(): TestElectronApi {
  const api = {
    searchApps: vi.fn().mockResolvedValue([]),
    launchApp: vi.fn().mockResolvedValue(true),
    hideLauncher: vi.fn().mockResolvedValue(undefined),
    notifyLauncherReady: vi.fn(),
    searchPluginCommands: vi.fn(async (query: string) =>
      ok(query === "json" ? [pluginCommand()] : [])
    ),
    invokePluginCommand: vi.fn().mockResolvedValue(ok({ type: "list", items: [] })),
    disposePluginCommand: vi.fn().mockResolvedValue(ok(undefined)),
    getPlugin: vi.fn().mockResolvedValue(ok(null)),
    openExternalUrl: vi.fn().mockResolvedValue(true),
    writeClipboardContent: vi.fn().mockResolvedValue(true),
    pasteClipboardContent: vi.fn().mockResolvedValue(true),
    onLauncherFocus: vi.fn(() => () => undefined),
    onLauncherRunPluginCommand: vi.fn(
      (cb: (command: { pluginId: string; commandId: string }) => void) => {
        runByIdHandler = cb
        return () => undefined
      }
    ),
  } satisfies Partial<TestElectronApi>

  window.electronAPI = api as unknown as TestElectronApi
  return window.electronAPI
}

describe("launcher panel", () => {
  beforeEach(() => {
    vi.useRealTimers()
    previousResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = ResizeObserverMock
    installElectronApi()
  })

  afterEach(() => {
    cleanup()
    if (previousResizeObserver === undefined) {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    } else {
      globalThis.ResizeObserver = previousResizeObserver
    }
    previousResizeObserver = undefined
    runByIdHandler = null
    delete window.electronAPI
  })

  it("does not pass the launcher search text as plugin command input", async () => {
    const user = userEvent.setup()
    const api = window.electronAPI!
    render(<LauncherPanel />)

    await user.type(screen.getByPlaceholderText("launcher.placeholder"), "json")
    await waitFor(() => expect(screen.getByText("JSON Formatter")).toBeVisible())
    fireEvent.click(screen.getByText("JSON Formatter"))

    await waitFor(() => expect(api.invokePluginCommand).toHaveBeenCalledTimes(1))
    // The search text "json" must not leak into the command input (initialQuery
    // stays ""), but it IS forwarded as the trailing ranking query so the
    // command can be learned under it.
    expect(api.invokePluginCommand).toHaveBeenLastCalledWith(
      "com.sanqian.dev-utilities",
      "dev.json",
      "run",
      { initialQuery: "" },
      "json"
    )
  })

  it("does not pass a ranking query when a command is opened directly by id", async () => {
    const api = window.electronAPI!
    // Direct-open path (floating ball / global hotkey) resolves the command
    // from its manifest, not from a search selection.
    vi.mocked(api.getPlugin).mockResolvedValueOnce(
      ok({
        manifest: {
          contributes: {
            commands: [{ id: "dev.json", title: { en: "JSON Formatter" }, mode: "view" }],
          },
        },
      }) as never
    )
    render(<LauncherPanel />)
    expect(typeof runByIdHandler).toBe("function")

    await act(async () => {
      runByIdHandler!({ pluginId: "com.sanqian.dev-utilities", commandId: "dev.json" })
    })

    await waitFor(() => expect(api.invokePluginCommand).toHaveBeenCalled())
    // initialQuery stays empty AND the ranking query is undefined — no stale
    // launcher search text leaks into per-query learning.
    expect(api.invokePluginCommand).toHaveBeenLastCalledWith(
      "com.sanqian.dev-utilities",
      "dev.json",
      "run",
      { initialQuery: "" },
      undefined
    )
  })
})
