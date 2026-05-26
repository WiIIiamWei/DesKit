import type { Action } from "./actions"
import type { LocalizedString } from "./locales"

/**
 * The host renders one of these for every command response. Plugins return
 * a fresh view from `run` / `onSearchChange` / `onAction`; the host replaces
 * the previous view in place.
 *
 * Plugins never touch the DOM. Theme, fonts and layout are owned by the
 * host shell — switching dark mode or accent re-renders existing views
 * automatically without any cooperation from the plugin.
 */
export type View = ListView | DetailView | FormView | ToastOnly

export interface ListView {
  type: "list"
  searchPlaceholder?: string
  isLoading?: boolean
  emptyText?: LocalizedString
  /** Either `sections` (grouped) or `items` (flat). If both are present, `sections` wins. */
  sections?: Array<{ title?: LocalizedString; items: ListItem[] }>
  items?: ListItem[]
}

export interface ListItem {
  id: string
  title: LocalizedString
  subtitle?: LocalizedString
  /** Right-aligned hint text (e.g. "12 days ago", a count). */
  accessory?: string
  /** Asset path relative to the plugin root, or `lucide:<icon-name>`. */
  icon?: string
  actions: Action[]
}

export interface DetailView {
  type: "detail"
  /** Restricted markdown — host applies theme. No raw HTML. */
  markdown: string
  metadata?: Array<{ label: LocalizedString; value: string }>
  actions: Action[]
}

export interface FormView {
  type: "form"
  fields: FormField[]
  submitLabel?: LocalizedString
  actions: Action[]
}

export type FormField = TextField | TextAreaField | NumberField | CheckboxField | SelectField

interface FormFieldBase {
  id: string
  label: LocalizedString
  required?: boolean
  description?: LocalizedString
}

export interface TextField extends FormFieldBase {
  type: "text"
  placeholder?: LocalizedString
  default?: string
}

export interface TextAreaField extends FormFieldBase {
  type: "textarea"
  placeholder?: LocalizedString
  default?: string
  rows?: number
}

export interface NumberField extends FormFieldBase {
  type: "number"
  default?: number
  min?: number
  max?: number
  step?: number
}

export interface CheckboxField extends FormFieldBase {
  type: "checkbox"
  default?: boolean
}

export interface SelectField extends FormFieldBase {
  type: "select"
  default?: string
  options: Array<{ value: string; label: LocalizedString }>
}

/**
 * A view that displays no UI of its own — the host shows a sonner toast
 * and stays on the previous screen. Useful for `mode: "no-view"` commands.
 */
export interface ToastOnly {
  type: "toast"
  level: "info" | "success" | "warning" | "error"
  message: LocalizedString
}
