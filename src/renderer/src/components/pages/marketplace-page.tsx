import type { LucideProps } from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import type { MarketplaceEntry, PluginRegistryEntry } from "@/lib/electron"
import {
  AlertCircle,
  ArrowLeft,
  Download,
  ExternalLink,
  PackageSearch,
  RefreshCw,
  Send,
  Store,
} from "lucide-react"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { localize } from "@/components/plugins/view-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ElectronIpcError,
  installMarketplacePlugin,
  isElectron,
  listMarketplacePlugins,
  listPlugins,
  onPluginRegistryChanged,
  openExternalUrl,
} from "@/lib/electron"
import { cn } from "@/lib/utils"

const ALL_CATEGORY = "all"

export function MarketplacePage() {
  const { i18n, t } = useTranslation()
  const electronReady = isElectron()
  const [marketplace, setMarketplace] = useState<MarketplaceEntry[]>([])
  const [installed, setInstalled] = useState<Map<string, PluginRegistryEntry>>(() => new Map())
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [loading, setLoading] = useState(electronReady)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!electronReady) return
    setLoading(true)
    setError(null)
    try {
      const [entries, plugins] = await Promise.all([listMarketplacePlugins(), listPlugins()])
      setMarketplace(entries)
      setInstalled(installedPluginMap(plugins))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [electronReady])

  useEffect(() => {
    if (!electronReady) return
    void load()
    return onPluginRegistryChanged((plugins) => setInstalled(installedPluginMap(plugins)))
  }, [electronReady, load])

  const categories = useMemo(() => {
    const values = [...new Set(marketplace.flatMap((entry) => entry.categories ?? []))].sort(
      (left, right) => left.localeCompare(right)
    )
    return [ALL_CATEGORY, ...values]
  }, [marketplace])

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return marketplace.filter((entry) => {
      const matchesCategory = category === ALL_CATEGORY || entry.categories?.includes(category)
      if (!matchesCategory) return false
      if (!q) return true
      return [
        entry.id,
        entry.name,
        localize(entry.displayName, i18n.language),
        localize(entry.description, i18n.language),
        entry.author,
        entry.homepage,
        ...(entry.categories ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [category, i18n.language, marketplace, query])

  const selectedEntry = useMemo(() => {
    if (!selectedEntryKey) return null
    return marketplace.find((entry) => marketplaceEntryKey(entry) === selectedEntryKey) ?? null
  }, [marketplace, selectedEntryKey])

  async function install(entry: MarketplaceEntry) {
    setInstallingId(entry.id)
    setError(null)
    try {
      const plugin = await installMarketplacePlugin(entry.id, entry.version)
      setInstalled((current) => new Map(current).set(plugin.pluginId, plugin))
      toast.success(t("marketplace.toasts.installed"))
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setInstallingId(null)
    }
  }

  if (!electronReady) {
    return (
      <MarketplaceFrame>
        <Alert>
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>{t("marketplace.unavailableTitle")}</AlertTitle>
          <AlertDescription>{t("marketplace.unavailableBody")}</AlertDescription>
        </Alert>
      </MarketplaceFrame>
    )
  }

  return (
    <MarketplaceFrame
      action={
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          {t("marketplace.actions.refresh")}
        </Button>
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>{t("marketplace.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selectedEntry ? (
        <MarketplaceDetails
          entry={selectedEntry}
          installed={installed.get(selectedEntry.id)}
          installing={installingId === selectedEntry.id}
          locale={i18n.language}
          onBack={() => setSelectedEntryKey(null)}
          onInstall={install}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-64 flex-1">
                <PackageSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={t("marketplace.searchPlaceholder")}
                  className="pl-9"
                />
              </div>
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
          </div>

          {loading ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("marketplace.loading")}</CardTitle>
                <CardDescription>{t("marketplace.loadingHint")}</CardDescription>
              </CardHeader>
            </Card>
          ) : visibleEntries.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
                <PackageSearch className="size-4" aria-hidden />
                {t("marketplace.empty")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleEntries.map((entry) => (
                <MarketplaceCard
                  key={`${entry.id}:${entry.version}`}
                  entry={entry}
                  installed={installed.get(entry.id)}
                  installing={installingId === entry.id}
                  locale={i18n.language}
                  onInstall={install}
                  onSelect={(entry) => setSelectedEntryKey(marketplaceEntryKey(entry))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </MarketplaceFrame>
  )
}

function MarketplaceFrame({ action, children }: { action?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("marketplace.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("marketplace.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          <SubmitPluginButton />
        </div>
      </header>
      {children}
    </div>
  )
}

function SubmitPluginButton() {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button disabled>
            <Send className="size-4" aria-hidden />
            {t("marketplace.submit")}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("marketplace.submitTooltip")}</TooltipContent>
    </Tooltip>
  )
}

function MarketplaceCard({
  entry,
  installed,
  installing,
  locale,
  onInstall,
  onSelect,
}: {
  entry: MarketplaceEntry
  installed?: PluginRegistryEntry
  installing: boolean
  locale: string
  onInstall: (entry: MarketplaceEntry) => Promise<void>
  onSelect: (entry: MarketplaceEntry) => void
}) {
  const { t } = useTranslation()
  const installState = getInstallState(installed)
  const installable = canInstall(installed)
  const title = localize(entry.displayName, locale) || entry.name
  const description = localize(entry.description, locale)

  return (
    <Card
      role="button"
      tabIndex={0}
      className="h-64 cursor-pointer overflow-hidden transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={() => onSelect(entry)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        onSelect(entry)
      }}
    >
      <CardHeader className="gap-3 pb-0">
        <div className="flex items-start justify-between gap-3">
          <MarketplaceIcon
            icon={entry.icon}
            className="size-10 rounded-md"
            iconClassName="size-4"
          />
          <Badge variant={installed ? "default" : "outline"}>
            {installed ? t(`marketplace.installState.${installState}`) : `v${entry.version}`}
          </Badge>
        </div>
        <div className="min-w-0">
          <CardTitle className="h-5 truncate text-base leading-5">{title}</CardTitle>
          <CardDescription className="mt-1 line-clamp-2 min-h-10 leading-5">
            {description}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-w-0 truncate text-xs text-muted-foreground">
          v{entry.version} · {entry.author}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="mt-auto block"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Button
                type="button"
                className="w-full"
                disabled={!installable || installing}
                onClick={() => void onInstall(entry)}
              >
                <Download className={cn("size-4", installing && "animate-pulse")} />
                {installing
                  ? t("marketplace.actions.installing")
                  : t(`marketplace.actions.${installState}`)}
              </Button>
            </span>
          </TooltipTrigger>
          {!installable && installed && (
            <TooltipContent>
              {t("marketplace.protectedSource", {
                source: t(`plugins.source.${installed.source.kind}`),
              })}
            </TooltipContent>
          )}
        </Tooltip>
      </CardContent>
    </Card>
  )
}

function MarketplaceDetails({
  entry,
  installed,
  installing,
  locale,
  onBack,
  onInstall,
}: {
  entry: MarketplaceEntry
  installed?: PluginRegistryEntry
  installing: boolean
  locale: string
  onBack: () => void
  onInstall: (entry: MarketplaceEntry) => Promise<void>
}) {
  const { t } = useTranslation()
  const installState = getInstallState(installed)
  const installable = canInstall(installed)
  const title = localize(entry.displayName, locale) || entry.name
  const description = localize(entry.description, locale)

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="ghost" className="w-fit gap-2 px-2" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {t("marketplace.details.back")}
      </Button>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <MarketplaceIcon
                icon={entry.icon}
                className="size-12 rounded-lg"
                iconClassName="size-5"
              />
              <div className="min-w-0">
                <CardTitle className="text-xl leading-tight">{title}</CardTitle>
                <CardDescription className="mt-2">{description}</CardDescription>
              </div>
            </div>
            <Badge variant={installed ? "default" : "outline"} className="w-fit shrink-0">
              {installed ? t(`marketplace.installState.${installState}`) : `v${entry.version}`}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <MarketplaceDetailItem label={t("marketplace.details.version")} value={entry.version} />
            <MarketplaceDetailItem label={t("marketplace.details.author")} value={entry.author} />
            <MarketplaceDetailItem
              label={t("marketplace.details.engine")}
              value={entry.deskitEngine}
            />
            <MarketplaceDetailItem
              label={t("marketplace.details.homepage")}
              value={entry.homepage}
            />
          </dl>

          {entry.categories && entry.categories.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">{t("marketplace.details.categories")}</h2>
              <div className="flex flex-wrap gap-2">
                {entry.categories.map((category) => (
                  <Badge key={category} variant="secondary" className="font-normal">
                    {t(`marketplace.category.${category}`, { defaultValue: category })}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    disabled={!installable || installing}
                    onClick={() => void onInstall(entry)}
                  >
                    <Download className={cn("size-4", installing && "animate-pulse")} />
                    {installing
                      ? t("marketplace.actions.installing")
                      : t(`marketplace.actions.${installState}`)}
                  </Button>
                </span>
              </TooltipTrigger>
              {!installable && installed && (
                <TooltipContent>
                  {t("marketplace.protectedSource", {
                    source: t(`plugins.source.${installed.source.kind}`),
                  })}
                </TooltipContent>
              )}
            </Tooltip>

            <Button
              type="button"
              variant="outline"
              onClick={() => void openExternalUrl(entry.homepage)}
            >
              <ExternalLink className="size-4" aria-hidden />
              {t("marketplace.details.openHomepage")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MarketplaceIcon({
  icon,
  className,
  iconClassName,
}: {
  icon?: string
  className?: string
  iconClassName?: string
}) {
  const [loadedIcon, setLoadedIcon] = useState<{
    icon?: string
    component: LucideIconComponent
  }>()

  useEffect(() => {
    let cancelled = false
    const importer = getLucideIconImporter(icon)

    if (!importer) return undefined

    void importer()
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

  const IconComponent = loadedIcon && loadedIcon.icon === icon ? loadedIcon.component : Store

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border bg-muted text-muted-foreground",
        className
      )}
    >
      <IconComponent className={iconClassName} aria-hidden />
    </span>
  )
}

function MarketplaceDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function marketplaceEntryKey(entry: MarketplaceEntry): string {
  return `${entry.id}:${entry.version}`
}

type LucideIconComponent = ComponentType<LucideProps>
type LucideIconImporter = () => Promise<{ default: LucideIconComponent }>

function getLucideIconImporter(icon?: string): LucideIconImporter | undefined {
  if (!icon?.startsWith("lucide:")) return undefined
  const iconName = icon.slice("lucide:".length).trim()
  if (!iconName) return undefined
  return dynamicIconImports[iconName as keyof typeof dynamicIconImports] as
    | LucideIconImporter
    | undefined
}

function installedPluginMap(entries: PluginRegistryEntry[]): Map<string, PluginRegistryEntry> {
  return new Map(entries.map((entry) => [entry.manifest?.id ?? entry.pluginId, entry]))
}

function getInstallState(installed?: PluginRegistryEntry): "install" | "reinstall" | "installed" {
  if (!installed) return "install"
  return installed.source.kind === "user" ? "reinstall" : "installed"
}

function canInstall(installed?: PluginRegistryEntry): boolean {
  if (!installed) return true
  return installed.source.kind === "user"
}

function errorMessage(err: unknown): string {
  if (err instanceof ElectronIpcError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
