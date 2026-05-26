import type { ClipboardActionValue } from "./clipboard"
import type { LocalizedString } from "./locales"

/**
 * Declarative actions a plugin attaches to list items, detail views or forms.
 *
 * The host executes built-in actions (copy / paste / open-url / open-path /
 * run-command / submit / close) directly — the plugin is not re-invoked.
 * Only `custom` actions round-trip back to the plugin via
 * `CommandHandler.onAction`, so use `custom` only when the plugin needs to
 * react with new state (e.g. clipboard "favorite", "delete").
 */
export type Action =
  | CopyAction
  | PasteAction
  | OpenUrlAction
  | OpenPathAction
  | RunCommandAction
  | SubmitAction
  | CloseAction
  | CustomAction

export interface CopyAction {
  type: "copy"
  label?: LocalizedString
  /**
   * A plain string is treated as `{ type: "text", text: value }`.
   * Use a `ClipboardContent` object for image and file clipboard entries.
   */
  value: ClipboardActionValue
  shortcut?: string
}

export interface PasteAction {
  type: "paste"
  label?: LocalizedString
  /**
   * A plain string is treated as `{ type: "text", text: value }`.
   * Use a `ClipboardContent` object for image and file clipboard entries.
   */
  value: ClipboardActionValue
  shortcut?: string
}

export interface OpenUrlAction {
  type: "open-url"
  label?: LocalizedString
  /** Only `http(s)` URLs are honoured — host opens via `shell.openExternal`. */
  url: string
  shortcut?: string
}

export interface OpenPathAction {
  type: "open-path"
  label?: LocalizedString
  path: string
  shortcut?: string
}

export interface RunCommandAction {
  type: "run-command"
  label?: LocalizedString
  /** Plugin command id — typically owned by the same plugin. */
  commandId: string
  args?: unknown
}

export interface SubmitAction {
  type: "submit"
  label?: LocalizedString
}

export interface CloseAction {
  type: "close"
  label?: LocalizedString
}

export interface CustomAction {
  type: "custom"
  label: LocalizedString
  /** Identifier the plugin sees in `onAction(actionId, payload, ctx)`. */
  id: string
  payload?: unknown
}
