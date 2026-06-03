---
title: Screenshot Host Capabilities Design
date: 2026-06-01
status: draft
---

# Screenshot Host Capabilities Design

## Overview

Add first-party screenshot host capabilities to DesKit so official marketplace plugins can provide a fast office-oriented screenshot workflow without owning unsafe Electron window primitives.

The initial product shape is:

1. User triggers screenshot from a dedicated global hotkey, floating ball entry, or launcher command.
2. DesKit shows a transparent region-selection overlay.
3. User selects a region on one display.
4. A lightweight action toolbar appears near the selection: copy, save, pin, annotate, cancel.
5. Annotation mode supports line/arrow and rectangular mosaic.
6. Pin creates an always-on-top temporary image window on the desktop.

The screenshot plugin package and marketplace registry entry live in the separate marketplace repository. This repository only owns the Electron host capabilities, IPC/preload surface, renderer windows, settings/sync support, plugin SDK types, and permission enforcement needed by that plugin.

## Product Goals

- Make screenshot capture convenient enough for general office users.
- Provide a dedicated configurable global screenshot hotkey.
- Support region capture, copy, save, pin-to-screen, and basic annotation.
- Keep screenshot content private by default: no automatic history, no automatic sync, and no silent persistence.
- Validate the plugin architecture by exposing high-level host capabilities to official plugins.
- Keep dangerous window, display, and system capture details inside the trusted host.

## Non-Goals

- No marketplace registry content in this repository.
- No screenshot history in the first version.
- No automatic screenshot upload or sync.
- No long screenshot, scrolling screenshot, screen recording, OCR, smart window detection, edge snapping, magnifier, color picker, or delayed capture.
- No cross-display selection.
- No editable pinned-image windows.
- No arbitrary plugin-controlled overlay, BrowserWindow, DOM, iframe, or React rendering.

## Repository Boundary

| Area | This repository | Marketplace repository |
| --- | --- | --- |
| Host screenshot services | Yes | No |
| Region-selection overlay | Yes | No |
| Pinned image windows | Yes | No |
| Annotation renderer/view | Yes | No |
| Plugin permissions and SDK types | Yes | No |
| Official screenshot plugin package | No | Yes |
| Registry entry, download URL, sha256 | No | Yes |
| Plugin release process | No | Yes |

The official screenshot plugin should call host APIs such as `captureRegion()` and `pinImage()` rather than implementing capture or desktop windows itself.

## User Flows

### Capture and Copy

1. User presses the screenshot hotkey.
2. Overlay appears on the current display.
3. User drags a region.
4. Toolbar appears near the selection.
5. User clicks copy.
6. DesKit writes the selected PNG to the system clipboard.
7. No image is saved unless the user explicitly saves.

### Capture and Save

1. User selects a region.
2. User clicks save.
3. DesKit saves a PNG under the system Pictures directory:

```text
Pictures/DesKit/Screenshots/Screenshot YYYY-MM-DD HH.mm.ss.png
```

The first version does not provide a default-save-directory setting.

### Capture and Pin

1. User selects a region.
2. User clicks pin.
3. DesKit creates an always-on-top image window.
4. The pinned image can be dragged, resized, copied, saved, have opacity adjusted, and closed.
5. Pinned images are temporary runtime objects and disappear when the app exits.

### Capture and Annotate

1. User selects a region.
2. User clicks annotate.
3. DesKit opens annotation mode for the captured image.
4. User can draw line/arrow, freehand pen, rectangle, ellipse, or rectangular mosaic annotations.
5. User can undo the last operation.
6. User can copy, save, or pin the flattened annotated PNG.

## Entry Points

### Dedicated Screenshot Hotkey

Screenshot must have its own global shortcut. It is the primary entry point because screenshot capture should be immediately available without first opening the launcher or floating ball.

Settings should migrate from the current single `hotkey` field to a structured hotkey object:

```ts
interface UserSettings {
  hotkeys: {
    launcher: string
    screenshot: string
  }
}
```

Backward compatibility:

- Existing `hotkey` values are migrated to `hotkeys.launcher`.
- If `hotkeys.screenshot` is missing, DesKit fills a platform default.
- Existing settings files remain readable.

Recommended initial default:

```text
Control+Shift+A
```

The setting must be user-configurable because shortcut conflicts are common across operating systems and office applications.

### Floating Ball

Add `screenshot` to `FloatingBallFeature`. The floating ball screenshot item is the primary mouse-driven entry point.

### Launcher

Expose a screenshot command discoverable from the launcher. This can be provided by the official marketplace plugin once installed, but the host must be able to start the same screenshot flow from plugin API calls.

## Sync

Screenshot hotkey settings should participate in settings sync. Sync should carry user-configured values, not force every platform to share the same defaults.

Rules:

- Sync payload includes `hotkeys`.
- Legacy sync payloads with `hotkey` map to `hotkeys.launcher`.
- Missing `hotkeys.screenshot` is filled locally from the platform default.
- Screenshot files, temporary images, and pinned windows are never synced.

## Privacy and Storage

- Copy and pin do not imply permanent storage.
- Save is explicit and writes to `Pictures/DesKit/Screenshots`.
- Intermediate capture and annotation files may be stored under app-controlled temp/cache directories.
- Temp files should be eligible for cleanup after the flow completes or app exits.
- The first version does not keep screenshot history.
- Pinned image windows are current-session only and are not restored after restart.

## Multi-Display Behavior

The first version must support multi-display setups because external monitors are common in office workflows.

Rules:

- Each display can be captured.
- Selection occurs on one display at a time.
- Cross-display selection is not supported.
- Overlay and toolbar must respect the active display work area.
- Capture output must account for display scale factor.
- Displays with negative coordinates must be handled correctly.

## Overlay Behavior

The region-selection overlay should be lightweight:

- Transparent full-display overlay.
- Drag to select a rectangular region.
- Show selection dimensions, for example `640 x 360`.
- `Esc` cancels.
- Releasing the mouse confirms the region and shows the action toolbar.
- If resizing the selected rectangle is costly, the first implementation may offer a reselect action instead.

Out of scope:

- Magnifier.
- Smart edge/window snapping.
- Cross-display selection.
- Pixel color picker.
- Multiple selected regions.

## Annotation Scope

First-version annotation tools:

- Line/arrow tool.
- Freehand pen tool.
- Rectangle outline tool.
- Ellipse outline tool.
- Rectangular mosaic tool.
- Color selection.
- Stroke width selection.
- Undo last operation.
- Copy, save, and pin flattened output.

Line/arrow defaults:

- Red.
- 3px.
- Arrow enabled by default.

Out of scope:

- Text annotations.
- Editable layer panel.
- Crop.
- Stickers.
- Eraser.
- Shape library.

Pinned image windows are not editable. Users who need annotated pinned images should annotate first, then pin the flattened result.

## Host Architecture

Create a screenshot domain in the main process rather than embedding Electron logic inside plugin bridge code.

Suggested structure:

```text
src/main/screenshot/
  capture-region.ts
  overlay-window.ts
  pinned-image-window.ts
  screenshot-store.ts
  types.ts
```

Responsibilities:

| Layer | Responsibility |
| --- | --- |
| `src/main/screenshot/` | Window creation, display mapping, capture, pin lifecycle, temp files |
| `src/main/ipc/` | Renderer requests for capture flow, toolbar actions, annotation outputs |
| `src/preload/` | Typed safe bridge for screenshot windows and renderer code |
| `src/renderer/` | Overlay page, toolbar UI, annotator UI, pinned image UI |
| `src/main/plugins/plugin-bridge.ts` | Permission checks and high-level calls into screenshot services |
| `packages/plugin-sdk/` | Public plugin API and types |

The host should expose high-level capabilities only. Plugins must not receive raw `BrowserWindow`, display overlay control, mouse-event streams, or arbitrary filesystem access.

## Plugin API Shape

The exact names may change during implementation, but the capability shape should remain high-level:

```ts
const capture = await ctx.system.captureRegion()

await ctx.system.pinImage(capture.imagePath)
await ctx.clipboard.write({ type: "image", path: capture.imagePath })
```

Candidate result:

```ts
interface CaptureRegionResult {
  imagePath: string
  width: number
  height: number
  displayId: string
}
```

Candidate permissions:

```text
system:capture-screen
system:pin-image
clipboard:write
```

`system:pin-image` may be folded into `system:capture-screen` if implementation proves that pinning is only meaningful for captured images. Prefer separate permissions if third-party plugins may pin generated images later.

## Renderer Surfaces

Use hash-routed renderer pages consistent with the current launcher and floating-ball windows.

Candidate routes:

```text
#screenshot-overlay
#screenshot-annotator
#pinned-image
```

Overlay and pinned windows should force transparent backgrounds as the launcher and floating ball do today.

## Security Considerations

- Preserve Electron security defaults: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and `webviewTag: false`.
- Only trusted host code creates and controls screenshot windows.
- Plugins request capture through permission-checked APIs.
- Clipboard and filesystem writes remain explicit actions.
- External images passed to `pinImage` must be constrained to safe app-owned paths or validated file paths.
- Annotation output should be a flattened image rather than persistent editable state.

## Test Plan

Unit tests:

- Settings migration from `hotkey` to `hotkeys.launcher`.
- Settings normalization when `hotkeys.screenshot` is missing.
- Sync conversion for legacy and new hotkey payloads.
- Permission denial for plugins missing screenshot permissions.
- Pinned image bounds clamping and opacity normalization.
- Screenshot file naming and save directory resolution.

Renderer/component tests:

- Floating ball renders screenshot feature.
- Screenshot settings UI renders launcher and screenshot shortcut inputs.
- Annotation reducer handles line, mosaic, undo, and export state.

Main-process tests:

- Overlay display selection maps cursor/display coordinates correctly.
- Multi-display selection rejects cross-display rectangles.
- Capture result metadata uses scaled pixel dimensions.

Manual verification:

- Single display capture/copy/save/pin.
- Dual display capture on primary and secondary monitors.
- High-DPI display capture output dimensions.
- Shortcut conflict fallback behavior.
- Pinned image drag, resize, opacity, copy, save, close.

## Open Implementation Decisions

- Whether the first overlay supports selection adjustment after mouse release or only reselect.
- Exact platform-specific screenshot default accelerators.
- Whether `pinImage` accepts only app-owned temp paths in P0 or any user-readable image path.
- Whether annotation runs in the same overlay window or a separate annotator window.
