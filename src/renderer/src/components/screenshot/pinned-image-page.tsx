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
    const previousBodyBackground = document.body.style.background
    const previousHtmlBackground = document.documentElement.style.background
    document.body.style.background = "transparent"
    document.documentElement.style.background = "transparent"
    void getPinnedImageData().then(setDataUrl)
    return () => {
      document.body.style.background = previousBodyBackground
      document.documentElement.style.background = previousHtmlBackground
    }
  }, [])

  async function onOpacityChange(value: number) {
    setOpacity(value)
    await setPinnedImageOpacity(value)
  }

  return (
    <div className="group relative h-screen w-screen overflow-hidden bg-transparent [-webkit-app-region:drag]">
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex translate-y-[-2px] items-center gap-1 rounded-md border border-white/15 bg-zinc-950/80 px-1.5 py-1 opacity-0 shadow-xl backdrop-blur transition duration-150 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 [-webkit-app-region:no-drag]">
        <div className="pointer-events-auto flex items-center gap-1">
          <input
            aria-label="Opacity"
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => void onOpacityChange(Number(event.target.value))}
            className="h-6 w-20 accent-white"
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
      {dataUrl && (
        <img
          src={dataUrl}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-contain"
        />
      )}
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
      className="pointer-events-auto size-7 text-white hover:bg-white/10 hover:text-white"
    >
      {children}
      <span className="sr-only">{title}</span>
    </Button>
  )
}
