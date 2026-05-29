module.exports = {
  commands: {
    "notes.quick": {
      async run(input, ctx) {
        const notes = await readNotes(ctx)
        const draft = (input.initialQuery || "").trim()
        return render(notes, draft)
      },
      async onSearchChange(text, ctx) {
        const notes = await readNotes(ctx)
        return render(notes, text.trim())
      },
      async onAction(actionId, payload, ctx) {
        const notes = await readNotes(ctx)
        if (actionId === "save" && payload && typeof payload.text === "string") {
          const text = payload.text.trim()
          const next = text
            ? [{ id: String(Date.now()), text, createdAt: new Date().toISOString() }, ...notes]
            : notes
          await ctx.storage.set("notes", next.slice(0, 20))
          return render(next, "")
        }
        if (actionId === "delete" && payload && typeof payload.id === "string") {
          const next = notes.filter((note) => note.id !== payload.id)
          await ctx.storage.set("notes", next)
          return render(next, "")
        }
        return render(notes, "")
      },
    },
  },
}

async function readNotes(ctx) {
  const value = await ctx.storage.get("notes")
  return Array.isArray(value) ? value.filter(isNote) : []
}

function isNote(value) {
  return (
    value &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.createdAt === "string"
  )
}

function render(notes, draft) {
  const items = []
  if (draft) {
    items.push({
      id: "save-draft",
      title: draft,
      subtitle: { en: "Save this note", "zh-CN": "保存这条笔记" },
      actions: [
        {
          type: "custom",
          id: "save",
          label: { en: "Save", "zh-CN": "保存" },
          payload: { text: draft },
        },
      ],
    })
  }

  for (const note of notes) {
    items.push({
      id: note.id,
      title: note.text,
      subtitle: note.createdAt,
      actions: [
        { type: "copy", value: note.text },
        {
          type: "custom",
          id: "delete",
          label: { en: "Delete", "zh-CN": "删除" },
          payload: { id: note.id },
        },
      ],
    })
  }

  return {
    type: "list",
    searchPlaceholder: {
      en: "Type to save a note",
      "zh-CN": "输入内容保存笔记",
    },
    emptyText: {
      en: "Type a note to save it.",
      "zh-CN": "输入一条笔记来保存。",
    },
    items,
  }
}
