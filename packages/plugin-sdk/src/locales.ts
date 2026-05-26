/**
 * A string that may carry per-locale translations.
 *
 * Plain strings render as-is. Maps are resolved at render time by the host
 * against the user's current `i18next.language`, falling back to `en` and
 * finally to the first available entry. Plugins do not call `i18next` —
 * they hand back a `LocalizedString` and the host renders it.
 */
export type LocalizedString = string | { [locale: string]: string }
