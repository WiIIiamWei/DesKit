import { vi } from "vitest"

export const contextBridge = { exposeInMainWorld: vi.fn() }
export const ipcRenderer = { invoke: vi.fn(), on: vi.fn() }
export const ipcMain = { handle: vi.fn(), on: vi.fn() }
export const app = {
  whenReady: vi.fn(() => Promise.resolve()),
  getAppPath: vi.fn(() => "/app"),
  isPackaged: false,
  on: vi.fn(),
  quit: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
}
export const BrowserWindow = Object.assign(
  vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    },
    once: vi.fn(),
    show: vi.fn(),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
  })),
  { getAllWindows: vi.fn(() => []) }
)
export const session = { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } }
export const protocol = {
  registerSchemesAsPrivileged: vi.fn(),
  handle: vi.fn(),
}
export const net = { fetch: vi.fn() }
export const shell = {
  openExternal: vi.fn(() => Promise.resolve()),
  openPath: vi.fn(() => Promise.resolve("")),
}
export const clipboard = {
  readText: vi.fn(() => ""),
  writeText: vi.fn(),
  readImage: vi.fn(() => ({
    isEmpty: vi.fn(() => true),
    getSize: vi.fn(() => ({ width: 0, height: 0 })),
    toDataURL: vi.fn(() => ""),
  })),
  writeImage: vi.fn(),
}
export const nativeImage = {
  createFromDataURL: vi.fn((value: string) => ({ dataUrl: value })),
}
export const desktopCapturer = {
  getSources: vi.fn(() => Promise.resolve([])),
}
export const Notification = vi.fn(() => ({ show: vi.fn() }))

export default {
  contextBridge,
  ipcRenderer,
  ipcMain,
  app,
  BrowserWindow,
  session,
  protocol,
  net,
  shell,
  clipboard,
  nativeImage,
  desktopCapturer,
  Notification,
}
