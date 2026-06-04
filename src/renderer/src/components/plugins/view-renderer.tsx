import type { LucideProps } from "lucide-react"
import type { ComponentType, KeyboardEvent } from "react"
import type {
  LocalizedString,
  PluginAction,
  PluginActionContext,
  PluginDetailView,
  PluginFormField,
  PluginFormView,
  PluginListItem,
  PluginListView,
  RenderablePluginView,
} from "@/components/plugins/view-types"
import { Check, Clipboard, Copy, ExternalLink, File, Hash, Play, Send, Star, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { PluginIcon } from "@/components/plugins/plugin-icon"
import { localize } from "@/components/plugins/view-utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type LucideIconComponent = ComponentType<LucideProps>

interface ViewRendererProps {
  view: RenderablePluginView
  onAction: (action: PluginAction, context: PluginActionContext) => void | Promise<void>
  onSearchChange?: (text: string) => void
  onClose?: () => void
  className?: string
}

export function ViewRenderer({
  view,
  onAction,
  onSearchChange,
  onClose,
  className,
}: ViewRendererProps) {
  const { i18n } = useTranslation()
  const locale = i18n.language

  if (view.type === "toast") {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center p-6 text-sm text-muted-foreground",
          className
        )}
      >
        {localize(view.message, locale)}
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-popover", className)}>
      <div className="flex min-h-11 items-center justify-between border-b px-3">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {view.type === "list" ? "List" : view.type === "detail" ? "Detail" : "Form"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close plugin view"
        >
          <X className="size-4" />
        </Button>
      </div>
      {view.type === "list" ? (
        <ListPluginView
          view={view}
          locale={locale}
          onAction={onAction}
          onSearchChange={onSearchChange}
        />
      ) : view.type === "detail" ? (
        <DetailPluginView view={view} locale={locale} onAction={onAction} />
      ) : (
        <FormPluginView
          key={view.fields.map((f) => f.id).join(",")}
          view={view}
          locale={locale}
          onAction={onAction}
        />
      )}
    </div>
  )
}

function ListPluginView({
  view,
  locale,
  onAction,
  onSearchChange,
}: {
  view: PluginListView
  locale: string
  onAction: ViewRendererProps["onAction"]
  onSearchChange?: (text: string) => void
}) {
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sections = useMemo(() => {
    if (view.sections?.length) return view.sections
    return [{ items: view.items ?? [] }]
  }, [view.items, view.sections])
  const count = sections.reduce((sum, section) => sum + section.items.length, 0)
  const selectableItems = useMemo(
    () => sections.flatMap((section) => section.items).filter((item) => item.actions?.[0]),
    [sections]
  )
  const [selectedId, setSelectedId] = useState<string | null>(() => selectableItems[0]?.id ?? null)
  const effectiveSelectedId = selectableItems.some((item) => item.id === selectedId)
    ? selectedId
    : (selectableItems[0]?.id ?? null)

  useEffect(() => {
    if (onSearchChange) searchInputRef.current?.focus()
    else rootRef.current?.focus()
  }, [onSearchChange])

  function moveSelection(delta: number) {
    if (selectableItems.length === 0) return
    const currentIndex = effectiveSelectedId
      ? selectableItems.findIndex((item) => item.id === effectiveSelectedId)
      : -1
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + delta + selectableItems.length) % selectableItems.length
    setSelectedId(selectableItems[nextIndex]?.id ?? null)
  }

  function runSelectedAction() {
    const selectedItem =
      selectableItems.find((item) => item.id === effectiveSelectedId) ?? selectableItems[0]
    const primary = selectedItem?.actions?.[0]
    if (selectedItem && primary) onAction(primary, { item: selectedItem })
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveSelection(1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      moveSelection(-1)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      runSelectedAction()
    }
  }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col outline-none"
      onKeyDown={onListKeyDown}
    >
      {onSearchChange && (
        <div className="border-b p-2">
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => {
              const next = event.target.value
              setQuery(next)
              onSearchChange(next)
            }}
            placeholder={localize(view.searchPlaceholder, locale) || "Search in command..."}
            className="h-8 border-0 bg-muted/70 shadow-none focus-visible:ring-1"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {count === 0 && (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            {localize(view.emptyText, locale) || "No items"}
          </div>
        )}
        {sections.map((section) => (
          <div key={sectionKey(section, locale)} className="py-1">
            {section.title && (
              <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                {localize(section.title, locale)}
              </div>
            )}
            {section.items.map((item) => {
              const primary = item.actions?.[0]
              const selected = item.id === effectiveSelectedId
              const statusActions = activeIconActions(item.actions)
              const showAccessoryIcon =
                item.accessoryIcon &&
                !statusActions.some((action) => action.icon === item.accessoryIcon) &&
                !(selected && item.accessoryIcon === "lucide:check")
              const actionBarActions = item.actions?.filter(
                (action) => !statusActions.includes(action)
              )
              return (
                <div
                  key={item.id}
                  role="button"
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => primary && onAction(primary, { item })}
                  onMouseMove={() => {
                    if (primary) setSelectedId(item.id)
                  }}
                  onKeyDown={(event) => {
                    if (!primary || (event.key !== "Enter" && event.key !== " ")) return
                    event.preventDefault()
                    event.stopPropagation()
                    onAction(primary, { item })
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                    selected && "bg-accent"
                  )}
                >
                  <PluginItemIcon icon={item.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {localize(item.title, locale)}
                    </span>
                    {item.subtitle && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {localize(item.subtitle, locale)}
                      </span>
                    )}
                  </span>
                  {(item.accessory ||
                    showAccessoryIcon ||
                    statusActions.length > 0 ||
                    selected) && (
                    <span className="flex max-w-36 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {item.accessory && <span className="truncate">{item.accessory}</span>}
                      {showAccessoryIcon &&
                        item.accessoryIcon &&
                        accessoryIcon(item.accessoryIcon, item.accessoryIconActive === true)}
                      {statusActions.map((action) => (
                        <Button
                          key={actionKey(action, locale)}
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          title={actionLabel(action, locale)}
                          aria-label={actionLabel(action, locale)}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAction(action, { item })
                          }}
                        >
                          {actionIcon(action)}
                        </Button>
                      ))}
                      {selected && <Check className="size-3.5 text-primary" aria-hidden />}
                    </span>
                  )}
                  {selected && !!actionBarActions?.length && (
                    <ActionBar
                      actions={actionBarActions}
                      locale={locale}
                      onAction={(action) => onAction(action, { item })}
                      compact
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailPluginView({
  view,
  locale,
  onAction,
}: {
  view: PluginDetailView
  locale: string
  onAction: ViewRendererProps["onAction"]
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="space-y-2 text-sm leading-6">{renderMarkdown(view.markdown)}</div>
        {!!view.metadata?.length && (
          <dl className="mt-5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            {view.metadata.map((item) => (
              <div key={`${localize(item.label, locale)}:${item.value}`} className="contents">
                <dt className="text-muted-foreground">{localize(item.label, locale)}</dt>
                <dd className="min-w-0 truncate font-mono text-xs">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <ActionFooter
        actions={view.actions ?? []}
        locale={locale}
        onAction={(action) => onAction(action, {})}
      />
    </div>
  )
}

function FormPluginView({
  view,
  locale,
  onAction,
}: {
  view: PluginFormView
  locale: string
  onAction: ViewRendererProps["onAction"]
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      view.fields.map((field) => [field.id, "default" in field ? field.default : undefined])
    )
  )
  const submitAction = view.actions?.find((action) => action.type === "submit") ?? {
    type: "submit" as const,
    label: view.submitLabel,
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void onAction(submitAction, { values })
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
        {view.fields.map((field) => (
          <label key={field.id} className="block space-y-1.5">
            <span className="text-sm font-medium">{localize(field.label, locale)}</span>
            {renderField(field, locale, values[field.id], (value) =>
              setValues((current) => ({ ...current, [field.id]: value }))
            )}
            {field.description && (
              <span className="block text-xs text-muted-foreground">
                {localize(field.description, locale)}
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between border-t p-2">
        <ActionBar
          actions={(view.actions ?? []).filter((action) => action.type !== "submit")}
          locale={locale}
          onAction={(action) => onAction(action, { values })}
        />
        <Button type="submit" size="sm">
          <Send className="size-4" />
          {localize(view.submitLabel, locale) || localize(submitAction.label, locale) || "Submit"}
        </Button>
      </div>
    </form>
  )
}

function ActionFooter({
  actions,
  locale,
  onAction,
}: {
  actions: PluginAction[]
  locale: string
  onAction: (action: PluginAction) => void
}) {
  if (actions.length === 0) return null
  return (
    <div className="border-t p-2">
      <ActionBar actions={actions} locale={locale} onAction={onAction} />
    </div>
  )
}

function ActionBar({
  actions,
  locale,
  onAction,
  compact = false,
}: {
  actions: PluginAction[]
  locale: string
  onAction: (action: PluginAction) => void
  compact?: boolean
}) {
  if (actions.length === 0) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "shrink-0 justify-end")}>
      {actions.map((action) => (
        <Button
          key={actionKey(action, locale)}
          type="button"
          size={compact ? "icon-xs" : "sm"}
          variant="secondary"
          title={actionLabel(action, locale)}
          aria-label={compact ? actionLabel(action, locale) : undefined}
          onClick={(event) => {
            event.stopPropagation()
            onAction(action)
          }}
        >
          {actionIcon(action)}
          {!compact && <span>{actionLabel(action, locale)}</span>}
        </Button>
      ))}
    </div>
  )
}

function PluginItemIcon({ icon }: { icon?: string }) {
  const label = icon?.startsWith("lucide:") ? icon.slice("lucide:".length) : undefined
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      {label ? <Hash className="size-4" /> : <File className="size-4" />}
    </span>
  )
}

const ACTION_ICON_OVERRIDES: Record<string, LucideIconComponent> = {
  "lucide:copy": Copy,
  "lucide:star": Star,
}

const ACCESSORY_ICON_OVERRIDES: Record<string, LucideIconComponent> = {
  "lucide:check": Check,
  "lucide:star": Star,
}

function activeIconActions(actions?: PluginAction[]): PluginAction[] {
  return (actions ?? []).filter((action) => action.active && action.icon)
}

function accessoryIcon(icon: string, active: boolean) {
  const className = cn("size-3.5", active && "fill-current")
  const Override = ACCESSORY_ICON_OVERRIDES[icon]
  if (Override) return <Override className={className} />
  return <PluginIcon icon={icon} className={className} fallback={Check} />
}

function actionIcon(action: PluginAction) {
  const className = cn("size-4", action.active && "fill-current")
  const Override = action.icon ? ACTION_ICON_OVERRIDES[action.icon] : undefined
  if (Override) return <Override className={className} />
  if (action.icon) {
    return <PluginIcon icon={action.icon} className={className} fallback={Check} />
  }
  if (action.type === "copy" || action.type === "paste") return <Clipboard className="size-4" />
  if (action.type === "open-url" || action.type === "open-path")
    return <ExternalLink className="size-4" />
  if (action.type === "submit") return <Send className="size-4" />
  if (action.type === "close") return <X className="size-4" />
  if (action.type === "custom") return <Check className="size-4" />
  return <Play className="size-4" />
}

function actionLabel(action: PluginAction, locale: string): string {
  const explicit = localize(action.label, locale)
  if (explicit) return explicit
  switch (action.type) {
    case "copy":
      return "Copy"
    case "paste":
      return "Paste"
    case "open-url":
      return "Open"
    case "open-path":
      return "Reveal"
    case "run-command":
      return "Run"
    case "submit":
      return "Submit"
    case "close":
      return "Close"
    case "custom":
      return "Action"
  }
}

function sectionKey(
  section: { title?: LocalizedString; items: PluginListItem[] },
  locale: string
): string {
  return [
    typeof section.title === "string" ? section.title : localize(section.title, locale),
    section.items.map((item) => item.id).join("|"),
  ].join(":")
}

function actionKey(action: PluginAction, locale: string): string {
  const label = actionLabel(action, locale)
  if (action.type === "custom") return `${action.type}:${action.id}:${label}`
  if (action.type === "run-command") return `${action.type}:${action.commandId}:${label}`
  if (action.type === "open-url") return `${action.type}:${action.url}:${label}`
  if (action.type === "open-path") return `${action.type}:${action.path}:${label}`
  return `${action.type}:${label}`
}

function renderField(
  field: PluginFormField,
  locale: string,
  value: unknown,
  onChange: (value: unknown) => void
) {
  if (field.type === "textarea") {
    return (
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={localize(field.placeholder, locale)}
        rows={field.rows}
      />
    )
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        min={field.min}
        max={field.max}
        step={field.step}
      />
    )
  }
  if (field.type === "checkbox") {
    return (
      <Checkbox
        checked={Boolean(value)}
        onCheckedChange={(checked) => onChange(checked === true)}
        className="mt-1"
      />
    )
  }
  if (field.type === "select") {
    return (
      <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {localize(option.label, locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={localize(field.placeholder, locale)}
    />
  )
}

function renderMarkdown(markdown: string) {
  return markdown.split(/\n{2,}/).map((block) => {
    const trimmed = block.trim()
    if (!trimmed) return null
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={markdownBlockKey(trimmed)} className="text-lg font-semibold">
          {trimmed.slice(2)}
        </h2>
      )
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={markdownBlockKey(trimmed)} className="text-base font-semibold">
          {trimmed.slice(3)}
        </h3>
      )
    }
    if (trimmed.startsWith("```")) {
      return (
        <pre
          key={markdownBlockKey(trimmed)}
          className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs"
        >
          {trimmed.replace(/^```\w*\n?|\n?```$/g, "")}
        </pre>
      )
    }
    return (
      <p key={markdownBlockKey(trimmed)} className="whitespace-pre-wrap text-foreground">
        {trimmed}
      </p>
    )
  })
}

function markdownBlockKey(block: string): string {
  return `${block.length}:${block.slice(0, 48)}`
}
