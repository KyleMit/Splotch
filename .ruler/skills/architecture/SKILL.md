---
name: architecture
description: Splotch tech stack, file-by-file source map of web/src/, route table, and the canonical UI element glossary. Use when navigating unfamiliar parts of the codebase, deciding where new code belongs, or needing the proper name of a UI element.
---

# Splotch – Architecture

## Tech Stack

### Core Framework

* **[SvelteKit](https://kit.svelte.dev/)** — full-stack framework. Web target uses `adapter-netlify`
  (SSR + serverless functions). Native target uses `adapter-static` (fully static export bundled via
  Capacitor).
* **[Svelte 5](https://svelte.dev/)** — UI components with runes (`$state`, `$effect`, `$derived`)
  for reactivity. No legacy stores.
* **[TypeScript](https://www.typescriptlang.org/)** — strict typing across the whole codebase.
* **[Vite](https://vite.dev/)** — build tool. Injects three compile-time constants:
  `__APP_VERSION__`, `__BUILD_TIME__`, `__NATIVE_API_BASE__`.

### Native (Capacitor)

* **[Capacitor 8](https://capacitorjs.com/)** — wraps the static web export in an Android/iOS shell.
  The native build is triggered by `CAPACITOR=true` at build time; `web/svelte.config.js` and
  `web/vite.config.ts` both branch on this env var.
* **`@capacitor/network`** — detects online/offline state to show or hide the AI button on device.
* **`@capacitor/preferences`** — durable storage (UserDefaults/SharedPreferences) that backs up
  settings the WebView's localStorage might evict.
* **`@capacitor-community/media`** — saves drawings to the device photo library in a "Splotch"
  album.
* **`@aparajita/capacitor-secure-storage`** — stores the user's BYO Gemini API key securely
  on-device.

### AI

* **[`@google/genai`](https://ai.google.dev/)** — Gemini API client. Image generation runs
  server-side (Netlify function `/api/generate-image`) and is token-gated. Native apps call the
  hosted endpoint via `__NATIVE_API_BASE__`. The SDK is confined to the Gemini adapter behind the
  provider-agnostic `AiImageProvider` seam in `lib/server/ai/` (ADR-0047) — routes never import it.

### Build & PWA

* **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — service worker and offline support.
  Web-only; skipped entirely when `CAPACITOR=true` (the native shell provides equivalent offline
  capability).
* **[`@fontsource-variable/quicksand`](https://fontsource.org/fonts/quicksand)** — self-hosted
  variable font, bundled for offline use.

### Testing

* **[Vitest](https://vitest.dev/) + happy-dom** — unit tests for pure logic and state modules
  (`npm run test:unit`).
* **[Playwright](https://playwright.dev/)** — E2E web tests against the production build
  (`npm run test:e2e`).
* **[Maestro](https://maestro.mobile.dev/)** — Android smoke test that boots a real emulator and
  asserts the UI renders (`npm run test:android`). See the `testing` skill.

---

## Source Map

### `web/src/lib/`

| Path                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawing/engine.ts`             | Imperative canvas engine — the facade and orchestrator (ADR-0004). Owns the `<canvas>`, the paper coordinate space, all pointer tracking (with the WebKit pen quirks and edge-swipe guards), and the whole public API; delegates ops/undo/simplification/export to the sibling modules below. Components connect via callbacks (`onDrawSound`, `onUndoStateChange`, etc.) and direct calls (`setColor`, `setStrokeWidth`, `clearCanvas`). |
| `drawing/strokeOps.ts`          | The engine's op vocabulary (`StrokeOp`, `StrokeGroupCommand`) and the single `renderOp()` renderer every surface shares, so live drawing and undo/resize/export replay are bit-identical (ADR-0033).                                                                                                                                                                                                                                      |
| `drawing/crayonBrush.ts`        | Crayon pen tip (ADR-0065): the deterministic paper-tooth texture (seamless value-noise fBm → alpha-only transfer, per-color tinted tile + pattern caches) and `CrayonPassTracker`, the pure geometry that splits a gesture into swept deposition passes at reversals/re-entries so true overdraw builds up while frame boundaries never double-deposit. Unit-tested.                                                                      |
| `drawing/undoHistory.ts`        | Undo history: the baseline raster + bounded command log + cumulative keyframes (ADR-0033/0035). Deliberately module-level so the drawing survives the engine's teardown/init across client-side navigation (ADR-0004).                                                                                                                                                                                                                    |
| `drawing/commandSimplify.ts`    | Commit-time simplification orchestration (ADR-0036): regroups a multi-touch command's interleaved ops per finger, splits continuous same-style runs, and reduces each through `strokeSimplify.ts`. Owns the tunables + the dev-sweep seam. Unit-tested.                                                                                                                                                                                   |
| `drawing/emptyScan.ts`          | Cheap blank-canvas detection on a small CPU-side scratch canvas (keeps `willReadFrequently` off the main canvas).                                                                                                                                                                                                                                                                                                                         |
| `drawing/exportDrawing.ts`      | Composes the shareable PNG (paper white + texture + strokes rebuilt from history + coloring-page overlay) and owns the paper-texture loader.                                                                                                                                                                                                                                                                                              |
| `drawing/strokeMath.ts`         | Pure gesture math (edge-swipe guards, pointer-resume detection, stroke speed) factored out of the engine for unit testing.                                                                                                                                                                                                                                                                                                                |
| `drawing/strokeSimplify.ts`     | Pure stroke-simplification geometry (ADR-0036): RDP, corner/bulge analysis, and the sample/spline reconstruction pipelines run at commit. Unit-tested; `commandSimplify.ts` owns the tunables.                                                                                                                                                                                                                                            |
| `drawing/paperView.ts`          | Pure paper-view geometry (ADR-0050): the upright contain-fit + center transform (matrix/inverse forms) that presents the rotation-locked "paper" — the space ops are recorded in — inside a rotated viewport. The engine owns the paper state and applies the view; `DrawingCanvas.svelte` reuses `viewMatrix` to position the overlay wrapper.                                                                                           |
| `drawing/overlay.ts`            | Manages the coloring-book overlay image rendered behind the drawing layer.                                                                                                                                                                                                                                                                                                                                                                |
| `drawing/saveOnDelete.ts`       | Saves the current drawing to the gallery before clearing, when the setting is enabled.                                                                                                                                                                                                                                                                                                                                                    |
| `drawing/screenshot.ts`         | Persists canvas PNGs (exported via `engine.exportCanvasBlob`): on native, saves to the photo library; on web, triggers a download. `saveScreenshot` also plays the polaroid animation.                                                                                                                                                                                                                                                    |
| `state/canvas.svelte.ts`        | Thin `$state` object bridging the imperative engine's callbacks (`canUndo`, `canvasEmpty`) into Svelte reactivity.                                                                                                                                                                                                                                                                                                                        |
| `state/colors.svelte.ts`        | Active color selection and the full palette.                                                                                                                                                                                                                                                                                                                                                                                              |
| `state/strokeWidth.svelte.ts`   | Stroke width levels and eraser size multiplier.                                                                                                                                                                                                                                                                                                                                                                                           |
| `state/tool.svelte.ts`          | Active tool (pen, eraser, magic brush) plus the crayon pen-tip latch (ADR-0065) that survives color picks and eraser/magic detours.                                                                                                                                                                                                                                                                                                       |
| `state/settings.svelte.ts`      | User-configurable toggles (sounds, save-on-delete, screenshot button, coloring books, etc.) plus the appearance setting (light/dark/system), persisted via `storage.ts`.                                                                                                                                                                                                                                                                  |
| `state/appearance.svelte.ts`    | Reactive *resolved* theme ('light' \| 'dark'): the appearance setting combined with the live OS preference. For the few JS consumers of the resolved value (Notch Band paper color, export paper fill); CSS reads the `app.css` tokens instead.                                                                                                                                                                                           |
| `state/layout.svelte.ts`        | Viewport and orientation state.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `state/fullscreen.svelte.ts`    | Immersive-fullscreen support + active state and the toggle action, backing the Fullscreen Toggle button. Android web only; dismisses the mobile URL bar.                                                                                                                                                                                                                                                                                  |
| `state/network.svelte.ts`       | Online/offline state via `@capacitor/network`. Controls AI button visibility on native.                                                                                                                                                                                                                                                                                                                                                   |
| `state/install.svelte.ts`       | PWA install state (ADR-0039). Captures Chromium's `beforeinstallprompt` for one-tap install, falls back to iOS/Android guided hints; drives the Install Banner and the Parent Center Setup Guide section. Web-only; inert in the native shell.                                                                                                                                                                                            |
| `state/coloringBook.svelte.ts`  | Selected coloring book and page.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `state/books.ts`                | Static catalog of available coloring books and pages.                                                                                                                                                                                                                                                                                                                                                                                     |
| `actions/dragToClear.ts`        | Svelte action that implements the drag-to-clear gesture (pointer tracking, threshold detection, animations). Keeps all gesture logic out of the component.                                                                                                                                                                                                                                                                                |
| `actions/modalDialog.svelte.ts` | Svelte action wrapping the native `<dialog>` element with open/close state management.                                                                                                                                                                                                                                                                                                                                                    |
| `components/`                   | Svelte UI components. Each component owns its scoped styles.                                                                                                                                                                                                                                                                                                                                                                              |
| `ai/styles.ts`                  | AI style presets (names, prompts, icons) for the image-generation picker.                                                                                                                                                                                                                                                                                                                                                                 |
| `api.ts`                        | Single helper (`apiUrl`) that prefixes paths with `__NATIVE_API_BASE__` on native, or leaves them relative on web.                                                                                                                                                                                                                                                                                                                        |
| `audio/drawingSound.ts`         | Plays pencil-scratch audio while drawing via Web Audio: MP3s are decoded once into `AudioBuffer`s, each stroke plays a looping `AudioBufferSourceNode` through a `GainNode`, and pointer speed modulates the gain (ramped to avoid clicks).                                                                                                                                                                                               |
| `colorRing.ts`                  | Computes the selection-ring color for palette swatches (slightly darker than the swatch, or lighter for very dark colors).                                                                                                                                                                                                                                                                                                                |
| `hexPickerLayout.ts`            | The color picker's 9×9 palette (9 hue families × 9 shades) and its two static honeycomb arrangements — portrait (families as rows) and the landscape transpose (families as columns). `ColorPicker.svelte` renders both grids; CSS media queries pick one per orientation and trim positionally so the constrained axis drops shades, never hues (ADR-0048).                                                                              |
| `platform.ts`                   | `isNative()` and `getPlatform()` — reads the Capacitor global without importing `@capacitor/core`, so the module is safe to evaluate during SSR.                                                                                                                                                                                                                                                                                          |
| `theme.ts`                      | Light/dark/system appearance plumbing: stamps `data-theme` on `<html>` (absent = system, so the `prefers-color-scheme` CSS in `app.css` drives it), keeps the `theme-color` meta on the resolved theme, and watches OS switches in system mode. The setting itself lives in `state/settings.svelte.ts`; the pre-paint stamp in `app.html` mirrors this convention.                                                                        |
| `storage.ts`                    | Dual-layer storage: synchronous reads from `localStorage` (fast, no async flash); on native, every write is also mirrored to Capacitor Preferences for durability. `hydrateDurableStorage()` restores settings on app launch.                                                                                                                                                                                                             |
| `secureStorage.ts`              | Named client-held secrets (BYO Gemini key, admin session token): Keychain/Keystore via `@aparajita/capacitor-secure-storage` on native, AES-GCM-encrypted IndexedDB on web.                                                                                                                                                                                                                                                               |
| `orientation.ts`                | Device orientation detection utilities.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pwa/updates.ts`                | Checks for PWA service worker updates and auto-applies them (with a reload) only while the canvas is blank; otherwise the update activates on next launch.                                                                                                                                                                                                                                                                                |
| `server/ai/provider.ts`         | Server-only: the provider-agnostic AI seam (ADR-0047) — the `AiImageProvider` interface (prompt + drawing in; image \| refusal \| error out) and the active-provider export. The only AI module routes may import.                                                                                                                                                                                                                        |
| `server/ai/gemini.ts`           | Server-only: the Gemini `AiImageProvider` adapter — the sole runtime importer of `@google/genai`. Owns the model ids, the toddler-safety `systemInstruction` + `safetySettings`, and the call itself.                                                                                                                                                                                                                                     |
| `server/ai/geminiSafety.ts`     | Server-only: pure classifier splitting a Gemini response/error into image vs safety refusal vs empty (ADR-0023). Standalone dependency-free module because the asset scripts import it via `--experimental-strip-types`.                                                                                                                                                                                                                  |
| `server/tokens.ts`              | Server-only: validates and manages AI access tokens (stored in Netlify Blobs).                                                                                                                                                                                                                                                                                                                                                            |
| `server/admin.ts`               | Server-only: admin auth core (secret check, derived session token, invite building) shared by the `/admin` page actions and the `/api/admin/*` endpoints.                                                                                                                                                                                                                                                                                 |
| `server/rateLimit.ts`           | Server-only: per-token rate limiting for the image generation endpoint.                                                                                                                                                                                                                                                                                                                                                                   |
| `icons/`                        | SVG icon assets. `npm run gen:icons` generates `components/icon-names.d.ts` from them — the typed `IconName` union used by `<Icon>`. `<Icon>` inlines the raw SVG via `{@html}` (so the icon name lives only in a `data-icon` attribute, not the SVG), which means dynamic icons carry a hydration caveat — see `.claude/rules/svelte.md`.                                                                                                |
| `releases.json`                 | Auto-generated from `releases/*.md` by `npm run gen:releases`; consumed by the What's New section in Parent Center (drill-in header "Updates"; dated release cards, no version numbers).                                                                                                                                                                                                                                                  |

### `web/src/routes/`

Rendering mode is set per route via `prerender`/`ssr` page options; the site-wide default is
`prerender = true` in `+layout.ts`, and specific routes opt out. **Render** below: **SSG** =
prerendered to static HTML at build time (served from the CDN / baked into the native bundle; the
SSR function never runs for it); **SSR** = rendered per request by the `sveltekit-render` Netlify
function. See **ADR-0040** for the split and why `/` deliberately stays SSG (it has no per-request
personalization — user preferences hydrate client-side from `localStorage`, orientation from CSS
media queries + the head-script stamp in `app.html`).

| Route                     | Render | Description                                                                                                                                                               |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | SSG    | Main app (drawing canvas, palette, controls). Prerendered shell, SPA client — all user state hydrates client-side.                                                        |
| `/api/generate-image`     | SSR    | Serverless function (Netlify). Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image. Token-gated + rate-limited. Not bundled for native.        |
| `/api/verify-access-code` | SSR    | Validates an invite token string.                                                                                                                                         |
| `/api/verify-key`         | SSR    | Validates a user-supplied Gemini API key (BYO Key flow).                                                                                                                  |
| `/api/admin/*`            | SSR    | JSON twin of the `/admin` console for the native apps (bearer-session auth). See the `api` skill. Not bundled for native — the apps call the hosted endpoints.            |
| `/admin`                  | SSR    | Token management console (`prerender = false` — cookie-authenticated form actions). Not bundled for native.                                                               |
| `/admin/native`           | SSG    | Static, prerendered variant of the console for the native apps; manages the same tokens through `/api/admin/*`.                                                           |
| `/privacy`                | SSG    | Static privacy policy page.                                                                                                                                               |
| `/dev/engine`             | SSR    | Drawing engine test harness — blank canvas with debug controls. `prerender = false`; unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`.                                        |
| `/dev/ai-timer`           | SSR    | AI generation timer — exercises the full round-trip with timing display. `prerender = false`; used by Playwright E2E specs. Unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`. |

---

## UI Elements

> **Layout notes (read before positioning a new control):**
>
> * The **Color Palette** is orientation-asymmetric (`ColorPalette.svelte`): a full-width **row
>   along the top edge** in portrait, a **column down the left edge** in landscape (single- or
>   two-column depending on height). So a "top-left corner" is *not* free space — it's under the
>   first swatch in one orientation.
> * **Float canvas-overlay controls inside `.canvas-container`** (`DrawingCanvas.svelte`,
>   `position: relative`), using `position: absolute`, rather than a fixed viewport corner — that
>   container already tracks the drawing area across orientations. The **Fullscreen Toggle**
>   (`top: 8px; left: 8px; z-index: 4`) is the reference example.
> * **Bottom edge is contested**: the **Parent Help Button** (`#parentHelpButton`, `z-index: 900`,
>   bottom-right, `ParentHelpButton.svelte`) and the **Actions Panel** flyouts (`z-index: 901`,
>   bottom-left, `ActionsPanel.svelte`) share it and collide on small viewports — a bug that's
>   invisible from either file alone. Check both when changing sizes or breakpoints down there.

* **Color Palette** - Container bar holding all color swatches. **Top-edge row in portrait,
  left-edge column in landscape** (`ColorPalette.svelte`) — see Layout notes above.
  * **Color Swatch** - Individual circular color selection button
    * **Selection Ring** - Colored ring indicator around the active color swatch
* **Gradient Swatch** - Last color button, a honeycomb of palette-color hexagons (the `more-colors`
  icon) on the bar surface; opens custom color picker
  * **Color Picker Overlay** - Full-screen modal with blurred backdrop for selecting custom colors
  * **Hexagon Grid** - Honeycomb pattern of color tiles in the color picker
  * **Color Hexagon** - Individual hexagon-shaped color tile; drag across to explore, lift to select
* **Drawing Canvas** - Main touch-responsive drawing surface
* **Fullscreen Toggle** - Subtle top-left button that enters/exits immersive fullscreen to dismiss
  the mobile URL bar a non-scrolling canvas can never scroll away; the icon flips between expand and
  minimize. Opt-in only (never auto-triggered, so the chrome flicker is user-initiated) and shown on
  Android web browsers only — iOS Safari has no element fullscreen and the native shell is already
  fullscreen. See `docs/COMPATIBILITY.md`.
* **Notch Band** - Thin strip filling the device's top safe-area inset (the notch / hole-punch area
  behind the system clock), painted with the active drawing color and cleared to paper-white on the
  eraser. Hidden on devices without a real cutout (bezel iPads). See ADR-0026.
* **Clear Button** - Floating trash button for clearing the canvas
  * **Clear Preview Line** - Torn paper edge visual indicator showing where canvas will be cleared
    during drag
  * **Clear Accept Zone** - Bottom 15% of screen that turns red; drop Clear Button here to confirm
  * **Page Turn Overlay** - White overlay animation that sweeps across when clearing
* **Actions Panel** - Bottom-corner panel hosting auxiliary controls
  * **Undo Button** - Reverts the last drawing stroke
  * **Screenshot Button** - Saves the current drawing as a PNG (toggle in Parent Center)
  * **Stroke Width Button** - Opens a flyout for selecting line thickness (toggle in Parent Center)
  * **Coloring Book Button** - Opens the Coloring Book Picker (toggle in Parent Center)
  * **Crayon Button** (`#crayonButton`) - Toggles the wax-crayon pen tip (ADR-0065): swept
    deposition passes over a paper-anchored tooth pattern, 1.5× the pen's width. A latched tip
    style, not a separate tool — it survives color picks, and eraser/magic detours return to it.
    Always shown.
  * **Magic Brush Button** (`#magicBrushButton`) - Toggles the magic brush; shown only while a
    coloring page is applied. Painting reveals that page's colored fill (`.light.webp`) where the
    child strokes — a `magic`-flagged op in the command log whose paint is a `CanvasPattern` of the
    fill, so undo/eraser/override are free (ADR-0043).
* **Coloring Book Picker** - Modal dialog for choosing a coloring page to use as a canvas overlay
  * **Coloring Book Grid** - First menu showing each coloring book by its cover image
  * **Coloring Book Tile** - Individual book cover button; tap to open that book's pages
  * **Coloring Page Grid** - Second menu showing the 6 selectable coloring pages in a book
  * **Coloring Page Tile** - Individual coloring page; tap to apply it as the canvas overlay
  * **Coloring Page Overlay** - Selected page rendered behind the drawing canvas with multiply
    blend, so white areas blend into the paper background and the line art stays visible. Lives
    inside the **Paper View** wrapper (`.paper-view`, `DrawingCanvas.svelte`): full-container
    normally, but after a device rotation with ink on the canvas it contain-fits the locked paper
    upright and centered (ADR-0050) so the page and strokes move as one sheet — the tall/wide art
    variant is keyed off `canvasState.paperOrientation`, not the live viewport. The **Paper Sheet**
    (`.paper-sheet`, same transform) carries the off-white paper texture *beneath* the
    always-transparent canvas, so while rotated the original page reads as a distinct sheet (soft
    shadow, flat greyer container margins around it — no border); the margins remain fully drawable,
    and that ink crops on rotating back
* **Install Banner** - Friendly bottom-center pill prompting "Add Splotch to your home screen",
  shown on web after the child has drawn a few strokes. One-tap native install on Chromium/Android;
  guided Share-sheet hint on iOS. Dismissible and remembered. See ADR-0039.
* **Parent Help Button** - Floating button that opens the Parent Center
  * **Parent Center** - Modal for app settings, install guides, and about info. Its body is one flat
    list of **Sections** (ADR-0061), not tabs: Appearance & Display, Sound, Saving, Controls &
    Buttons, AI Art, Setup Guide, What's New (drilled-in header: "Updates"), Submit Feedback, About.
    Both shells render from the same `SECTIONS` list in `parent/sections.ts`, chosen by viewport
    width (`ParentCenter.svelte`): below ~700px a **Hub** list drills into a full-page section with
    a back arrow; at/above ~700px a persistent **Sidebar** (nav never scrolls) sits beside a
    scrolling content **Pane**. Each section component lives in `parent/` (`AppearanceSection`,
    `SoundSection`, `SavingSection`, `ControlsSection`, `AiKeyManager`, `SetupInstructions`,
    `WhatsNewSection`, `ReportForm`, `AboutSection`).
    * **Install Guide** - iOS / Android step-by-step PWA setup inside the **Setup Guide** section,
      plus the one-tap install button when the browser supports it
    * **Controls & Buttons Section** - Enable Advanced Controls toggle, a **Button Size** slider
      that rescales the Actions Panel buttons (dragging it melts the rest of the Parent Center away
      so the buttons resize in full view), and a 2-column **button chip grid** ("Show these
      buttons") that toggles each Actions Panel button on/off.
      * **Appearance Control** - Light / Dark / System segmented control at the top of the
        **Appearance & Display** section. Dark mode themes the chrome (app background, palette bar,
        modals, Install Banner), the paper (a near-black warm tone under the same low-alpha
        texture), and the paper-floating controls (Actions Panel/flyout on `--float-surface` with a
        `--float-border` edge; near-black ink gets a `--dark-ink-keyline` ring) via the tokens in
        `app.css`. **Coloring pages stay on the dark paper** — the line art inverts to white "chalk"
        lines via `--lineart-filter`/`--lineart-blend`, and the magic brush reveals a parallel set
        of pre-colored **night fills** (`{page}-{orient}.night.webp`; light fill in light mode,
        night fill in dark, picked by `resolvedTheme()`, falling back to the light fill where a
        night asset isn't generated yet). Exports follow the resolved theme (a dark save is the
        night version). Only the Clear Button keeps its literal red chrome. System (the default)
        follows the OS via `prefers-color-scheme` with no `data-theme` attribute stamped. See
        ADR-0052.
