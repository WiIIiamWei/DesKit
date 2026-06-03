import type { PointerEvent } from "react"
import { Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import logoUrl from "@/assets/logo.svg"
import { PluginIcon } from "@/components/plugins/plugin-icon"
import { localize } from "@/components/plugins/view-utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getSettings,
  listPlugins,
  moveFloatingBallBy,
  onFloatingBallFeatures,
  onFloatingBallMenuState,
  onPluginRegistryChanged,
  onSettingsChanged,
  openFloatingBallFeature,
  toggleFloatingBallMenu,
} from "@/lib/electron"
import { cn } from "@/lib/utils"

const APP_LAUNCHER_FEATURE = "appLauncher"
const MENU_SLOT_ANGLES = [30, 90, 150, 210, 270, 330] as const
const DRAG_THRESHOLD = 4

interface FloatingBallMenuItem {
  id: DeskitFloatingBallFeature
  icon?: string
  pluginId?: string
  title: string
  kind: "builtin" | "plugin"
}

export function FloatingBallPanel() {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [features, setFeatures] = useState<DeskitFloatingBallFeature[]>([APP_LAUNCHER_FEATURE])
  const [plugins, setPlugins] = useState<DeskitPluginRegistryEntry[]>([])
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  useEffect(() => {
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

  useEffect(() => {
    void getSettings().then((settings) => setFeatures(settings.floatingBallFeatures))
    void listPlugins()
      .then(setPlugins)
      .catch((err) => console.error("listPlugins failed", err))
    return mergeCleanups(
      onFloatingBallMenuState(setExpanded),
      onFloatingBallFeatures(setFeatures),
      onPluginRegistryChanged(setPlugins),
      onSettingsChanged((settings) => setFeatures(settings.floatingBallFeatures))
    )
  }, [])

  const menuItems = useMemo(
    () =>
      features
        .slice(0, 6)
        .map((feature) => menuItem(feature, plugins, i18n.language, t))
        .map((item, index, items) => ({
          item,
          position: menuItemPosition(index, items.length),
        })),
    [features, i18n.language, plugins, t]
  )

  async function onFeatureClick(feature: DeskitFloatingBallFeature) {
    await openFloatingBallFeature(feature)
    setExpanded(false)
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = {
      x: event.screenX - drag.lastX,
      y: event.screenY - drag.lastY,
    }
    if (delta.x === 0 && delta.y === 0) return
    drag.moved =
      drag.moved ||
      Math.abs(event.screenX - drag.startX) >= DRAG_THRESHOLD ||
      Math.abs(event.screenY - drag.startY) >= DRAG_THRESHOLD
    drag.lastX = event.screenX
    drag.lastY = event.screenY
    void moveFloatingBallBy(delta)
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    suppressNextClickRef.current = drag.moved
    dragRef.current = null
  }

  function onBallClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    void toggleFloatingBallMenu()
  }

  return (
    <div
      className="relative h-screen w-screen select-none overflow-hidden bg-transparent"
      onDragStart={(event) => event.preventDefault()}
    >
      <div
        className={cn(
          "absolute left-1/2 top-1/2 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/95 shadow-[0_6px_16px_-10px_rgba(15,23,42,0.14)] ring-1 ring-black/5 transition-[opacity,transform] duration-150 dark:bg-popover/95 dark:ring-white/10",
          expanded ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!expanded}
      >
        {menuItems.map(({ item, position }) => {
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void onFeatureClick(item.id)}
                  className="absolute left-1/2 top-1/2 grid size-12 place-items-center rounded-full border border-border bg-popover text-popover-foreground shadow-lg transition hover:scale-110 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -50%)`,
                  }}
                >
                  <FeatureIcon item={item} />
                  <span className="sr-only">{item.title}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{item.title}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onBallClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={t("floatingBall.title")}
        className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 cursor-move place-items-center rounded-full border border-border bg-white shadow-xl transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-popover"
      >
        <img src={logoUrl} alt="" draggable={false} className="size-8" aria-hidden />
        <span className="sr-only">{t("floatingBall.title")}</span>
      </button>
    </div>
  )
}

function FeatureIcon({ item }: { item: FloatingBallMenuItem }) {
  if (item.kind === "plugin") {
    return <PluginIcon pluginId={item.pluginId} icon={item.icon} className="size-5" />
  }
  return <Search className="size-5" aria-hidden />
}

function menuItem(
  feature: DeskitFloatingBallFeature,
  plugins: DeskitPluginRegistryEntry[],
  locale: string,
  t: (key: string) => string
): FloatingBallMenuItem {
  if (feature === APP_LAUNCHER_FEATURE) {
    return { id: feature, title: t("floatingBall.features.appLauncher"), kind: "builtin" }
  }
  const parsed = parsePluginFeatureId(feature)
  if (!parsed) return { id: feature, title: feature, kind: "plugin" }

  const plugin = plugins.find((entry) => entry.pluginId === parsed.pluginId)
  const command = plugin?.manifest?.contributes.commands.find(
    (item) => item.id === parsed.commandId
  )
  return {
    id: feature,
    icon: command?.icon ?? plugin?.manifest?.icon,
    pluginId: plugin?.pluginId,
    title: command ? localize(command.title, locale) || parsed.commandId : parsed.commandId,
    kind: "plugin",
  }
}

function menuItemPosition(index: number, count: number): { x: number; y: number } {
  const radius = 78
  const angle =
    count === MENU_SLOT_ANGLES.length
      ? MENU_SLOT_ANGLES[index]
      : -90 + (360 / Math.max(count, 1)) * index
  return {
    x: Math.cos((angle * Math.PI) / 180) * radius,
    y: Math.sin((angle * Math.PI) / 180) * radius,
  }
}

function parsePluginFeatureId(
  feature: DeskitFloatingBallFeature
): { pluginId: string; commandId: string } | null {
  if (!feature.startsWith("plugin:")) return null
  const [, pluginId, commandId] = feature.split(":")
  if (!pluginId || !commandId) return null
  return { pluginId, commandId }
}

function mergeCleanups(...cleanups: Array<() => void>): () => void {
  return () => cleanups.forEach((cleanup) => cleanup())
}
