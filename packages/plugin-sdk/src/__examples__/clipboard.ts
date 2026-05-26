// Fixture: validates that storage + clipboard.watch + custom Action supports
// text, image and file clipboard history entries. Mirror of stage 5's
// clipboard plugin.
import type { ClipboardContent, ListView, PluginModule } from "../index"

interface Entry {
  id: string
  content: ClipboardContent
  ts: number
  favorite?: boolean
}

const plugin: PluginModule = {
  commands: {
    "clipboard.history": {
      async run(_input, ctx) {
        const entries = (await ctx.storage.get<Entry[]>("entries")) ?? []
        ctx.clipboard.watch(async (content) => {
          const ts = Date.now()
          const next: Entry[] = [{ id: String(ts), content, ts }, ...entries].slice(0, 200)
          await ctx.storage.set("entries", next)
        })
        return render(entries)
      },
      async onAction(actionId, payload, ctx) {
        const entries = (await ctx.storage.get<Entry[]>("entries")) ?? []
        if (actionId === "favorite" && isIdPayload(payload)) {
          const next = entries.map((e) =>
            e.id === payload.id ? { ...e, favorite: !e.favorite } : e
          )
          await ctx.storage.set("entries", next)
          return render(next)
        }
        if (actionId === "delete" && isIdPayload(payload)) {
          const next = entries.filter((e) => e.id !== payload.id)
          await ctx.storage.set("entries", next)
          return render(next)
        }
      },
    },
  },
}

function isIdPayload(p: unknown): p is { id: string } {
  return typeof p === "object" && p !== null && typeof (p as { id?: unknown }).id === "string"
}

function render(entries: Entry[]): ListView {
  return {
    type: "list",
    sections: [
      {
        title: { en: "Pinned", "zh-CN": "收藏" },
        items: entries.filter((e) => e.favorite).map(toItem),
      },
      {
        title: { en: "Recent", "zh-CN": "最近" },
        items: entries.filter((e) => !e.favorite).map(toItem),
      },
    ],
  }
}

function toItem(e: Entry): ListView["items"] extends (infer U)[] | undefined ? U : never {
  const title = getTitle(e.content)
  return {
    id: e.id,
    title,
    actions: [
      { type: "paste", value: e.content },
      { type: "copy", value: e.content },
      {
        type: "custom",
        id: "favorite",
        label: { en: "Toggle pin", "zh-CN": "切换收藏" },
        payload: { id: e.id },
      },
      {
        type: "custom",
        id: "delete",
        label: { en: "Delete", "zh-CN": "删除" },
        payload: { id: e.id },
      },
    ],
  }
}

function getTitle(content: ClipboardContent): string {
  if (content.type === "text") {
    return content.text
  }
  if (content.type === "image") {
    const size = content.width && content.height ? ` ${content.width}x${content.height}` : ""
    return content.name ? `${content.name}${size}` : `Image${size}`
  }
  return content.paths.length === 1 ? (content.paths[0] ?? "File") : `${content.paths.length} files`
}

export default plugin
