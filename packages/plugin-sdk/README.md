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

P0 scope is type-first: the package defines the plugin contract, command
handlers, declarative views, actions, and host-provided runtime APIs. Runtime
APIs (storage, clipboard, notifications, system, runtime) are provided by the
host through a bridge that conforms to the same interfaces.

Clipboard APIs support text, image, and file-list payloads through
`ClipboardContent`. The text-only helpers (`readText` / `writeText`) remain for
simple commands, while clipboard-history plugins should use `read` / `write` /
`watch` so P0 can cover all required clipboard entry types.

## Screenshot Host APIs

Official screenshot-style plugins should use host APIs for capture and pinning
instead of creating windows or rendering their own DOM. Region capture requires
`system:capture-screen`; pinning requires `system:pin-image`.

```ts
const capture = await ctx.system.captureRegion()
if (capture) {
  await ctx.system.pinImage(capture.imagePath)
}
```

`captureRegion()` opens DesKit's trusted region-selection overlay and returns a
PNG path, dimensions, and display id. `pinImage()` creates a temporary
always-on-top image window managed by the host.
