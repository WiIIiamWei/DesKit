import { globalShortcut } from "electron"

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
  const trimmed = accelerator.trim()
  if (!trimmed) return false
  const current = bindings.get(id)
  if (isAcceleratorUsedByAnotherBinding(id, trimmed)) return false

  if (current) globalShortcut.unregister(current.accelerator)
  let ok = false
  try {
    ok = globalShortcut.register(trimmed, handler)
  } catch {
    ok = false
  }
  if (ok) {
    bindings.set(id, { accelerator: trimmed, handler })
    return true
  }
  if (current) {
    // Re-install the old binding so the user isn't left without a hotkey.
    try {
      if (globalShortcut.register(current.accelerator, current.handler)) {
        bindings.set(id, current)
      } else {
        bindings.delete(id)
      }
    } catch {
      bindings.delete(id)
    }
  }
  return false
}

export function unbindGlobalShortcut(id: string): void {
  const current = bindings.get(id)
  if (!current) return
  globalShortcut.unregister(current.accelerator)
  bindings.delete(id)
}

export function unbindAllGlobalShortcuts(): void {
  for (const id of bindings.keys()) {
    unbindGlobalShortcut(id)
  }
}

export function currentBinding(id: string): string | null {
  return bindings.get(id)?.accelerator ?? null
}

function isAcceleratorUsedByAnotherBinding(id: string, accelerator: string): boolean {
  for (const [bindingId, binding] of bindings) {
    if (bindingId !== id && binding.accelerator === accelerator) return true
  }
  return false
}
