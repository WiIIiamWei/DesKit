import type { ReactNode } from "react"
import { Copy, Save, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  closePinnedImage,
  copyPinnedImage,
  getPinnedImageData,
  savePinnedImage,
  setPinnedImageOpacity,
} from "@/lib/electron"

export function PinnedImagePage() {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    void getPinnedImageData().then(setDataUrl)
  }, [])

  async function onOpacityChange(value: number) {
    setOpacity(value)
    await setPinnedImageOpacity(value)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950/95 px-2 [-webkit-app-region:drag]">
        <div className="min-w-0 flex-1 text-xs font-medium text-white/80">DesKit</div>
        <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <input
            aria-label="Opacity"
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => void onOpacityChange(Number(event.target.value))}
            className="w-24"
          />
          <IconButton title="Copy" onClick={() => void copyPinnedImage()}>
            <Copy className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton title="Save" onClick={() => void savePinnedImage()}>
            <Save className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton title="Close" onClick={() => void closePinnedImage()}>
            <X className="size-3.5" aria-hidden />
          </IconButton>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-hidden">
        {dataUrl && (
          <img
            src={dataUrl}
            alt=""
            draggable={false}
            className="max-h-full max-w-full select-none object-contain"
          />
        )}
      </div>
    </div>
  )
}

function IconButton({
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
      className="size-7 text-white hover:bg-white/10 hover:text-white"
    >
      {children}
      <span className="sr-only">{title}</span>
    </Button>
  )
}
