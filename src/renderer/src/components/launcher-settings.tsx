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
import { acceleratorFromKeyboardEvent, modifierKeys, splitAccelerator } from "@/lib/accelerators"
import {
  getSettings,
  isElectron,
  onSettingsChanged,
  refreshApps,
  updateSettings,
} from "@/lib/electron"

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

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

/**
 * Settings card for the launcher: rebind the global hotkey and trigger
 * a manual app re-scan. Stays compact so it can sit on the main shell
 * alongside other future setting groups.
 */
export function LauncherSettings() {
  const { t } = useTranslation()
  const [hotkey, setHotkey] = useState("")
  const [savedHotkey, setSavedHotkey] = useState("")
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState(false)
  const hotkeyRef = useRef("")
  const savedHotkeyRef = useRef("")
  const hotkeyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    hotkeyRef.current = hotkey
  }, [hotkey])

  useEffect(() => {
    savedHotkeyRef.current = savedHotkey
  }, [savedHotkey])

  useEffect(() => {
    if (!isElectron()) return
    void getSettings().then((settings) => {
      hotkeyRef.current = settings.hotkey
      savedHotkeyRef.current = settings.hotkey
      setHotkey(settings.hotkey)
      setSavedHotkey(settings.hotkey)
    })
    return onSettingsChanged((settings) => {
      const currentHotkey = hotkeyInputRef.current?.value ?? hotkeyRef.current
      const currentSavedHotkey = savedHotkeyRef.current
      if (settings.hotkey === currentSavedHotkey) return

      savedHotkeyRef.current = settings.hotkey
      setSavedHotkey(settings.hotkey)
      setStatus(null)

      if (currentHotkey === currentSavedHotkey || currentHotkey === settings.hotkey) {
        hotkeyRef.current = settings.hotkey
        setHotkey(settings.hotkey)
      }
    })
  }, [])

  if (!isElectron()) return null

  const dirty = hotkey.trim() !== "" && hotkey !== savedHotkey

  function onHotkeyKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!capturingHotkey) return

    event.preventDefault()
    event.stopPropagation()

    if (event.key === "Escape") {
      setCapturingHotkey(false)
      return
    }

    if (modifierKeys.has(event.key)) {
      return
    }

    const next = acceleratorFromKeyboardEvent(event)
    if (!next) return

    setStatus(null)
    hotkeyRef.current = next
    setHotkey(next)
    setCapturingHotkey(false)
  }

  function onCaptureHotkey() {
    setCapturingHotkey(true)
    setStatus(null)
    hotkeyInputRef.current?.focus()
  }

  async function onSave() {
    setStatus(null)
    try {
      const next = await updateSettings({ hotkey })
      savedHotkeyRef.current = next.hotkey
      setSavedHotkey(next.hotkey)
      // Main process keeps the previous hotkey if the new accelerator
      // can't be registered (returns the still-active value). Detect
      // that mismatch and surface it to the user.
      if (next.hotkey !== hotkey) {
        hotkeyRef.current = next.hotkey
        setHotkey(next.hotkey)
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
        <Field>
          <FieldLabel htmlFor="hotkey-input" className="flex items-center gap-2">
            <Keyboard className="size-3.5 text-muted-foreground" aria-hidden />
            {t("launcher.settings.hotkeyLabel")}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              ref={hotkeyInputRef}
              id="hotkey-input"
              value={hotkey}
              onChange={(e) => {
                if (!capturingHotkey) {
                  hotkeyRef.current = e.target.value
                  setHotkey(e.target.value)
                }
              }}
              onBlur={() => setCapturingHotkey(false)}
              onKeyDown={onHotkeyKeyDown}
              onPaste={(e) => {
                if (capturingHotkey) e.preventDefault()
              }}
              placeholder="Control+Space"
              spellCheck={false}
              autoComplete="off"
              readOnly={capturingHotkey}
              className="font-mono text-sm"
            />
            <Button
              type="button"
              variant={capturingHotkey ? "secondary" : "outline"}
              onClick={onCaptureHotkey}
              aria-pressed={capturingHotkey}
            >
              <Keyboard className="size-4" aria-hidden />
              {capturingHotkey ? t("launcher.settings.capturing") : t("launcher.settings.capture")}
            </Button>
            <Button onClick={onSave} disabled={!dirty}>
              {t("launcher.settings.save")}
            </Button>
          </div>
          <FieldDescription className="text-xs">
            {t("launcher.settings.hotkeyHint")}
          </FieldDescription>
          <FieldDescription className="text-xs">{t("launcher.settings.examples")}</FieldDescription>
        </Field>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("launcher.settings.active")}</span>
            <HotkeyChips accelerator={savedHotkey} />
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
