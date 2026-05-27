/* eslint-disable no-restricted-syntax */
// Fixture: type-only validation that the SDK shape supports the planned
// built-in plugins. These files are excluded from the publishable build
// but participate in `tsc --noEmit`, so any
// drift in the public type surface surfaces here at typecheck time.
//
// Mirror of resources/builtin-plugins/timestamp planned for stage 5. Kept
// minimal — purpose is type validation, not behaviour.
import type { ListView, PluginModule } from "../index"

const plugin: PluginModule = {
  commands: {
    "timestamp.convert": {
      async run({ initialQuery }, ctx) {
        const unit = (ctx.preferences.defaultUnit as string | undefined) ?? "ms"
        return makeView(initialQuery ?? "", unit)
      },
      onSearchChange(text, ctx) {
        const unit = (ctx.preferences.defaultUnit as string | undefined) ?? "ms"
        return makeView(text, unit)
      },
    },
  },
}

function makeView(text: string, unit: string): ListView {
  const now = Date.now()
  const items: ListView["items"] = [
    {
      id: "now-ms",
      title: String(now),
      subtitle: { en: "Now (ms)", "zh-CN": "当前(毫秒)" },
      actions: [{ type: "copy", value: String(now) }],
    },
    {
      id: "now-s",
      title: String(Math.floor(now / 1000)),
      subtitle: { en: "Now (s)", "zh-CN": "当前(秒)" },
      actions: [{ type: "copy", value: String(Math.floor(now / 1000)) }],
    },
  ]
  if (/^\d+$/.test(text)) {
    const n = Number(text)
    const ms = unit === "s" ? n * 1000 : n
    const iso = new Date(ms).toISOString()
    items.push({
      id: "parsed",
      title: iso,
      subtitle: { en: "Parsed", "zh-CN": "解析结果" },
      actions: [{ type: "copy", value: iso }],
    })
  }
  return { type: "list", items }
}

export = plugin
