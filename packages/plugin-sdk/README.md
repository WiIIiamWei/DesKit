# @deskit/plugin-sdk

TypeScript types and runtime contract for [DesKit](../../README.md) plugins.

A DesKit plugin is a CommonJS module that registers commands and returns
declarative view descriptions. The host renders those descriptions with a
unified shadcn-based UI — plugin code never touches the DOM, never embeds
an iframe, and never imports React.

```ts
import type { PluginModule } from "@deskit/plugin-sdk"

const plugin: PluginModule = {
  commands: {
    "hello.world": {
      async run(_input, _ctx) {
        return {
          type: "list",
          items: [
            {
              id: "hello",
              title: "Hello",
              actions: [{ type: "copy", value: "world" }],
            },
          ],
        }
      },
    },
  },
}

export = plugin
```

## Status

P0 scope is type-only. See [`DesKit/PLAN.md`](../../DesKit/PLAN.md) §3 for the
SDK design and [`DesKit/TASKS.md`](../../DesKit/TASKS.md) §1 for the rollout
plan. Runtime APIs (storage, clipboard, notifications, system, runtime) are
provided by the host through a bridge that conforms to the same interfaces.

Clipboard APIs support text, image, and file-list payloads through
`ClipboardContent`. The text-only helpers (`readText` / `writeText`) remain for
simple commands, while clipboard-history plugins should use `read` / `write` /
`watch` so P0 can cover all required clipboard entry types.
