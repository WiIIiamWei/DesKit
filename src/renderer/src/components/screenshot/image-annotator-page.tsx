import type { PointerEvent, ReactNode } from "react"
import { Copy, MousePointer2, Pin, Save, Slash, Undo2, X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  cancelScreenshotAnnotation,
  completeScreenshotAnnotation,
  getScreenshotAnnotationImage,
} from "@/lib/electron"
import { cn } from "@/lib/utils"

type Tool = "arrow" | "mosaic"
interface Point {
  x: number
  y: number
}
type AnnotationOp =
  | { type: "arrow"; from: Point; to: Point; color: string; width: number }
  | { type: "mosaic"; x: number; y: number; width: number; height: number }

interface DragState {
  from: Point
  to: Point
}

export function ImageAnnotatorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [tool, setTool] = useState<Tool>("arrow")
  const [ops, setOps] = useState<AnnotationOp[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    let cancelled = false
    void getScreenshotAnnotationImage().then((dataUrl) => {
      if (cancelled || !dataUrl) return
      const image = new Image()
      image.onload = () => {
        if (cancelled) return
        imageRef.current = image
        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
        }
        setImageLoaded(true)
      }
      image.src = dataUrl
    })
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    renderCanvas(canvasRef.current, imageRef.current, ops, drag ? previewOp(tool, drag) : null)
  }, [drag, imageLoaded, ops, tool])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") void cancelScreenshotAnnotation()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        setOps((current) => current.slice(0, -1))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    }
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = canvasPoint(event)
    setDrag({ from: point, to: point })
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag) return
    setDrag({ ...drag, to: canvasPoint(event) })
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const next = previewOp(tool, { ...drag, to: canvasPoint(event) })
    setDrag(null)
    if (!next) return
    setOps((current) => [...current, next])
  }

  async function finish(action: "copy" | "save" | "pin") {
    const canvas = canvasRef.current
    if (!canvas) return
    await completeScreenshotAnnotation(canvas.toDataURL("image/png"), action)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <div className="flex items-center gap-1">
          <ToolButton active={tool === "arrow"} title="Arrow" onClick={() => setTool("arrow")}>
            <Slash className="size-4" aria-hidden />
          </ToolButton>
          <ToolButton active={tool === "mosaic"} title="Mosaic" onClick={() => setTool("mosaic")}>
            <MousePointer2 className="size-4" aria-hidden />
          </ToolButton>
          <ToolButton
            title="Undo"
            disabled={ops.length === 0}
            onClick={() => setOps(ops.slice(0, -1))}
          >
            <Undo2 className="size-4" aria-hidden />
          </ToolButton>
        </div>
        <div className="flex items-center gap-1">
          <ToolButton title="Copy" onClick={() => void finish("copy")}>
            <Copy className="size-4" aria-hidden />
          </ToolButton>
          <ToolButton title="Save" onClick={() => void finish("save")}>
            <Save className="size-4" aria-hidden />
          </ToolButton>
          <ToolButton title="Pin" onClick={() => void finish("pin")}>
            <Pin className="size-4" aria-hidden />
          </ToolButton>
          <ToolButton title="Cancel" onClick={() => void cancelScreenshotAnnotation()}>
            <X className="size-4" aria-hidden />
          </ToolButton>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
        <canvas
          ref={canvasRef}
          className={cn(
            "max-h-full max-w-full bg-black shadow-2xl ring-1 ring-white/10",
            tool === "mosaic" ? "cursor-cell" : "cursor-crosshair"
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        />
      </div>
    </div>
  )
}

function ToolButton({
  active,
  children,
  disabled,
  onClick,
  title,
}: {
  active?: boolean
  children: ReactNode
  disabled?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-8 text-white hover:bg-white/10 hover:text-white disabled:opacity-40",
        active && "bg-white/15"
      )}
    >
      {children}
      <span className="sr-only">{title}</span>
    </Button>
  )
}

function previewOp(tool: Tool, drag: DragState): AnnotationOp | null {
  if (tool === "arrow") {
    return { type: "arrow", from: drag.from, to: drag.to, color: "#ef4444", width: 3 }
  }
  const x = Math.min(drag.from.x, drag.to.x)
  const y = Math.min(drag.from.y, drag.to.y)
  const width = Math.abs(drag.to.x - drag.from.x)
  const height = Math.abs(drag.to.y - drag.from.y)
  if (width < 4 || height < 4) return null
  return { type: "mosaic", x, y, width, height }
}

function renderCanvas(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement | null,
  ops: AnnotationOp[],
  preview: AnnotationOp | null
): void {
  if (!canvas || !image) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  for (const op of ops) drawOp(ctx, op)
  if (preview) drawOp(ctx, preview, true)
}

function drawOp(ctx: CanvasRenderingContext2D, op: AnnotationOp, preview = false): void {
  if (op.type === "arrow") {
    drawArrow(ctx, op, preview)
  } else {
    drawMosaic(ctx, op)
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  op: Extract<AnnotationOp, { type: "arrow" }>,
  preview: boolean
): void {
  const angle = Math.atan2(op.to.y - op.from.y, op.to.x - op.from.x)
  const head = 16
  ctx.save()
  ctx.globalAlpha = preview ? 0.75 : 1
  ctx.strokeStyle = op.color
  ctx.fillStyle = op.color
  ctx.lineWidth = op.width
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(op.from.x, op.from.y)
  ctx.lineTo(op.to.x, op.to.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(op.to.x, op.to.y)
  ctx.lineTo(
    op.to.x - head * Math.cos(angle - Math.PI / 6),
    op.to.y - head * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    op.to.x - head * Math.cos(angle + Math.PI / 6),
    op.to.y - head * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawMosaic(
  ctx: CanvasRenderingContext2D,
  op: Extract<AnnotationOp, { type: "mosaic" }>
): void {
  const sampleWidth = Math.max(1, Math.round(op.width / 12))
  const sampleHeight = Math.max(1, Math.round(op.height / 12))
  const scratch = document.createElement("canvas")
  scratch.width = sampleWidth
  scratch.height = sampleHeight
  const scratchCtx = scratch.getContext("2d")
  if (!scratchCtx) return
  scratchCtx.drawImage(ctx.canvas, op.x, op.y, op.width, op.height, 0, 0, sampleWidth, sampleHeight)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scratch, 0, 0, sampleWidth, sampleHeight, op.x, op.y, op.width, op.height)
  ctx.restore()
}
