# Screenshot Host Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add screenshot host capabilities for a general-office screenshot workflow: dedicated global hotkey, region capture, copy, save, pin-to-screen, and basic line/mosaic annotation.

**Architecture:** Build a trusted main-process screenshot domain, renderer hash pages for overlay/annotation/pinned-image UI, typed preload IPC, settings and sync migration for structured hotkeys, and high-level plugin SDK APIs. The official screenshot plugin package and registry entry remain in the separate marketplace repository.

**Spec:** `docs/superpowers/specs/2026-06-01-screenshot-host-capabilities-design.md`

---

## File Map

| Action | Path | Purpose |
| --- | --- | --- |
| Create | `src/main/screenshot/types.ts` | Shared screenshot domain types |
| Create | `src/main/screenshot/screenshot-store.ts` | Temp paths, explicit save path, file naming |
| Create | `src/main/screenshot/overlay-window.ts` | Region selection overlay windows |
| Create | `src/main/screenshot/capture-region.ts` | Display mapping and capture orchestration |
| Create | `src/main/screenshot/pinned-image-window.ts` | Always-on-top pinned image windows |
| Modify | `src/main/settings/settings.ts` | `hotkeys` schema, migration, defaults |
| Modify | `src/main/sync/hotkey-sync.ts` | Sync new hotkey shape with legacy compatibility |
| Modify | `src/main/index.ts` | Register launcher and screenshot shortcuts, wire services |
| Modify | `src/main/floating-ball-window.ts` | Open screenshot feature from floating ball |
| Modify | `src/main/plugins/plugin-bridge.ts` | Add permission-checked capture/pin APIs |
| Modify | `src/main/plugins/permissions.ts` | Add screenshot/pin permissions |
| Modify | `src/preload/index.ts` | Add screenshot IPC bridge surface |
| Modify | `src/preload/index.d.ts` | Add renderer-visible screenshot types |
| Modify | `src/renderer/src/App.tsx` | Route screenshot overlay/annotator/pinned windows |
| Create | `src/renderer/src/components/screenshot/screenshot-overlay-page.tsx` | Region selection UI |
| Create | `src/renderer/src/components/screenshot/screenshot-toolbar.tsx` | Copy/save/pin/annotate/cancel toolbar |
| Create | `src/renderer/src/components/screenshot/image-annotator-page.tsx` | Line/arrow and mosaic annotation UI |
| Create | `src/renderer/src/components/screenshot/pinned-image-page.tsx` | Pinned image runtime UI |
| Modify | `src/renderer/src/components/floating-ball-panel.tsx` | Add screenshot feature icon/action |
| Modify | `src/renderer/src/components/floating-ball-settings.tsx` | Allow screenshot feature selection |
| Modify | `src/renderer/src/components/launcher-settings.tsx` | Show launcher and screenshot shortcut inputs |
| Modify | `src/renderer/src/i18n/messages/en.json` | Add screenshot UI strings |
| Modify | `src/renderer/src/i18n/messages/zh-CN.json` | Add screenshot UI strings |
| Modify | `packages/plugin-sdk/src/context.ts` | Add capture/pin public types |
| Modify | `packages/plugin-sdk/README.md` | Document screenshot host APIs |

---

## Phase 1: Settings, Sync, and Shortcut Model

**Goal:** Introduce structured hotkeys without breaking existing users.

**Files:**

- Modify: `src/main/settings/settings.ts`
- Modify: `src/main/settings/settings.test.ts`
- Modify: `src/main/sync/hotkey-sync.ts`
- Modify: `src/main/sync/hotkey-sync.test.ts`
- Modify: `src/renderer/src/components/launcher-settings.tsx`
- Modify: `src/renderer/src/components/launcher-settings.test.tsx`
- Modify: `src/renderer/src/i18n/messages/en.json`
- Modify: `src/renderer/src/i18n/messages/zh-CN.json`

- [ ] **Step 1: Add `HotkeySettings` type**

```ts
export interface HotkeySettings {
  launcher: string
  screenshot: string
}
```

- [ ] **Step 2: Replace persisted `hotkey` with `hotkeys`**

Keep the old field readable:

```ts
hotkey -> hotkeys.launcher
```

Missing `hotkeys.screenshot` should fall back to the platform default.

- [ ] **Step 3: Add tests for normalization**

Cover:

- Legacy `hotkey`.
- New `hotkeys`.
- Missing screenshot hotkey.
- Invalid/empty values.

- [ ] **Step 4: Update sync conversion**

Sync `hotkeys` and preserve compatibility with payloads that only include `hotkey`.

- [ ] **Step 5: Update settings UI**

Show two shortcut inputs:

- Launcher.
- Screenshot.

- [ ] **Step 6: Verify**

```bash
pnpm test src/main/settings/settings.test.ts src/main/sync/hotkey-sync.test.ts src/renderer/src/components/launcher-settings.test.tsx
pnpm typecheck
```

---

## Phase 2: Main Screenshot Domain Skeleton

**Goal:** Add the trusted main-process screenshot module boundaries before renderer work.

**Files:**

- Create: `src/main/screenshot/types.ts`
- Create: `src/main/screenshot/screenshot-store.ts`
- Create: `src/main/screenshot/capture-region.ts`
- Create: `src/main/screenshot/overlay-window.ts`
- Create: `src/main/screenshot/pinned-image-window.ts`
- Add tests next to each module where practical.

- [ ] **Step 1: Define domain types**

Include:

- `CaptureRegionResult`
- `CaptureRegionRequest`
- `ScreenshotSelection`
- `PinnedImageOptions`
- `PinnedImageState`

- [ ] **Step 2: Implement save/temp path helpers**

Rules:

- Temp/intermediate images use app-controlled temp/cache paths.
- Explicit save writes to `Pictures/DesKit/Screenshots`.
- Filename format: `Screenshot YYYY-MM-DD HH.mm.ss.png`.

- [ ] **Step 3: Stub capture orchestration**

Create a service API that can later be called by shortcuts, IPC, and plugin bridge:

```ts
captureRegion(): Promise<CaptureRegionResult | null>
pinImage(imagePath: string): Promise<void>
```

- [ ] **Step 4: Add unit tests**

Cover file naming, path resolution, option normalization, and basic bounds helpers.

- [ ] **Step 5: Verify**

```bash
pnpm test src/main/screenshot
pnpm typecheck
```

---

## Phase 3: Overlay Window and Region Selection

**Goal:** Make screenshot region selection work across displays without cross-display selection.

**Files:**

- Modify: `src/main/screenshot/overlay-window.ts`
- Modify: `src/main/screenshot/capture-region.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/screenshot/screenshot-overlay-page.tsx`
- Create: `src/renderer/src/components/screenshot/screenshot-toolbar.tsx`

- [ ] **Step 1: Create overlay windows**

Create transparent frameless overlay windows for active display selection. Preserve Electron security settings:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- `webviewTag: false`

- [ ] **Step 2: Add overlay renderer route**

Use a hash route such as:

```text
#screenshot-overlay
```

- [ ] **Step 3: Implement drag selection UI**

Support:

- Drag rectangular region.
- Dimension label.
- `Esc` cancel.
- Mouse release confirms selection and shows toolbar.

- [ ] **Step 4: Implement toolbar actions**

Actions:

- Copy.
- Save.
- Pin.
- Annotate.
- Cancel/reselect.

- [ ] **Step 5: Capture selected region**

Use Electron desktop capture APIs from the trusted host. Account for display scale factor and display coordinates.

- [ ] **Step 6: Add tests**

Cover coordinate conversion and selection validation. Component-test overlay reducer/helpers where possible.

- [ ] **Step 7: Manual verify**

Test single display, secondary display, and high-DPI display.

---

## Phase 4: Dedicated Screenshot Hotkey

**Goal:** Make screenshot capture immediately accessible.

**Files:**

- Modify: `src/main/index.ts`
- Modify: `src/main/shortcut.ts` or create a multi-shortcut manager if needed.
- Add/update tests for shortcut binding logic.

- [ ] **Step 1: Extend shortcut binding model**

Current shortcut code tracks one accelerator. Introduce a small manager that can bind multiple named shortcuts without unregistering unrelated bindings.

- [ ] **Step 2: Bind launcher and screenshot shortcuts**

Use settings:

```ts
settings.hotkeys.launcher
settings.hotkeys.screenshot
```

- [ ] **Step 3: Preserve fallback behavior**

If screenshot shortcut registration fails, launcher shortcut should remain active.

- [ ] **Step 4: Rebind on settings update**

Updating either shortcut should rebind only the changed shortcut where possible.

- [ ] **Step 5: Verify**

```bash
pnpm test src/main/shortcut.test.ts src/main/settings/settings.test.ts
pnpm typecheck
```

---

## Phase 5: Floating Ball Screenshot Entry

**Goal:** Add a discoverable mouse-driven screenshot entry.

**Files:**

- Modify: `src/main/settings/settings.ts`
- Modify: `src/main/floating-ball-window.ts`
- Modify: `src/renderer/src/components/floating-ball-panel.tsx`
- Modify: `src/renderer/src/components/floating-ball-settings.tsx`
- Modify: `src/renderer/src/i18n/messages/en.json`
- Modify: `src/renderer/src/i18n/messages/zh-CN.json`

- [ ] **Step 1: Add `screenshot` to floating ball feature type**

Update:

```ts
export type FloatingBallFeature = "appLauncher" | "screenshot"
```

- [ ] **Step 2: Add icon and label**

Use a lucide screenshot/crop-style icon.

- [ ] **Step 3: Wire feature action**

Opening the floating ball screenshot feature starts the screenshot capture flow and collapses the menu.

- [ ] **Step 4: Verify**

```bash
pnpm test src/main/settings/settings.test.ts src/renderer/src/components/launcher-settings.test.tsx
pnpm typecheck
```

---

## Phase 6: Pinned Image Windows

**Goal:** Support temporary always-on-top screenshot pinning.

**Files:**

- Modify: `src/main/screenshot/pinned-image-window.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/screenshot/pinned-image-page.tsx`

- [ ] **Step 1: Create pinned image window**

Requirements:

- Frameless.
- Always on top.
- Skip taskbar.
- Resizable.
- Movable.
- Secure web preferences.

- [ ] **Step 2: Implement pinned image UI**

Support:

- Drag.
- Resize.
- Close.
- Copy.
- Save.
- Opacity adjustment.

- [ ] **Step 3: Support multiple pinned windows**

Pinned images are independent current-session runtime objects.

- [ ] **Step 4: Ensure no restart restore**

Do not persist pinned image window state.

- [ ] **Step 5: Verify manually**

Create multiple pinned images, resize them, adjust opacity, close them, and restart app to confirm they do not restore.

---

## Phase 7: Annotation View

**Goal:** Provide first-version annotation for line/arrow and rectangular mosaic.

**Files:**

- Create: `src/renderer/src/components/screenshot/image-annotator-page.tsx`
- Create: `src/renderer/src/components/screenshot/annotation-state.ts`
- Create: `src/renderer/src/components/screenshot/annotation-state.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Build annotation state model**

Operations:

- Add line/arrow.
- Apply rectangular mosaic.
- Undo last operation.
- Export flattened PNG.

- [ ] **Step 2: Implement canvas rendering**

Defaults:

- Red line.
- 3px stroke.
- Arrow enabled by default.

- [ ] **Step 3: Implement mosaic**

Apply pixelated rectangular mosaic to the selected region.

- [ ] **Step 4: Add toolbar actions**

Actions:

- Copy.
- Save.
- Pin.
- Undo.
- Cancel.

- [ ] **Step 5: Add reducer tests**

Cover operation ordering, undo, and export-state behavior.

- [ ] **Step 6: Manual verify**

Annotate a screenshot, copy it to another app, save it, and pin the flattened result.

---

## Phase 8: Plugin Host APIs and SDK

**Goal:** Let official marketplace plugins use screenshot capabilities without owning low-level Electron behavior.

**Files:**

- Modify: `src/main/plugins/plugin-bridge.ts`
- Modify: `src/main/plugins/permissions.ts`
- Modify: `src/main/plugins/plugin-bridge.test.ts`
- Modify: `src/main/plugins/manifest-loader.test.ts` if permission validation is enumerated there.
- Modify: `packages/plugin-sdk/src/context.ts`
- Modify: `packages/plugin-sdk/README.md`

- [ ] **Step 1: Add SDK APIs**

Candidate API:

```ts
ctx.system.captureRegion(): Promise<CaptureRegionResult | null>
ctx.system.pinImage(imagePath: string): Promise<void>
```

- [ ] **Step 2: Add permissions**

Candidate permissions:

```text
system:capture-screen
system:pin-image
```

- [ ] **Step 3: Enforce permissions in bridge**

Missing permissions must reject with `PermissionDenied`.

- [ ] **Step 4: Restrict image paths**

For P0, prefer app-owned temp paths or validated safe image paths. Document the chosen rule.

- [ ] **Step 5: Add tests**

Cover allowed and denied plugin calls.

- [ ] **Step 6: Update SDK docs**

Add a short screenshot plugin example that calls host APIs, without including marketplace registry details.

---

## Phase 9: End-to-End Wiring and Polish

**Goal:** Make the full screenshot MVP feel coherent.

**Files:**

- Modify: all touched renderer/main modules as needed.
- Modify: `README.md` and `README_zh.md` if feature documentation is desired.
- Modify: `TESTING.md` if manual screenshot verification should be documented.

- [ ] **Step 1: Wire all entry points to the same capture flow**

Entry points:

- Screenshot global hotkey.
- Floating ball screenshot item.
- Launcher/plugin command.

- [ ] **Step 2: Add user-facing error handling**

Handle:

- Shortcut registration failure.
- Capture cancellation.
- Capture permission failures.
- Clipboard write failure.
- Save failure.

- [ ] **Step 3: Add i18n strings**

All visible screenshot, toolbar, settings, and toast text should be localized in English and Simplified Chinese.

- [ ] **Step 4: Run focused checks**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

- [ ] **Step 5: Manual acceptance pass**

Verify:

- Hotkey starts capture.
- Floating ball starts capture.
- Launcher/plugin starts capture.
- Region capture works on each display.
- Copy writes PNG clipboard data.
- Save writes to Pictures/DesKit/Screenshots.
- Pin creates a temporary always-on-top image.
- Annotation line/arrow works.
- Annotation mosaic works.
- Undo works.
- No screenshot history is created.
- Restart does not restore pinned images.

---

## Implementation Notes

- Keep the first version intentionally narrow. Do not add screenshot history, OCR, magnifier, smart snapping, long screenshot, recording, or editable pinned images while implementing this plan.
- Keep marketplace-specific plugin package and registry work out of this repository.
- Prefer small commits by phase. The settings migration and shortcut manager are risky enough to land before overlay work.
- Maintain Electron security defaults on every new `BrowserWindow`.
