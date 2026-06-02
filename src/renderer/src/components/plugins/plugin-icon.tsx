import type { LucideProps } from "lucide-react"
import type { ComponentType } from "react"
import { Puzzle } from "lucide-react"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { pluginIconImageUrl } from "./plugin-icon-url"

type LucideIconComponent = ComponentType<LucideProps>
type LucideIconImporter = () => Promise<{ default: LucideIconComponent }>

export function PluginIcon({
  className,
  fallback: Fallback = Puzzle,
  icon,
  pluginId,
}: {
  className?: string
  fallback?: LucideIconComponent
  icon?: string
  pluginId?: string
}) {
  const [loadedIcon, setLoadedIcon] = useState<{
    icon?: string
    component: LucideIconComponent
  }>()
  const [failedImageUrl, setFailedImageUrl] = useState<string>()
  const imageUrl = pluginIconImageUrl(pluginId, icon)

  useEffect(() => {
    const importer = getLucideIconImporter(icon)
    if (!importer) {
      return
    }

    let cancelled = false
    importer()
      .then((module) => {
        if (!cancelled) setLoadedIcon({ icon, component: module.default })
      })
      .catch(() => {
        if (!cancelled) setLoadedIcon(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [icon])

  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={cn("size-4 object-contain", className)}
        aria-hidden
        draggable={false}
        onError={() => setFailedImageUrl(imageUrl)}
      />
    )
  }

  const IconComponent = loadedIcon && loadedIcon.icon === icon ? loadedIcon.component : Fallback
  return <IconComponent className={cn("size-4", className)} aria-hidden />
}

function getLucideIconImporter(icon?: string): LucideIconImporter | undefined {
  const iconName = lucideIconName(icon)
  if (!iconName) return undefined
  return dynamicIconImports[iconName as keyof typeof dynamicIconImports] as
    | LucideIconImporter
    | undefined
}

function lucideIconName(icon?: string): string | undefined {
  if (!icon) return undefined
  if (icon.startsWith("lucide:")) return icon.slice("lucide:".length).trim() || undefined
  return undefined
}
