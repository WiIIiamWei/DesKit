import type { CSSProperties, PointerEvent, ReactNode } from "react"
import { Check, Copy, PenLine, Pin, RotateCcw, Save, ScanText, X } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { cancelScreenshotSelection, completeScreenshotSelection } from "@/lib/electron"
import { cn } from "@/lib/utils"

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const MIN_SELECTION_SIZE = 4

export function ScreenshotOverlayPage() {
  const { t } = useTranslation()
  const captureOnly =
    new URLSearchParams(window.location.search).get("screenshotMode") === "capture"
  const [drag, setDrag] = useState<DragState | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const activeRect = useMemo(() => {
    if (drag) return rectFromPoints(drag.startX, drag.startY, drag.currentX, drag.currentY)
    return selection
  }, [drag, selection])

  useTransparentDocument()

  const cancel = useCallback(() => {
    void cancelScreenshotSelection()
  }, [])

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") cancel()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cancel])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelection(null)
    setDrag({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    })
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    setDrag((current) =>
      current
        ? {
            ...current,
            currentX: event.clientX,
            currentY: event.clientY,
          }
        : current
    )
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const next = rectFromPoints(drag.startX, drag.startY, event.clientX, event.clientY)
    setDrag(null)
    setSelection(isUsableRect(next) ? next : null)
  }

  async function finish(action: DeskitScreenshotAction) {
    if (!selection) return
    await completeScreenshotSelection(selection, action)
  }

  return (
    <div
      className="relative h-screen w-screen cursor-crosshair select-none overflow-hidden bg-black/20"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(event) => {
        event.preventDefault()
        cancel()
      }}
    >
      {activeRect && (
        <>
          <div className="absolute inset-0 bg-black/25" />
          <div
            className="absolute border border-white bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={rectStyle(activeRect)}
          />
          <div
            className="absolute rounded bg-zinc-950/90 px-2 py-1 text-xs font-medium text-white shadow"
            style={sizeLabelStyle(activeRect)}
          >
            {Math.round(activeRect.width)} x {Math.round(activeRect.height)}
          </div>
          {selection && (
            <div
              className="absolute flex items-center gap-1 rounded-md border border-white/10 bg-zinc-950/95 p-1 shadow-xl"
              style={toolbarStyle(selection)}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              {captureOnly ? (
                <ToolbarButton
                  title={t("screenshot.actions.capture")}
                  onClick={() => void finish("copy")}
                >
                  <Check className="size-4" aria-hidden />
                </ToolbarButton>
              ) : (
                <>
                  <ToolbarButton
                    title={t("screenshot.actions.copy")}
                    onClick={() => void finish("copy")}
                  >
                    <Copy className="size-4" aria-hidden />
                  </ToolbarButton>
                  <ToolbarButton
                    title={t("screenshot.actions.save")}
                    onClick={() => void finish("save")}
                  >
                    <Save className="size-4" aria-hidden />
                  </ToolbarButton>
                  <ToolbarButton
                    title={t("screenshot.actions.pin")}
                    onClick={() => void finish("pin")}
                  >
                    <Pin className="size-4" aria-hidden />
                  </ToolbarButton>
                  <ToolbarButton
                    title={t("screenshot.actions.annotate")}
                    onClick={() => void finish("annotate")}
                  >
                    <PenLine className="size-4" aria-hidden />
                  </ToolbarButton>
                  <ToolbarButton
                    title={t("screenshot.actions.ocr")}
                    onClick={() => void finish("ocr")}
                  >
                    <ScanText className="size-4" aria-hidden />
                  </ToolbarButton>
                </>
              )}
              <ToolbarButton
                title={t("screenshot.actions.reselect")}
                onClick={() => {
                  setSelection(null)
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
              </ToolbarButton>
              <ToolbarButton title={t("screenshot.actions.cancel")} onClick={cancel}>
                <X className="size-4" aria-hidden />
              </ToolbarButton>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={title}
      onClick={onClick}
      className={cn("size-8 text-white hover:bg-white/10 hover:text-white")}
    >
      {children}
      <span className="sr-only">{title}</span>
    </Button>
  )
}

function useTransparentDocument(): void {
  useLayoutEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
    }
    html.style.background = "transparent"
    body.style.background = "transparent"
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      html.style.background = prev.htmlBg
      body.style.background = prev.bodyBg
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
    }
  }, [])
}

function rectFromPoints(startX: number, startY: number, currentX: number, currentY: number): Rect {
  const x = Math.min(startX, currentX)
  const y = Math.min(startY, currentY)
  return {
    x,
    y,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }
}

function isUsableRect(rect: Rect): boolean {
  return rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE
}

function rectStyle(rect: Rect): CSSProperties {
  return {
    height: rect.height,
    left: rect.x,
    top: rect.y,
    width: rect.width,
  }
}

function sizeLabelStyle(rect: Rect): CSSProperties {
  return {
    left: rect.x,
    top: Math.max(8, rect.y - 28),
  }
}

function toolbarStyle(rect: Rect): CSSProperties {
  return {
    left: Math.min(window.innerWidth - 260, Math.max(8, rect.x + rect.width - 228)),
    top: Math.min(window.innerHeight - 48, rect.y + rect.height + 8),
  }
}
