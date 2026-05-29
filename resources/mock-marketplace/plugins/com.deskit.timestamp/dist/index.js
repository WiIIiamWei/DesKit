module.exports = {
  commands: {
    "timestamp.convert": {
      run(input) {
        return render(input.initialQuery || "")
      },
      onSearchChange(text) {
        return render(text)
      },
    },
  },
}

function render(text) {
  const now = Date.now()
  const items = [
    item("now-ms", String(now), "Now in milliseconds"),
    item("now-s", String(Math.floor(now / 1000)), "Now in seconds"),
  ]

  if (/^\d+$/.test(text.trim())) {
    const value = Number(text.trim())
    const ms = value < 10000000000 ? value * 1000 : value
    const iso = new Date(ms).toISOString()
    items.unshift(item("parsed", iso, "Parsed timestamp"))
  }

  return {
    type: "list",
    searchPlaceholder: {
      en: "Type a Unix timestamp",
      "zh-CN": "输入 Unix 时间戳",
    },
    items,
  }
}

function item(id, title, subtitle) {
  return {
    id,
    title,
    subtitle: { en: subtitle, "zh-CN": subtitle },
    actions: [{ type: "copy", value: title }],
  }
}
