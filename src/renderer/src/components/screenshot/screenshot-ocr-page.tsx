import { Copy, Loader2, RotateCcw, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  closeScreenshotOcrWindow,
  getScreenshotOcrState,
  recaptureScreenshotOcr,
  writeClipboardContent,
} from "@/lib/electron"

const EMPTY_OCR_MESSAGE = "未识别到文字，请重新选择包含文字的区域"

export function ScreenshotOcrPage() {
  const { t } = useTranslation()
  const [state, setState] = useState<DeskitScreenshotOcrState | null>(null)
  const [text, setText] = useState("")
  const lastToastMessageRef = useRef<string | undefined>(undefined)
  const applyState = useCallback((next: DeskitScreenshotOcrState | null): void => {
    setState(next)
    setText(next?.text ?? "")
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refresh(): Promise<void> {
      const next = await getScreenshotOcrState()
      if (cancelled) return
      applyState(next)
    }
    void refresh()
    return () => {
      cancelled = true
    }
  }, [applyState])

  useEffect(() => {
    return window.electronAPI?.onScreenshotOcrUpdated(() => {
      void getScreenshotOcrState().then(applyState)
    })
  }, [applyState])

  useEffect(() => {
    const message = state?.message
    if (
      !message ||
      state?.isLoading ||
      message === lastToastMessageRef.current ||
      message === EMPTY_OCR_MESSAGE
    ) {
      return
    }
    lastToastMessageRef.current = message
    toast.info(message)
  }, [state?.isLoading, state?.message])

  async function copyText(): Promise<void> {
    try {
      await writeClipboardContent({ type: "text", text })
      toast.success(t("screenshot.ocr.copied"))
    } catch {
      toast.error(t("screenshot.ocr.copyFailed"))
    }
  }

  async function recapture(): Promise<void> {
    const started = await recaptureScreenshotOcr()
    if (!started) toast.error(t("screenshot.ocr.recaptureFailed"))
  }

  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_minmax(320px,420px)] overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 bg-muted/35 p-4">
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded border bg-background/20 shadow-sm">
          {state?.imageDataUrl ? (
            <img
              src={state.imageDataUrl}
              alt="截图预览"
              draggable={false}
              className="h-full w-full select-none object-contain"
            />
          ) : (
            <div className="text-sm text-muted-foreground">{t("screenshot.ocr.loading")}</div>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col border-l bg-background">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
          <div className="text-sm font-medium">{t("screenshot.ocr.title")}</div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title={t("screenshot.actions.close")}
            onClick={() => void closeScreenshotOcrWindow()}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">{t("screenshot.actions.close")}</span>
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {state?.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {state.message || t("screenshot.ocr.recognizing")}
            </div>
          ) : state?.error ? (
            <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </div>
          ) : null}
          {!state?.isLoading && !state?.error && !text ? (
            <div className="rounded border bg-muted/40 p-3 text-sm text-muted-foreground">
              {state?.message || t("screenshot.ocr.empty")}
            </div>
          ) : null}
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-0 flex-1 resize-none"
            placeholder={t("screenshot.ocr.placeholder")}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => void copyText()} disabled={!text.trim()}>
              <Copy className="size-4" aria-hidden />
              {t("screenshot.actions.copy")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void recapture()}>
              <RotateCcw className="size-4" aria-hidden />
              {t("screenshot.ocr.recapture")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
