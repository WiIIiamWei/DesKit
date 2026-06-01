import type { LucideProps } from "lucide-react"
import type { ComponentType } from "react"
import { Puzzle } from "lucide-react"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type LucideIconComponent = ComponentType<LucideProps>
type LucideIconImporter = () => Promise<{ default: LucideIconComponent }>

export function PluginIcon({
  className,
  fallback: Fallback = Puzzle,
  icon,
}: {
  className?: string
  fallback?: LucideIconComponent
  icon?: string
}) {
  const [loadedIcon, setLoadedIcon] = useState<{
    icon?: string
    component: LucideIconComponent
  }>()

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
  if (icon.includes("/") || icon.includes("\\") || icon.includes(".")) return undefined
  return icon.trim() || undefined
}
