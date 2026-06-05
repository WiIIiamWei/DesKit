import type { KeyboardEvent } from "react"
import { Keyboard, RefreshCw, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
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
import { Switch } from "@/components/ui/switch"
import { acceleratorFromKeyboardEvent, modifierKeys, splitAccelerator } from "@/lib/accelerators"
import {
  clearSearchLearning,
  getSettings,
  isElectron,
  onSettingsChanged,
  refreshApps,
  updateSettings,
} from "@/lib/electron"

/**
 * Render an Electron accelerator string ("Control+Shift+P") as a row of
 * <Kbd> chips joined by "+". Each token is normalised to a short label
 * (Ctrl, Alt, Cmd on macOS).
 */
function HotkeyChips({ accelerator }: { accelerator: string }) {
  const isMac = isMacPlatform()
  const tokens = useMemo(() => splitAccelerator(accelerator, isMac), [accelerator, isMac])
  if (tokens.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }
  return (
    <KbdGroup>
      {tokens.map((token, i) => (
        // Tokens can legitimately repeat (e.g. user typo "Ctrl+Ctrl+P"),
        // and the whole list is rebuilt whenever the accelerator string
        // changes; positional keys are stable here.
        // eslint-disable-next-line react/no-array-index-key
        <span key={`${token}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/60">+</span>}
          <Kbd className="h-6 px-1.5 text-[11px]">{token}</Kbd>
        </span>
      ))}
    </KbdGroup>
  )
}

type HotkeyTarget = "launcher" | "screenshot"

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function createEmptyHotkeys(): DeskitHotkeySettings {
  return { launcher: "", screenshot: "" }
}

function sameHotkeys(left: DeskitHotkeySettings, right: DeskitHotkeySettings): boolean {
  return left.launcher === right.launcher && left.screenshot === right.screenshot
}

/**
 * Settings card for the launcher: rebind global hotkeys and trigger
 * a manual app re-scan. Stays compact so it can sit on the main shell
 * alongside other future setting groups.
 */
export function LauncherSettings() {
  const { t } = useTranslation()
  const [hotkeys, setHotkeys] = useState<DeskitHotkeySettings>(createEmptyHotkeys)
  const [savedHotkeys, setSavedHotkeys] = useState<DeskitHotkeySettings>(createEmptyHotkeys)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [learnFromSearchHistory, setLearnFromSearchHistory] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState<HotkeyTarget | null>(null)
  const hotkeysRef = useRef<DeskitHotkeySettings>(createEmptyHotkeys())
  const savedHotkeysRef = useRef<DeskitHotkeySettings>(createEmptyHotkeys())
  const launcherHotkeyInputRef = useRef<HTMLInputElement>(null)
  const screenshotHotkeyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    hotkeysRef.current = hotkeys
  }, [hotkeys])

  useEffect(() => {
    savedHotkeysRef.current = savedHotkeys
  }, [savedHotkeys])

  useEffect(() => {
    if (!isElectron()) return
    void getSettings().then((settings) => {
      hotkeysRef.current = settings.hotkeys
      savedHotkeysRef.current = settings.hotkeys
      setHotkeys(settings.hotkeys)
      setSavedHotkeys(settings.hotkeys)
      setLearnFromSearchHistory(settings.learnFromSearchHistory)
    })
    return onSettingsChanged((settings) => {
      setLearnFromSearchHistory(settings.learnFromSearchHistory)
      const incoming = settings.hotkeys
      const currentHotkeys = hotkeysRef.current
      const currentSavedHotkeys = savedHotkeysRef.current
      if (sameHotkeys(incoming, currentSavedHotkeys)) return

      savedHotkeysRef.current = incoming
      setSavedHotkeys(incoming)
      setStatus(null)

      setHotkeys((current) => {
        const next = { ...current }
        if (
          currentHotkeys.launcher === currentSavedHotkeys.launcher ||
          currentHotkeys.launcher === incoming.launcher
        ) {
          next.launcher = incoming.launcher
        }
        if (
          currentHotkeys.screenshot === currentSavedHotkeys.screenshot ||
          currentHotkeys.screenshot === incoming.screenshot
        ) {
          next.screenshot = incoming.screenshot
        }
        hotkeysRef.current = next
        return next
      })
    })
  }, [])

  if (!isElectron()) return null

  const dirty =
    hotkeys.launcher.trim() !== "" &&
    hotkeys.screenshot.trim() !== "" &&
    !sameHotkeys(hotkeys, savedHotkeys)

  function setHotkeyValue(target: HotkeyTarget, value: string) {
    setHotkeys((current) => {
      const next = { ...current, [target]: value }
      hotkeysRef.current = next
      return next
    })
  }

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
    setHotkeyValue(target, next)
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
      const next = await updateSettings({
        hotkey: requestedHotkeys.launcher,
        hotkeys: requestedHotkeys,
      })
      hotkeysRef.current = next.hotkeys
      savedHotkeysRef.current = next.hotkeys
      setHotkeys(next.hotkeys)
      setSavedHotkeys(next.hotkeys)
      // Main process keeps the previous hotkey if a new accelerator
      // can't be registered. Detect that mismatch and surface it to the user.
      if (!sameHotkeys(next.hotkeys, requestedHotkeys)) {
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

  async function onToggleLearn(next: boolean) {
    // Optimistic: reflect immediately, then persist. The settings broadcast
    // will re-confirm (or correct) the value.
    setLearnFromSearchHistory(next)
    setStatus(null)
    try {
      await updateSettings({ learnFromSearchHistory: next })
    } catch (err) {
      setLearnFromSearchHistory(!next)
      setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) })
    }
  }

  async function onClearLearning() {
    setClearing(true)
    try {
      await clearSearchLearning()
      // Transient confirmation: a sonner toast fades in, lingers, then fades
      // out on its own — unlike the inline status which would stay pinned.
      toast.success(t("launcher.settings.learningCleared"))
    } finally {
      setClearing(false)
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
                setHotkeyValue(target, e.target.value)
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

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel htmlFor="learn-from-search-history">
              {t("launcher.settings.learnTitle")}
            </FieldLabel>
            <FieldDescription className="text-xs">
              {t("launcher.settings.learnHint")}
            </FieldDescription>
          </div>
          <Switch
            id="learn-from-search-history"
            checked={learnFromSearchHistory}
            onCheckedChange={onToggleLearn}
            aria-label={t("launcher.settings.learnTitle")}
          />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClearLearning} disabled={clearing}>
            {t("launcher.settings.clearLearning")}
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
