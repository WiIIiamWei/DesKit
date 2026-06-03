import { globalShortcut } from "electron"

const DEFAULT_SHORTCUT_ID = "default"

interface ShortcutBinding {
  accelerator: string
  handler: () => void
}

const bindings = new Map<string, ShortcutBinding>()

/**
 * Replace a named global shortcut binding. Returns true if the new
 * accelerator was registered successfully — false means it was rejected
 * by Electron or is already owned by another process, in which case the
 * previous binding for the same id remains active.
 */
export function bindGlobalShortcut(id: string, accelerator: string, handler: () => void): boolean {
  const key = id.trim()
  const trimmed = accelerator.trim()
  if (!key || !trimmed) return false
  const current = bindings.get(key)
  if (isAcceleratorUsedByAnotherBinding(key, trimmed)) return false

  if (current) globalShortcut.unregister(current.accelerator)
  let ok = false
  try {
    ok = globalShortcut.register(trimmed, handler)
  } catch {
    ok = false
  }
  if (ok) {
    bindings.set(key, { accelerator: trimmed, handler })
    return true
  }
  if (current) {
    // Re-install the old binding so the user isn't left without a hotkey.
    try {
      if (globalShortcut.register(current.accelerator, current.handler)) {
        bindings.set(key, current)
      } else {
        bindings.delete(key)
      }
    } catch {
      bindings.delete(key)
    }
  }
  return false
}

export function bindNamedGlobalShortcut(
  id: string,
  accelerator: string,
  handler: () => void
): boolean {
  return bindGlobalShortcut(id, accelerator, handler)
}

export function bindDefaultGlobalShortcut(accelerator: string, handler: () => void): boolean {
  return bindGlobalShortcut(DEFAULT_SHORTCUT_ID, accelerator, handler)
}

export function unbindGlobalShortcut(id: string): void {
  const current = bindings.get(id)
  if (!current) return
  globalShortcut.unregister(current.accelerator)
  bindings.delete(id)
}

export function unbindNamedGlobalShortcut(id: string): void {
  unbindGlobalShortcut(id)
}

export function unbindDefaultGlobalShortcut(): void {
  unbindGlobalShortcut(DEFAULT_SHORTCUT_ID)
}

export function unbindAllGlobalShortcuts(): void {
  for (const id of [...bindings.keys()]) {
    unbindGlobalShortcut(id)
  }
}

export function currentBinding(id = DEFAULT_SHORTCUT_ID): string | null {
  return bindings.get(id)?.accelerator ?? null
}

export function currentBindings(): Record<string, string> {
  return Object.fromEntries([...bindings].map(([id, binding]) => [id, binding.accelerator]))
}

function isAcceleratorUsedByAnotherBinding(id: string, accelerator: string): boolean {
  for (const [bindingId, binding] of bindings) {
    if (bindingId !== id && binding.accelerator === accelerator) return true
  }
  return false
}
