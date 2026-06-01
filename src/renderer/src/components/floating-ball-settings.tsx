import { Check, ChevronsUpDown, CircleDot, Plus, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PluginIcon } from "@/components/plugins/plugin-icon"
import { localize } from "@/components/plugins/view-utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  getSettings,
  isElectron,
  listPlugins,
  onPluginRegistryChanged,
  onSettingsChanged,
  updateSettings,
} from "@/lib/electron"

const MAX_FLOATING_BALL_FEATURES = 6
const APP_LAUNCHER_FEATURE = "appLauncher"

interface FloatingBallOption {
  id: DeskitFloatingBallFeature
  icon?: string
  title: string
  subtitle: string
  kind: "builtin" | "plugin"
}

export function FloatingBallSettings() {
  const { t, i18n } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [features, setFeatures] = useState<DeskitFloatingBallFeature[]>([APP_LAUNCHER_FEATURE])
  const [plugins, setPlugins] = useState<DeskitPluginRegistryEntry[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (!isElectron()) return
    void getSettings().then((settings) => {
      setEnabled(settings.floatingBallEnabled)
      setFeatures(settings.floatingBallFeatures)
    })
    void listPlugins()
      .then(setPlugins)
      .catch((err) => console.error("listPlugins failed", err))
    return mergeCleanups(
      onSettingsChanged((settings) => {
        setEnabled(settings.floatingBallEnabled)
        setFeatures(settings.floatingBallFeatures)
      }),
      onPluginRegistryChanged(setPlugins)
    )
  }, [])

  const options = useMemo(
    () => floatingBallOptions(plugins, i18n.language, t),
    [i18n.language, plugins, t]
  )
  const selectedOptions = features.map(
    (feature) => options.find((option) => option.id === feature) ?? fallbackOption(feature, t)
  )
  const selected = new Set(features)
  const canAddMore = features.length < MAX_FLOATING_BALL_FEATURES

  async function setFloatingBallEnabled(next: boolean) {
    setEnabled(next)
    if (isElectron()) {
      const settings = await updateSettings({ floatingBallEnabled: next })
      setEnabled(settings.floatingBallEnabled)
      setFeatures(settings.floatingBallFeatures)
    }
  }

  async function setFloatingBallFeatures(next: DeskitFloatingBallFeature[]) {
    const normalized = next.slice(0, MAX_FLOATING_BALL_FEATURES)
    setFeatures(normalized)
    if (isElectron()) {
      const settings = await updateSettings({ floatingBallFeatures: normalized })
      setEnabled(settings.floatingBallEnabled)
      setFeatures(settings.floatingBallFeatures)
    }
  }

  function addFeature(feature: DeskitFloatingBallFeature) {
    if (selected.has(feature) || !canAddMore) return
    void setFloatingBallFeatures([...features, feature])
    setPickerOpen(false)
  }

  function removeFeature(feature: DeskitFloatingBallFeature) {
    if (features.length === 1) return
    void setFloatingBallFeatures(features.filter((existing) => existing !== feature))
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDot className="size-4 text-primary" aria-hidden />
          {t("floatingBall.settings.title")}
        </CardTitle>
        <CardDescription>{t("floatingBall.settings.subtitle")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium">{t("floatingBall.settings.enable")}</span>
            <span className="text-xs text-muted-foreground">
              {t("floatingBall.settings.enableHint")}
            </span>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => void setFloatingBallEnabled(checked)}
            aria-label={t("floatingBall.settings.enable")}
          />
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("floatingBall.settings.menuFeatures")}</span>
            <span className="text-xs text-muted-foreground">
              {t("floatingBall.settings.menuFeaturesHint")}
            </span>
          </div>

          <FloatingBallFeaturePicker
            disabled={!enabled || !canAddMore}
            open={pickerOpen}
            options={options}
            selected={selected}
            onAdd={addFeature}
            onOpenChange={setPickerOpen}
          />

          <div className="divide-y rounded-lg border">
            {selectedOptions.map((option) => (
              <div key={option.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <FeatureIcon option={option} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{option.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{option.subtitle}</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={!enabled || features.length === 1}
                  aria-label={t("floatingBall.settings.removeFeature", { name: option.title })}
                  onClick={() => removeFeature(option.id)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FloatingBallFeaturePicker({
  disabled,
  onAdd,
  onOpenChange,
  open,
  options,
  selected,
}: {
  disabled: boolean
  onAdd: (feature: DeskitFloatingBallFeature) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  options: FloatingBallOption[]
  selected: Set<DeskitFloatingBallFeature>
}) {
  const { t } = useTranslation()
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Plus className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("floatingBall.settings.addFeature")}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={t("floatingBall.settings.searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("floatingBall.settings.emptyOptions")}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const active = selected.has(option.id)
                return (
                  <CommandItem
                    key={option.id}
                    value={`${option.title} ${option.subtitle} ${option.id}`}
                    disabled={active}
                    onSelect={() => onAdd(option.id)}
                  >
                    <FeatureIcon option={option} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{option.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {option.subtitle}
                      </div>
                    </div>
                    {active && <Check className="size-4" aria-hidden />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function FeatureIcon({ option }: { option: FloatingBallOption }) {
  if (option.kind === "builtin") {
    return <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  }
  return <PluginIcon icon={option.icon} className="size-4 shrink-0 text-muted-foreground" />
}

function floatingBallOptions(
  plugins: DeskitPluginRegistryEntry[],
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string
): FloatingBallOption[] {
  const builtin: FloatingBallOption[] = [
    {
      id: APP_LAUNCHER_FEATURE,
      title: t("floatingBall.features.appLauncher"),
      subtitle: t("floatingBall.settings.builtinFeature"),
      kind: "builtin",
    },
  ]
  const pluginOptions = plugins.flatMap((plugin) => {
    if (plugin.status !== "active" || !plugin.manifest) return []
    const pluginName =
      localize(plugin.manifest.displayName, locale) || plugin.manifest.name || plugin.pluginId
    return plugin.manifest.contributes.commands.map((command) => ({
      id: pluginFeatureId(plugin.pluginId, command.id),
      icon: command.icon ?? plugin.manifest?.icon,
      title: localize(command.title, locale) || command.id,
      subtitle: `${pluginName} · ${localize(command.subtitle, locale) || command.id}`,
      kind: "plugin" as const,
    }))
  })
  return [...builtin, ...pluginOptions]
}

function fallbackOption(
  feature: DeskitFloatingBallFeature,
  t: (key: string, options?: Record<string, unknown>) => string
): FloatingBallOption {
  if (feature === APP_LAUNCHER_FEATURE) {
    return {
      id: feature,
      icon: undefined,
      title: t("floatingBall.features.appLauncher"),
      subtitle: t("floatingBall.settings.builtinFeature"),
      kind: "builtin",
    }
  }
  const parsed = parsePluginFeatureId(feature)
  return {
    id: feature,
    title: parsed?.commandId ?? feature,
    subtitle: parsed?.pluginId ?? t("floatingBall.settings.unavailableFeature"),
    kind: "plugin",
  }
}

function pluginFeatureId(pluginId: string, commandId: string): DeskitFloatingBallFeature {
  return `plugin:${pluginId}:${commandId}`
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
