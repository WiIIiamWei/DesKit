import type { KeyboardEvent } from "react"
import { Keyboard, RefreshCw, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { getSettings, isElectron, refreshApps, updateSettings } from "@/lib/electron"

/**
 * Render an Electron accelerator string ("Control+Shift+P") as a row of
 * <Kbd> chips joined by "+". Each token is normalised to a short label
 * (Ctrl, Alt, ⌘ on macOS).
 */
function HotkeyChips({ accelerator }: { accelerator: string }) {
  const isMac = isMacPlatform()
  const tokens = useMemo(() => splitAccelerator(accelerator, isMac), [accelerator, isMac])
  if (tokens.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <KbdGroup>
      {tokens.map((token, i) => (
        // Tokens can legitimately repeat (e.g. user typo "Ctrl+Ctrl+P"),
        // and the whole list is rebuilt whenever the accelerator string
        // changes — positional keys are stable here.
        // eslint-disable-next-line react/no-array-index-key
        <span key={`${token}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/60">+</span>}
          <Kbd className="h-6 px-1.5 text-[11px]">{token}</Kbd>
        </span>
      ))}
    </KbdGroup>
  )
}

function splitAccelerator(accelerator: string, isMac = isMacPlatform()): string[] {
  return accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      switch (lower) {
        case "commandorcontrol":
        case "cmdorctrl":
        case "control":
        case "ctrl":
          return "Ctrl"
        case "command":
        case "cmd":
        case "meta":
        case "super":
          return "⌘"
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

const modifierKeys = new Set(["Alt", "Control", "Meta", "Shift"])
type HotkeyTarget = "launcher" | "screenshot"

function acceleratorFromKeyboardEvent(event: KeyboardEvent<HTMLInputElement>): string | null {
  if (modifierKeys.has(event.key)) return null

  const key = normalizeAcceleratorKey(event)
  if (!key) return null

  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push("Control")
  if (event.altKey) modifiers.push("Alt")
  if (event.shiftKey) modifiers.push("Shift")
  if (event.metaKey) modifiers.push(isMacPlatform() ? "Command" : "Meta")

  if (modifiers.length === 0) return null
  return [...modifiers, key].join("+")
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function normalizeAcceleratorKey(event: KeyboardEvent<HTMLInputElement>): string | null {
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

/**
 * Settings card for the launcher: rebind the global hotkey and trigger
 * a manual app re-scan. Stays compact so it can sit on the main shell
 * alongside other future setting groups.
 */
export function LauncherSettings() {
  const { t } = useTranslation()
  const [hotkeys, setHotkeys] = useState<DeskitHotkeySettings>({
    launcher: "",
    screenshot: "",
  })
  const [savedHotkeys, setSavedHotkeys] = useState<DeskitHotkeySettings>({
    launcher: "",
    screenshot: "",
  })
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState<HotkeyTarget | null>(null)
  const launcherHotkeyInputRef = useRef<HTMLInputElement>(null)
  const screenshotHotkeyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isElectron()) return
    void getSettings().then((settings) => {
      setHotkeys(settings.hotkeys)
      setSavedHotkeys(settings.hotkeys)
    })
  }, [])

  if (!isElectron()) return null

  const dirty =
    hotkeys.launcher.trim() !== "" &&
    hotkeys.screenshot.trim() !== "" &&
    (hotkeys.launcher !== savedHotkeys.launcher || hotkeys.screenshot !== savedHotkeys.screenshot)

  function onHotkeyKeyDown(target: HotkeyTarget, event: KeyboardEvent<HTMLInputElement>) {
    if (capturingHotkey !== target) return

    event.preventDefault()
    event.stopPropagation()

    if (event.key === "Escape") {
      setCapturingHotkey(null)
      return
    }

    if (modifierKeys.has(event.key)) {
      return
    }

    const next = acceleratorFromKeyboardEvent(event)
    if (!next) return

    setStatus(null)
    setHotkeys((current) => ({ ...current, [target]: next }))
    setCapturingHotkey(null)
  }

  function onCaptureHotkey(target: HotkeyTarget) {
    setCapturingHotkey(target)
    setStatus(null)
    const ref = target === "launcher" ? launcherHotkeyInputRef : screenshotHotkeyInputRef
    ref.current?.focus()
  }

  async function onSave() {
    setStatus(null)
    try {
      const requestedHotkeys = hotkeys
      const next = await updateSettings({ hotkeys: requestedHotkeys })
      setHotkeys(next.hotkeys)
      setSavedHotkeys(next.hotkeys)
      // Main process keeps the previous hotkey if the new accelerator
      // can't be registered (returns the still-active value). Detect
      // that mismatch and surface it to the user.
      if (next.hotkeys.launcher !== requestedHotkeys.launcher) {
        setStatus({ kind: "error", text: t("launcher.settings.invalid") })
      } else {
        setStatus({ kind: "ok", text: t("launcher.settings.saved") })
      }
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    try {
      await refreshApps()
      setStatus({ kind: "ok", text: t("launcher.settings.rescanned") })
    } finally {
      setRefreshing(false)
    }
  }

  function renderHotkeyField({
    description,
    label,
    placeholder,
    target,
  }: {
    description: string
    label: string
    placeholder: string
    target: HotkeyTarget
  }) {
    const inputRef = target === "launcher" ? launcherHotkeyInputRef : screenshotHotkeyInputRef
    const isCapturing = capturingHotkey === target

    return (
      <Field>
        <FieldLabel htmlFor={`${target}-hotkey-input`} className="flex items-center gap-2">
          <Keyboard className="size-3.5 text-muted-foreground" aria-hidden />
          {label}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            id={`${target}-hotkey-input`}
            value={hotkeys[target]}
            onChange={(e) => {
              if (!isCapturing) {
                const value = e.target.value
                setHotkeys((current) => ({ ...current, [target]: value }))
              }
            }}
            onBlur={() => {
              if (isCapturing) setCapturingHotkey(null)
            }}
            onKeyDown={(event) => onHotkeyKeyDown(target, event)}
            onPaste={(e) => {
              if (isCapturing) e.preventDefault()
            }}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            readOnly={isCapturing}
            className="font-mono text-sm"
          />
          <Button
            type="button"
            variant={isCapturing ? "secondary" : "outline"}
            onClick={() => onCaptureHotkey(target)}
            aria-label={t(
              isCapturing
                ? `launcher.settings.${target}CapturingLabel`
                : `launcher.settings.${target}CaptureLabel`
            )}
            aria-pressed={isCapturing}
          >
            <Keyboard className="size-4" aria-hidden />
            {isCapturing ? t("launcher.settings.capturing") : t("launcher.settings.capture")}
          </Button>
        </div>
        <FieldDescription className="text-xs">{description}</FieldDescription>
      </Field>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t("launcher.settings.title")}
        </CardTitle>
        <CardDescription>{t("launcher.settings.subtitle")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {renderHotkeyField({
          target: "launcher",
          label: t("launcher.settings.hotkeyLabel"),
          description: t("launcher.settings.hotkeyHint"),
          placeholder: "Control+Space",
        })}
        {renderHotkeyField({
          target: "screenshot",
          label: t("launcher.settings.screenshotHotkeyLabel"),
          description: t("launcher.settings.screenshotHotkeyHint"),
          placeholder: "Control+Shift+A",
        })}
        <div className="flex items-center justify-between gap-3">
          <FieldDescription className="text-xs">{t("launcher.settings.examples")}</FieldDescription>
          <Button onClick={onSave} disabled={!dirty}>
            {t("launcher.settings.save")}
          </Button>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("launcher.settings.activeLauncher")}
              </span>
              <HotkeyChips accelerator={savedHotkeys.launcher} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("launcher.settings.activeScreenshot")}
              </span>
              <HotkeyChips accelerator={savedHotkeys.screenshot} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {refreshing ? t("launcher.settings.rescanning") : t("launcher.settings.rescan")}
          </Button>
        </div>
      </CardContent>

      {status && (
        <CardFooter className="border-t pt-4">
          <p
            role="status"
            className={
              status.kind === "ok"
                ? "text-sm text-emerald-600 dark:text-emerald-400"
                : "text-sm text-destructive"
            }
          >
            {status.text}
          </p>
        </CardFooter>
      )}
    </Card>
  )
}
