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
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
  /**
   * A plain string is treated as `{ type: "text", text: value }`.
   * Use a `ClipboardContent` object for image clipboard entries.
   */
  value: ClipboardActionValue
  shortcut?: string
}

export interface PasteAction {
  type: "paste"
  label?: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
  /**
   * A plain string is treated as `{ type: "text", text: value }`.
   * Use a `ClipboardContent` object for image clipboard entries.
   */
  value: ClipboardActionValue
  shortcut?: string
}

export interface OpenUrlAction {
  type: "open-url"
  label?: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
  /** Only `http(s)` URLs are honoured — host opens via `shell.openExternal`. */
  url: string
  shortcut?: string
}

export interface OpenPathAction {
  type: "open-path"
  label?: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
  path: string
  shortcut?: string
}

export interface RunCommandAction {
  type: "run-command"
  label?: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
  /** Plugin command id — typically owned by the same plugin. */
  commandId: string
  args?: unknown
}

export interface SubmitAction {
  type: "submit"
  label?: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
}

export interface CloseAction {
  type: "close"
  label?: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
}

export interface CustomAction {
  type: "custom"
  label: LocalizedString
  /** Optional `lucide:<icon-name>` override for host-rendered action buttons. */
  icon?: string
  /** Whether the action is currently active; host may render it highlighted/filled. */
  active?: boolean
  /** Identifier the plugin sees in `onAction(actionId, payload, ctx)`. */
  id: string
  payload?: unknown
}
