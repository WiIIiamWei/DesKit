import { Download, PackageSearch, Search, Store } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  installMarketplacePlugin,
  isElectron,
  listMarketplacePlugins,
  listPlugins,
  onPluginRegistryChanged,
} from "@/lib/electron"
import { cn } from "@/lib/utils"

interface MarketplacePlugin {
  id: string
  name: string
  displayName?: DeskitLocalizedString
  description?: DeskitLocalizedString
  author?: string
  version?: string
  category?: string
  downloads?: number
  icon?: string
  packagePath?: string
}

const ALL_CATEGORY = "all"

export function MarketplacePage() {
  const { t, i18n } = useTranslation()
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const electron = isElectron()

  useEffect(() => {
    if (!electron) return
    void refreshMarketplace()
    return onPluginRegistryChanged((entries) => {
      setInstalledIds(installedPluginIds(entries))
    })
  }, [electron])

  async function refreshMarketplace() {
    const [marketplace, installed] = await Promise.all([listMarketplacePlugins(), listPlugins()])
    setPlugins(normalizeMarketplacePlugins(marketplace))
    setInstalledIds(installedPluginIds(installed))
  }

  async function install(plugin: MarketplacePlugin) {
    setInstallingId(plugin.id)
    setStatus(null)
    try {
      await installMarketplacePlugin(plugin.id, plugin.version)
      await refreshMarketplace()
      setStatus({ kind: "ok", text: t("marketplace.messages.installed") })
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) })
    } finally {
      setInstallingId(null)
    }
  }

  const categories = useMemo(() => {
    const values = [...new Set(plugins.map((plugin) => plugin.category).filter(Boolean))]
    return [ALL_CATEGORY, ...values] as string[]
  }, [plugins])

  const visiblePlugins = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plugins.filter((plugin) => {
      const matchesCategory = category === ALL_CATEGORY || plugin.category === category
      if (!matchesCategory) return false
      if (!q) return true
      return [
        plugin.id,
        plugin.name,
        localized(plugin.displayName, i18n.language),
        localized(plugin.description, i18n.language),
        plugin.author ?? "",
        plugin.category ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [category, i18n.language, plugins, query])

  if (!electron) {
    return (
      <div className="flex flex-col gap-6">
        <MarketplaceHeader />
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Store className="size-4" aria-hidden />
            {t("marketplace.electronRequired")}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketplaceHeader />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("marketplace.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Badge variant="outline">{t("marketplace.mockBadge")}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categories.map((item) => (
            <Button
              key={item}
              type="button"
              variant={category === item ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(item)}
            >
              {item === ALL_CATEGORY
                ? t("marketplace.category.all")
                : t(`marketplace.category.${item}`, { defaultValue: item })}
            </Button>
          ))}
        </div>

        {status && (
          <p
            role="status"
            className={cn(
              "text-sm",
              status.kind === "ok" ? "text-emerald-600" : "text-destructive"
            )}
          >
            {status.text}
          </p>
        )}
      </div>

      {visiblePlugins.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
            <PackageSearch className="size-4" aria-hidden />
            {t("marketplace.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiblePlugins.map((plugin) => {
            const installed = installedIds.has(plugin.id)
            const installing = installingId === plugin.id
            return (
              <Card key={plugin.id} className="overflow-hidden">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
                      <Store className="size-4 text-muted-foreground" aria-hidden />
                    </span>
                    <Badge variant={installed ? "default" : "outline"}>
                      {installed ? t("marketplace.installed") : plugin.version}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {localized(plugin.displayName, i18n.language) || plugin.name}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {localized(plugin.description, i18n.language)}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{plugin.author ?? t("marketplace.unknownAuthor")}</span>
                    <span>·</span>
                    <span>{t("marketplace.downloads", { count: plugin.downloads ?? 0 })}</span>
                    {plugin.category && (
                      <>
                        <span>·</span>
                        <span>
                          {t(`marketplace.category.${plugin.category}`, {
                            defaultValue: plugin.category,
                          })}
                        </span>
                      </>
                    )}
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    disabled={installed || installing}
                    onClick={() => void install(plugin)}
                  >
                    <Download className={cn("size-4", installing && "animate-pulse")} />
                    {installed
                      ? t("marketplace.installed")
                      : installing
                        ? t("marketplace.installing")
                        : t("marketplace.install")}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MarketplaceHeader() {
  const { t } = useTranslation()
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{t("marketplace.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("marketplace.subtitle")}</p>
    </header>
  )
}

function normalizeMarketplacePlugins(value: unknown[]): MarketplacePlugin[] {
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as Record<string, unknown>
    if (typeof item.id !== "string" || typeof item.name !== "string") return []
    return [
      {
        id: item.id,
        name: item.name,
        displayName: localizedValue(item.displayName),
        description: localizedValue(item.description),
        author: typeof item.author === "string" ? item.author : undefined,
        version: typeof item.version === "string" ? item.version : undefined,
        category: typeof item.category === "string" ? item.category : undefined,
        downloads: typeof item.downloads === "number" ? item.downloads : undefined,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        packagePath: typeof item.packagePath === "string" ? item.packagePath : undefined,
      },
    ]
  })
}

function installedPluginIds(entries: DeskitPluginRegistryEntry[]): Set<string> {
  return new Set(entries.map((entry) => entry.manifest?.id ?? entry.pluginId))
}

function localized(value: DeskitLocalizedString | undefined, locale: string): string {
  if (!value) return ""
  if (typeof value === "string") return value
  return (
    value[locale] ??
    value[locale.split("-")[0]] ??
    value.en ??
    value["zh-CN"] ??
    Object.values(value)[0] ??
    ""
  )
}

function localizedValue(value: unknown): DeskitLocalizedString | undefined {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const result: Record<string, string> = {}
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === "string") result[locale] = text
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
