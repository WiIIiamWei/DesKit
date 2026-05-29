import type { ReactNode } from "react"
import { AlertCircle, FolderPlus, PackagePlus, Plug, RefreshCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  installPluginFolder,
  isElectron,
  listPlugins,
  onPluginRegistryChanged,
  reloadPlugin,
  setPluginEnabled,
  setPluginPreference,
  uninstallPlugin,
} from "@/lib/electron"
import { cn } from "@/lib/utils"

type PluginSourceKind = DeskitPluginSourceKind
type PluginStatus = DeskitPluginRuntimeStatus
type PluginPreference = NonNullable<DeskitPluginManifest["contributes"]["preferences"]>[number]

const SOURCE_ORDER: PluginSourceKind[] = ["builtin", "user", "dev"]
const STATUS_CLASSES: Record<PluginStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  disabled: "border-muted-foreground/25 bg-muted text-muted-foreground",
  invalid: "border-destructive/30 bg-destructive/10 text-destructive",
  crashed: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  shadowed: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
}

export function PluginsPage() {
  const { t, i18n } = useTranslation()
  const [plugins, setPlugins] = useState<DeskitPluginRegistryEntry[]>([])
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null)
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [preferenceValues, setPreferenceValues] = useState<Record<string, unknown>>({})
  const [pendingUninstall, setPendingUninstall] = useState<DeskitPluginRegistryEntry | null>(null)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderPath, setFolderPath] = useState("")
  const electron = isElectron()

  const refresh = useCallback(async () => {
    if (!isElectron()) return
    const next = await listPlugins()
    setPlugins(next)
    setSelectedPluginId((current) => current ?? next[0]?.pluginId ?? null)
  }, [])

  useEffect(() => {
    if (!electron) return
    void refresh()
    return onPluginRegistryChanged((next) => {
      setPlugins(next)
      setSelectedPluginId((current) => {
        if (current && next.some((plugin) => plugin.pluginId === current)) return current
        return next[0]?.pluginId ?? null
      })
    })
  }, [electron, refresh])

  const selected = useMemo(
    () => plugins.find((plugin) => plugin.pluginId === selectedPluginId) ?? plugins[0],
    [plugins, selectedPluginId]
  )
  const sections = useMemo(
    () =>
      SOURCE_ORDER.map((source) => ({
        source,
        plugins: plugins.filter((plugin) => plugin.source.kind === source),
      })),
    [plugins]
  )

  async function togglePlugin(plugin: DeskitPluginRegistryEntry, enabled: boolean) {
    setBusyPluginId(plugin.pluginId)
    setStatus(null)
    try {
      const next = await setPluginEnabled(plugin.pluginId, enabled)
      setPlugins((current) =>
        current.map((item) => (item.pluginId === plugin.pluginId ? next : item))
      )
      setStatus({ kind: "ok", text: t("plugins.messages.updated") })
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) })
    } finally {
      setBusyPluginId(null)
    }
  }

  async function reload(plugin: DeskitPluginRegistryEntry) {
    setBusyPluginId(plugin.pluginId)
    setStatus(null)
    try {
      const next = await reloadPlugin(plugin.pluginId)
      if (next) {
        setPlugins((current) =>
          current.map((item) => (item.pluginId === plugin.pluginId ? next : item))
        )
      } else {
        await refresh()
      }
      setStatus({ kind: "ok", text: t("plugins.messages.reloaded") })
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) })
    } finally {
      setBusyPluginId(null)
    }
  }

  async function uninstall(plugin: DeskitPluginRegistryEntry) {
    setBusyPluginId(plugin.pluginId)
    setStatus(null)
    try {
      await uninstallPlugin(plugin.pluginId)
      await refresh()
      setPendingUninstall(null)
      setStatus({ kind: "ok", text: t("plugins.messages.uninstalled") })
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) })
    } finally {
      setBusyPluginId(null)
    }
  }

  async function installFolder() {
    if (!folderPath.trim()) return

    setStatus(null)
    try {
      const installed = await installPluginFolder(folderPath.trim())
      await refresh()
      setSelectedPluginId(installed.pluginId)
      setFolderPath("")
      setFolderDialogOpen(false)
      setStatus({ kind: "ok", text: t("plugins.messages.installed") })
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) })
    }
  }

  async function updatePreference(
    plugin: DeskitPluginRegistryEntry,
    preference: PluginPreference,
    value: unknown
  ) {
    const key = preferenceKey(plugin.pluginId, preference.id)
    setPreferenceValues((current) => ({ ...current, [key]: value }))
    try {
      await setPluginPreference(plugin.pluginId, preference.id, value)
      setStatus({ kind: "ok", text: t("plugins.messages.preferenceSaved") })
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) })
    }
  }

  if (!electron) {
    return (
      <div className="flex flex-col gap-6">
        <PluginsHeader />
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <AlertCircle className="size-4" aria-hidden />
            {t("plugins.electronRequired")}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PluginsHeader />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{t("plugins.count", { count: plugins.length })}</Badge>
          {status && (
            <span
              role="status"
              className={status.kind === "ok" ? "text-emerald-600" : "text-destructive"}
            >
              {status.text}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFolderDialogOpen(true)}
          >
            <FolderPlus className="size-3.5" aria-hidden />
            {t("plugins.actions.addFolder")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled>
            <PackagePlus className="size-3.5" aria-hidden />
            {t("plugins.actions.installPackage")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" aria-hidden />
            {t("plugins.actions.refresh")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="text-base">{t("plugins.listTitle")}</CardTitle>
            <CardDescription>{t("plugins.listSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {plugins.length === 0 ? (
              <div className="flex min-h-44 items-center justify-center px-6 text-sm text-muted-foreground">
                {t("plugins.empty")}
              </div>
            ) : (
              <div className="divide-y">
                {sections.map((section) => (
                  <PluginSection
                    key={section.source}
                    source={section.source}
                    plugins={section.plugins}
                    selectedPluginId={selected?.pluginId}
                    busyPluginId={busyPluginId}
                    locale={i18n.language}
                    onSelect={setSelectedPluginId}
                    onToggle={togglePlugin}
                    onReload={reload}
                    onUninstall={setPendingUninstall}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <PluginDetail
          plugin={selected}
          busy={selected ? busyPluginId === selected.pluginId : false}
          preferenceValues={preferenceValues}
          locale={i18n.language}
          onPreferenceChange={updatePreference}
        />
      </div>

      <InstallFolderDialog
        open={folderDialogOpen}
        folderPath={folderPath}
        onOpenChange={setFolderDialogOpen}
        onFolderPathChange={setFolderPath}
        onInstall={() => void installFolder()}
      />
      <UninstallConfirmDialog
        plugin={pendingUninstall}
        locale={i18n.language}
        busy={pendingUninstall ? busyPluginId === pendingUninstall.pluginId : false}
        onOpenChange={(open) => {
          if (!open) setPendingUninstall(null)
        }}
        onConfirm={(plugin) => void uninstall(plugin)}
      />
    </div>
  )
}

function PluginsHeader() {
  const { t } = useTranslation()
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{t("plugins.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("plugins.subtitle")}</p>
    </header>
  )
}

function InstallFolderDialog({
  open,
  folderPath,
  onOpenChange,
  onFolderPathChange,
  onInstall,
}: {
  open: boolean
  folderPath: string
  onOpenChange: (open: boolean) => void
  onFolderPathChange: (value: string) => void
  onInstall: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("plugins.installFolder.title")}</DialogTitle>
          <DialogDescription>{t("plugins.installFolder.description")}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{t("plugins.installFolder.pathLabel")}</span>
          <Input
            value={folderPath}
            onChange={(event) => onFolderPathChange(event.target.value)}
            placeholder={t("plugins.installFolder.pathPlaceholder")}
            autoFocus
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("plugins.actions.cancel")}
          </Button>
          <Button type="button" disabled={!folderPath.trim()} onClick={onInstall}>
            {t("plugins.actions.install")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UninstallConfirmDialog({
  plugin,
  locale,
  busy,
  onOpenChange,
  onConfirm,
}: {
  plugin: DeskitPluginRegistryEntry | null
  locale: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (plugin: DeskitPluginRegistryEntry) => void
}) {
  const { t } = useTranslation()
  const label = plugin?.manifest
    ? localized(plugin.manifest.displayName, locale)
    : (plugin?.pluginId ?? "")
  const invalid = plugin?.status === "invalid"
  return (
    <AlertDialog open={Boolean(plugin)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("plugins.confirm.title", { name: label })}</AlertDialogTitle>
          <AlertDialogDescription>
            {invalid ? t("plugins.confirm.uninstallInvalid") : t("plugins.confirm.uninstall")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("plugins.actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!plugin || busy}
            onClick={() => {
              if (plugin) onConfirm(plugin)
            }}
          >
            {t("plugins.actions.uninstall")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PluginSection({
  source,
  plugins,
  selectedPluginId,
  busyPluginId,
  locale,
  onSelect,
  onToggle,
  onReload,
  onUninstall,
}: {
  source: PluginSourceKind
  plugins: DeskitPluginRegistryEntry[]
  selectedPluginId?: string
  busyPluginId: string | null
  locale: string
  onSelect: (pluginId: string) => void
  onToggle: (plugin: DeskitPluginRegistryEntry, enabled: boolean) => void | Promise<void>
  onReload: (plugin: DeskitPluginRegistryEntry) => void | Promise<void>
  onUninstall: (plugin: DeskitPluginRegistryEntry) => void | Promise<void>
}) {
  const { t } = useTranslation()
  if (plugins.length === 0) return null
  return (
    <section className="py-2">
      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="text-xs font-medium uppercase text-muted-foreground">
          {t(`plugins.source.${source}`)}
        </h2>
        <Badge variant="outline">{plugins.length}</Badge>
      </div>
      <div className="flex flex-col">
        {plugins.map((plugin) => {
          const manifest = plugin.manifest
          const selected = selectedPluginId === plugin.pluginId
          const busy = busyPluginId === plugin.pluginId
          const toggleable =
            Boolean(manifest) && plugin.status !== "invalid" && plugin.status !== "shadowed"
          const uninstallable = plugin.source.kind !== "builtin" || plugin.status === "invalid"
          return (
            <div
              key={`${plugin.pluginId}:${plugin.source.kind}:${plugin.rootDir}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(plugin.pluginId)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onSelect(plugin.pluginId)
              }}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors",
                "hover:bg-accent/70 focus-visible:bg-accent focus-visible:outline-none",
                selected && "bg-accent"
              )}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                  <Plug className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {manifest ? localized(manifest.displayName, locale) : plugin.pluginId}
                    </span>
                    {manifest?.version && (
                      <span className="text-xs text-muted-foreground">v{manifest.version}</span>
                    )}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {manifest ? localized(manifest.description, locale) : plugin.error}
                  </span>
                </span>
              </span>

              <span className="flex flex-col items-end gap-2">
                <StatusBadge status={plugin.status} />
                <span className="flex items-center gap-1">
                  <Switch
                    checked={plugin.status === "active"}
                    disabled={!toggleable || busy}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => void onToggle(plugin, checked)}
                    aria-label={t("plugins.actions.enable")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation()
                      void onReload(plugin)
                    }}
                    aria-label={t("plugins.actions.reload")}
                  >
                    <RefreshCw className={cn("size-3", busy && "animate-spin")} aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={!uninstallable || busy}
                    onClick={(event) => {
                      event.stopPropagation()
                      void onUninstall(plugin)
                    }}
                    aria-label={t("plugins.actions.uninstall")}
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </Button>
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PluginDetail({
  plugin,
  busy,
  preferenceValues,
  locale,
  onPreferenceChange,
}: {
  plugin?: DeskitPluginRegistryEntry
  busy: boolean
  preferenceValues: Record<string, unknown>
  locale: string
  onPreferenceChange: (
    plugin: DeskitPluginRegistryEntry,
    preference: PluginPreference,
    value: unknown
  ) => void | Promise<void>
}) {
  const { t } = useTranslation()
  if (!plugin) {
    return (
      <Card>
        <CardContent className="flex min-h-64 items-center justify-center px-6 text-sm text-muted-foreground">
          {t("plugins.detail.empty")}
        </CardContent>
      </Card>
    )
  }

  const manifest = plugin.manifest
  const preferences = manifest?.contributes.preferences ?? []
  const commands = manifest?.contributes.commands ?? []

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {manifest ? localized(manifest.displayName, locale) : plugin.pluginId}
            </CardTitle>
            <CardDescription className="mt-1 break-all">{plugin.pluginId}</CardDescription>
          </div>
          <StatusBadge status={plugin.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-4">
        {manifest?.description && (
          <p className="text-sm text-muted-foreground">{localized(manifest.description, locale)}</p>
        )}

        <div className="grid gap-2 text-sm">
          <MetadataRow label={t("plugins.detail.version")} value={manifest?.version ?? "—"} />
          <MetadataRow label={t("plugins.detail.author")} value={manifest?.author ?? "—"} />
          <MetadataRow
            label={t("plugins.detail.source")}
            value={t(`plugins.source.${plugin.source.kind}`)}
          />
          <MetadataRow label={t("plugins.detail.path")} value={plugin.rootDir} mono />
          {plugin.error && <MetadataRow label={t("plugins.detail.error")} value={plugin.error} />}
        </div>

        <Separator />

        <DetailSection title={t("plugins.detail.commands")}>
          {commands.length === 0 ? (
            <EmptyDetailText>{t("plugins.detail.noCommands")}</EmptyDetailText>
          ) : (
            <div className="flex flex-col gap-2">
              {commands.map((command) => (
                <div
                  key={command.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {localized(command.title, locale)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{command.id}</p>
                  </div>
                  <Badge variant="outline">{command.mode}</Badge>
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title={t("plugins.detail.permissions")}>
          {manifest?.permissions.length ? (
            <div className="flex flex-wrap gap-2">
              {manifest.permissions.map((permission) => (
                <Badge key={permission} variant="secondary">
                  {t(`permissions.${permission}`, { defaultValue: permission })}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyDetailText>{t("plugins.detail.noPermissions")}</EmptyDetailText>
          )}
        </DetailSection>

        <DetailSection title={t("plugins.detail.preferences")}>
          {preferences.length === 0 ? (
            <EmptyDetailText>{t("plugins.detail.noPreferences")}</EmptyDetailText>
          ) : (
            <div className="flex flex-col gap-3">
              {preferences.map((preference) => (
                <PreferenceField
                  key={preference.id}
                  plugin={plugin}
                  preference={preference}
                  value={preferenceValues[preferenceKey(plugin.pluginId, preference.id)]}
                  locale={locale}
                  disabled={busy}
                  onChange={onPreferenceChange}
                />
              ))}
            </div>
          )}
        </DetailSection>
      </CardContent>
    </Card>
  )
}

function PreferenceField({
  plugin,
  preference,
  value,
  locale,
  disabled,
  onChange,
}: {
  plugin: DeskitPluginRegistryEntry
  preference: PluginPreference
  value: unknown
  locale: string
  disabled: boolean
  onChange: (
    plugin: DeskitPluginRegistryEntry,
    preference: PluginPreference,
    value: unknown
  ) => void | Promise<void>
}) {
  const label = localized(preference.label, locale)
  const current = value ?? preference.default
  if (preference.type === "checkbox") {
    return (
      <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm">
        <span>{label}</span>
        <Checkbox
          checked={Boolean(current)}
          disabled={disabled}
          onCheckedChange={(checked) => void onChange(plugin, preference, checked === true)}
        />
      </label>
    )
  }
  if (preference.type === "select") {
    return (
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">{label}</span>
        <NativeSelect
          value={typeof current === "string" ? current : ""}
          disabled={disabled}
          onChange={(event) => void onChange(plugin, preference, event.target.value)}
        >
          {(preference.options ?? []).map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {localized(option.label, locale)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
    )
  }
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        type={preference.type === "number" ? "number" : "text"}
        value={typeof current === "string" || typeof current === "number" ? current : ""}
        disabled={disabled}
        onChange={(event) =>
          void onChange(
            plugin,
            preference,
            preference.type === "number" ? event.target.valueAsNumber : event.target.value
          )
        }
      />
    </label>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function EmptyDetailText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function MetadataRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate", mono && "font-mono text-xs")}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: PluginStatus }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {t(`plugins.status.${status}`)}
    </Badge>
  )
}

function localized(value: DeskitLocalizedString, locale: string): string {
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

function preferenceKey(pluginId: string, preferenceId: string): string {
  return `${pluginId}:${preferenceId}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
