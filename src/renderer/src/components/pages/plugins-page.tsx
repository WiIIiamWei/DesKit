import type { ReactNode } from "react"
import type { PluginRegistryEntry } from "@/lib/electron"
import { AlertCircle, Boxes, Code2, PackageCheck, RefreshCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { localize } from "@/components/plugins/view-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  ElectronIpcError,
  isElectron,
  listPlugins,
  onPluginRegistryChanged,
  reloadPlugin,
  setPluginEnabled,
  setPluginPreference,
  uninstallPlugin,
} from "@/lib/electron"
import { cn } from "@/lib/utils"

type PluginSourceKind = PluginRegistryEntry["source"]["kind"]
type ManifestPreference = NonNullable<
  NonNullable<PluginRegistryEntry["manifest"]>["contributes"]["preferences"]
>[number]

const SOURCE_KINDS = ["builtin", "user", "dev"] satisfies PluginSourceKind[]

export function PluginsPage() {
  const { i18n, t } = useTranslation()
  const electronReady = isElectron()
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([])
  const [loading, setLoading] = useState(electronReady)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!electronReady) return
    setLoading(true)
    setError(null)
    try {
      setPlugins(await listPlugins())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [electronReady])

  useEffect(() => {
    if (!electronReady) return
    void load()
    return onPluginRegistryChanged((nextPlugins) => setPlugins(nextPlugins))
  }, [electronReady, load])

  const groups = useMemo(
    () =>
      SOURCE_KINDS.map((kind) => ({
        kind,
        plugins: plugins.filter((plugin) => plugin.source.kind === kind),
      })),
    [plugins]
  )

  async function onToggle(plugin: PluginRegistryEntry, enabled: boolean) {
    await mutate(`toggle:${plugin.pluginId}`, async () => {
      upsertPlugin(await setPluginEnabled(plugin.pluginId, enabled))
      toast.success(t(enabled ? "plugins.toasts.enabled" : "plugins.toasts.disabled"))
    })
  }

  async function onReload(plugin: PluginRegistryEntry) {
    await mutate(`reload:${plugin.pluginId}`, async () => {
      const reloaded = await reloadPlugin(plugin.pluginId)
      if (reloaded) upsertPlugin(reloaded)
      toast.success(t("plugins.toasts.reloaded"))
    })
  }

  async function onUninstall(plugin: PluginRegistryEntry) {
    await mutate(`uninstall:${plugin.pluginId}`, async () => {
      await uninstallPlugin(plugin.pluginId)
      setPlugins((current) => current.filter((item) => !samePlugin(item, plugin)))
      toast.success(t("plugins.toasts.uninstalled"))
    })
  }

  async function onPreferenceChange(
    plugin: PluginRegistryEntry,
    preference: ManifestPreference,
    value: unknown
  ) {
    await mutate(`preference:${plugin.pluginId}:${preference.id}`, async () => {
      await setPluginPreference(plugin.pluginId, preference.id, value)
      setPlugins((current) =>
        current.map((item) =>
          samePlugin(item, plugin)
            ? {
                ...item,
                preferences: {
                  ...item.preferences,
                  [preference.id]: value,
                },
              }
            : item
        )
      )
      toast.success(t("plugins.toasts.preferenceSaved"))
    })
  }

  async function mutate(key: string, action: () => Promise<void>) {
    setPending(key)
    try {
      await action()
      setError(null)
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setPending(null)
    }
  }

  function upsertPlugin(plugin: PluginRegistryEntry) {
    setPlugins((current) => current.map((item) => (samePlugin(item, plugin) ? plugin : item)))
  }

  if (!electronReady) {
    return (
      <PageFrame title={t("plugins.title")} subtitle={t("plugins.subtitle")}>
        <Alert>
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>{t("plugins.unavailableTitle")}</AlertTitle>
          <AlertDescription>{t("plugins.unavailableBody")}</AlertDescription>
        </Alert>
      </PageFrame>
    )
  }

  return (
    <PageFrame title={t("plugins.title")} subtitle={t("plugins.subtitle")}>
      <div className="grid gap-3 sm:grid-cols-3">
        {SOURCE_KINDS.map((kind) => (
          <PluginCountCard
            key={kind}
            kind={kind}
            count={plugins.filter((plugin) => plugin.source.kind === kind).length}
          />
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>{t("plugins.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("plugins.loading")}</CardTitle>
            <CardDescription>{t("plugins.loadingHint")}</CardDescription>
          </CardHeader>
        </Card>
      ) : plugins.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("plugins.emptyTitle")}</CardTitle>
            <CardDescription>{t("plugins.emptyBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" aria-hidden />
              {t("plugins.actions.refresh")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <PluginSection
              key={group.kind}
              kind={group.kind}
              plugins={group.plugins}
              locale={i18n.language}
              pending={pending}
              onReload={onReload}
              onToggle={onToggle}
              onUninstall={onUninstall}
              onPreferenceChange={onPreferenceChange}
            />
          ))}
        </div>
      )}
    </PageFrame>
  )
}

function PageFrame({
  children,
  subtitle,
  title,
}: {
  children: ReactNode
  subtitle: string
  title: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>
      {children}
    </div>
  )
}

function PluginCountCard({ count, kind }: { count: number; kind: PluginSourceKind }) {
  const { t } = useTranslation()
  const Icon = kind === "builtin" ? PackageCheck : kind === "dev" ? Code2 : Boxes
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-primary" aria-hidden />
            {t(`plugins.source.${kind}`)}
          </span>
          <span className="text-lg tabular-nums">{count}</span>
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function PluginSection({
  kind,
  locale,
  onPreferenceChange,
  onReload,
  onToggle,
  onUninstall,
  pending,
  plugins,
}: {
  kind: PluginSourceKind
  locale: string
  onPreferenceChange: (
    plugin: PluginRegistryEntry,
    preference: ManifestPreference,
    value: unknown
  ) => Promise<void>
  onReload: (plugin: PluginRegistryEntry) => Promise<void>
  onToggle: (plugin: PluginRegistryEntry, enabled: boolean) => Promise<void>
  onUninstall: (plugin: PluginRegistryEntry) => Promise<void>
  pending: string | null
  plugins: PluginRegistryEntry[]
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t(`plugins.sections.${kind}.title`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`plugins.sections.${kind}.body`)}</p>
        </div>
        <Badge variant="secondary">{plugins.length}</Badge>
      </div>

      {plugins.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>{t("plugins.sectionEmpty")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {plugins.map((plugin) => (
            <PluginCard
              key={`${plugin.pluginId}:${plugin.source.kind}:${plugin.rootDir}`}
              locale={locale}
              pending={pending}
              plugin={plugin}
              onPreferenceChange={onPreferenceChange}
              onReload={onReload}
              onToggle={onToggle}
              onUninstall={onUninstall}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PluginCard({
  locale,
  onPreferenceChange,
  onReload,
  onToggle,
  onUninstall,
  pending,
  plugin,
}: {
  locale: string
  onPreferenceChange: (
    plugin: PluginRegistryEntry,
    preference: ManifestPreference,
    value: unknown
  ) => Promise<void>
  onReload: (plugin: PluginRegistryEntry) => Promise<void>
  onToggle: (plugin: PluginRegistryEntry, enabled: boolean) => Promise<void>
  onUninstall: (plugin: PluginRegistryEntry) => Promise<void>
  pending: string | null
  plugin: PluginRegistryEntry
}) {
  const { t } = useTranslation()
  const manifest = plugin.manifest
  const title = localize(manifest?.displayName, locale) || manifest?.name || plugin.pluginId
  const description = localize(manifest?.description, locale) || plugin.error || plugin.rootDir
  const togglePending = pending === `toggle:${plugin.pluginId}`
  const reloadPending = pending === `reload:${plugin.pluginId}`
  const uninstallPending = pending === `uninstall:${plugin.pluginId}`
  const canToggle = plugin.status === "active" || plugin.status === "disabled"
  const canUninstall = plugin.source.kind !== "builtin"

  return (
    <Card className={cn("gap-4", plugin.status === "invalid" && "border-destructive/50")}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span className="truncate">{title}</span>
              <StatusBadge status={plugin.status} />
              <Badge variant="outline">{plugin.pluginId}</Badge>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <CardAction className="static col-auto row-auto justify-self-auto">
            <div className="flex items-center gap-2">
              <Label htmlFor={`plugin-enabled-${plugin.pluginId}`} className="text-xs">
                {t(
                  plugin.status === "disabled"
                    ? "plugins.actions.enable"
                    : "plugins.actions.disable"
                )}
              </Label>
              <Switch
                id={`plugin-enabled-${plugin.pluginId}`}
                size="sm"
                checked={plugin.status === "active"}
                disabled={!canToggle || togglePending}
                onCheckedChange={(checked) => void onToggle(plugin, checked)}
              />
            </div>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <span>
            {t("plugins.meta.version")}: {manifest?.version ?? "—"}
          </span>
          <span>
            {t("plugins.meta.author")}: {manifest?.author ?? "—"}
          </span>
          <span>
            {t("plugins.meta.commands")}: {manifest?.contributes.commands.length ?? 0}
          </span>
          <span className="truncate" title={plugin.rootDir}>
            {t("plugins.meta.path")}: {plugin.rootDir}
          </span>
        </div>

        {plugin.error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden />
            <AlertTitle>{t("plugins.pluginErrorTitle")}</AlertTitle>
            <AlertDescription>{plugin.error}</AlertDescription>
          </Alert>
        )}

        {manifest?.contributes.preferences?.length ? (
          <>
            <Separator />
            <PluginPreferences
              locale={locale}
              pending={pending}
              plugin={plugin}
              preferences={manifest.contributes.preferences}
              onPreferenceChange={onPreferenceChange}
            />
          </>
        ) : null}

        <Separator />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={reloadPending}
            onClick={() => void onReload(plugin)}
          >
            <RefreshCw className={cn("size-4", reloadPending && "animate-spin")} aria-hidden />
            {t("plugins.actions.reload")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canUninstall || uninstallPending}
            onClick={() => void onUninstall(plugin)}
          >
            <Trash2 className="size-4" aria-hidden />
            {t("plugins.actions.uninstall")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PluginPreferences({
  locale,
  onPreferenceChange,
  pending,
  plugin,
  preferences,
}: {
  locale: string
  onPreferenceChange: (
    plugin: PluginRegistryEntry,
    preference: ManifestPreference,
    value: unknown
  ) => Promise<void>
  pending: string | null
  plugin: PluginRegistryEntry
  preferences: ManifestPreference[]
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">{t("plugins.preferences.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("plugins.preferences.body")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {preferences.map((preference) => (
          <PreferenceControl
            key={preference.id}
            locale={locale}
            pending={pending === `preference:${plugin.pluginId}:${preference.id}`}
            plugin={plugin}
            preference={preference}
            onPreferenceChange={onPreferenceChange}
          />
        ))}
      </div>
    </div>
  )
}

function PreferenceControl({
  locale,
  onPreferenceChange,
  pending,
  plugin,
  preference,
}: {
  locale: string
  onPreferenceChange: (
    plugin: PluginRegistryEntry,
    preference: ManifestPreference,
    value: unknown
  ) => Promise<void>
  pending: boolean
  plugin: PluginRegistryEntry
  preference: ManifestPreference
}) {
  const { t } = useTranslation()
  const id = `plugin-preference-${plugin.pluginId}-${preference.id}`
  const value =
    plugin.preferences && preference.id in plugin.preferences
      ? plugin.preferences[preference.id]
      : preference.default
  const label = localize(preference.label, locale) || preference.id

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <Label htmlFor={id}>{label}</Label>
      {preference.type === "checkbox" ? (
        <Switch
          id={id}
          checked={Boolean(value)}
          disabled={pending}
          onCheckedChange={(checked) => void onPreferenceChange(plugin, preference, checked)}
        />
      ) : preference.type === "select" ? (
        <Select
          value={typeof value === "string" ? value : (preference.options?.[0]?.value ?? "")}
          disabled={pending || !preference.options?.length}
          onValueChange={(nextValue) => void onPreferenceChange(plugin, preference, nextValue)}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {preference.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {localize(option.label, locale) || option.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : preference.type === "number" ? (
        <Input
          id={id}
          key={`${plugin.pluginId}:${preference.id}:${String(value)}`}
          type="number"
          disabled={pending}
          defaultValue={typeof value === "number" ? String(value) : ""}
          onBlur={(event) => {
            const raw = event.currentTarget.value.trim()
            if (!raw) return
            const nextValue = Number(raw)
            if (!Number.isFinite(nextValue)) {
              toast.error(t("plugins.preferences.invalidNumber"))
              event.currentTarget.value = typeof value === "number" ? String(value) : ""
              return
            }
            if (nextValue !== value) void onPreferenceChange(plugin, preference, nextValue)
          }}
        />
      ) : (
        <Input
          id={id}
          key={`${plugin.pluginId}:${preference.id}:${String(value)}`}
          disabled={pending}
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(event) => {
            const nextValue = event.currentTarget.value
            if (nextValue !== value) void onPreferenceChange(plugin, preference, nextValue)
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: PluginRegistryEntry["status"] }) {
  const { t } = useTranslation()
  const variant =
    status === "active"
      ? "default"
      : status === "disabled"
        ? "secondary"
        : status === "shadowed"
          ? "outline"
          : "destructive"

  return <Badge variant={variant}>{t(`plugins.status.${status}`)}</Badge>
}

function samePlugin(left: PluginRegistryEntry, right: PluginRegistryEntry): boolean {
  return (
    left.pluginId === right.pluginId &&
    left.rootDir === right.rootDir &&
    left.source.kind === right.source.kind
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof ElectronIpcError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
