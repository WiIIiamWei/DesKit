// @deskit/plugin-sdk
//
// Public surface for DesKit plugin authors. P0 ships pure type contracts;
// no runtime symbols. The host (DesKit main process) injects an object that
// satisfies `PluginContext` into each command invocation, so plugins can
// `import type { PluginModule, PluginContext } from "@deskit/plugin-sdk"`
// without paying any runtime cost.
//
// See ./README.md for author-facing usage notes.

export type {
  Action,
  ActionPlacement,
  CloseAction,
  CopyAction,
  CustomAction,
  OpenPathAction,
  OpenUrlAction,
  PasteAction,
  RunCommandAction,
  SubmitAction,
} from "./actions"

export type {
  ClipboardActionValue,
  ClipboardContent,
  ClipboardImageContent,
  ClipboardTextContent,
} from "./clipboard"

export type {
  ClipboardChangeEvent,
  CommandHandler,
  CommandInvocation,
  PluginEventHandlers,
  PluginModule,
} from "./commands"

export type {
  CaptureRegionResult,
  ClipboardAPI,
  NetworkAPI,
  NetworkRequestOptions,
  NetworkResponse,
  NotificationAPI,
  PluginContext,
  PluginSyncAPI,
  PluginSyncStatus,
  StorageAPI,
  SystemAPI,
} from "./context"

export type { LocalizedString } from "./locales"

export type {
  CheckboxField,
  DetailView,
  FormField,
  FormView,
  ListItem,
  ListView,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  ToastOnly,
  View,
} from "./views"
