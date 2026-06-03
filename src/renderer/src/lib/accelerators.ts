export interface AcceleratorKeyboardEvent {
  altKey: boolean
  code: string
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export const modifierKeys = new Set(["Alt", "Control", "Meta", "Shift"])

export function acceleratorFromKeyboardEvent(event: AcceleratorKeyboardEvent): string | null {
  if (modifierKeys.has(event.key)) return null

  const key = normalizeAcceleratorKey(event)
  if (!key) return null

  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push("Control")
  if (event.altKey) modifiers.push("Alt")
  if (event.shiftKey) modifiers.push("Shift")
  if (event.metaKey) modifiers.push(isMacPlatform() ? "CommandOrControl" : "Super")

  if (modifiers.length === 0) return null
  return [...modifiers, key].join("+")
}

export function splitAccelerator(accelerator: string, isMac = isMacPlatform()): string[] {
  return accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      switch (lower) {
        case "commandorcontrol":
        case "cmdorctrl":
          return isMac ? "⌘" : "Ctrl"
        case "control":
        case "ctrl":
          return "Ctrl"
        case "command":
        case "cmd":
          return isMac ? "⌘" : "Cmd"
        case "meta":
        case "super":
          return isMac ? "⌘" : "Win"
        case "alt":
        case "option":
          return isMac ? "⌥" : "Alt"
        case "shift":
          return "Shift"
        case "space":
          return "Space"
        default:
          return part.length === 1 ? part.toUpperCase() : part
      }
    })
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function normalizeAcceleratorKey(event: AcceleratorKeyboardEvent): string | null {
  if (
    event.code === "Space" ||
    event.key === " " ||
    event.key === "Space" ||
    event.key === "Spacebar"
  ) {
    return "Space"
  }
  if (event.key === "+") return "Plus"
  if (event.code === "NumpadAdd") return "Plus"
  if (event.key.length === 1) return event.key.toUpperCase()
  if (event.code.startsWith("Key")) return event.code.slice(3).toUpperCase()
  if (event.code.startsWith("Digit")) return event.code.slice(5)

  switch (event.key) {
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "Backspace":
    case "Delete":
    case "End":
    case "Enter":
    case "Escape":
    case "Home":
    case "Insert":
    case "PageDown":
    case "PageUp":
    case "Space":
    case "Tab":
      return event.key
    default:
      return /^F\d{1,2}$/.test(event.key) ? event.key : null
  }
}
