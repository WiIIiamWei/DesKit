import { globalShortcut } from "electron"

const DEFAULT_SHORTCUT_ID = "default"
const currentAccelerators = new Map<string, string>()

/**
 * Replace a named global shortcut binding. Returns true if the new
 * accelerator was registered successfully — false means it was rejected
 * by Electron or is already owned by another process, in which case the
 * previous binding for that name remains active.
 */
export function bindNamedGlobalShortcut(
  id: string,
  accelerator: string,
  handler: () => void
): boolean {
  const key = id.trim()
  const trimmed = accelerator.trim()
  if (!key || !trimmed) return false

  const currentAccelerator = currentAccelerators.get(key) ?? null
  if (currentAccelerator === trimmed && globalShortcut.isRegistered(trimmed)) return true

  if (currentAccelerator) globalShortcut.unregister(currentAccelerator)
  let ok = false
  try {
    ok = globalShortcut.register(trimmed, handler)
  } catch {
    ok = false
  }
  if (ok) {
    currentAccelerators.set(key, trimmed)
    return true
  }
  if (currentAccelerator) {
    // Re-install the old binding so the user isn't left without a hotkey.
    try {
      globalShortcut.register(currentAccelerator, handler)
    } catch {
      // ignore — nothing we can do
    }
  }
  return false
}

export function unbindNamedGlobalShortcut(id: string): void {
  const key = id.trim()
  const currentAccelerator = currentAccelerators.get(key)
  if (currentAccelerator) globalShortcut.unregister(currentAccelerator)
  currentAccelerators.delete(key)
}

export function unbindAllGlobalShortcuts(): void {
  for (const accelerator of currentAccelerators.values()) {
    globalShortcut.unregister(accelerator)
  }
  currentAccelerators.clear()
}

export function currentBinding(id = DEFAULT_SHORTCUT_ID): string | null {
  return currentAccelerators.get(id) ?? null
}

export function currentBindings(): Record<string, string> {
  return Object.fromEntries(currentAccelerators)
}

export function bindGlobalShortcut(accelerator: string, handler: () => void): boolean {
  return bindNamedGlobalShortcut(DEFAULT_SHORTCUT_ID, accelerator, handler)
}

export function unbindGlobalShortcut(): void {
  unbindAllGlobalShortcuts()
}
