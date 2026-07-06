---
name: architecture
description: Splotch tech stack, file-by-file source map of web/src/, route table, and the canonical UI element glossary. Use when navigating unfamiliar parts of the codebase, deciding where new code belongs, or needing the proper name of a UI element.
---

# Splotch – Architecture

## Tech Stack

### Core Framework
- **[SvelteKit](https://kit.svelte.dev/)** — full-stack framework. Web target uses `adapter-netlify` (SSR + serverless functions). Native target uses `adapter-static` (fully static export bundled via Capacitor).
- **[Svelte 5](https://svelte.dev/)** — UI components with runes (`$state`, `$effect`, `$derived`) for reactivity. No legacy stores.
- **[TypeScript](https://www.typescriptlang.org/)** — strict typing across the whole codebase.
- **[Vite](https://vite.dev/)** — build tool. Injects three compile-time constants: `__APP_VERSION__`, `__BUILD_TIME__`, `__NATIVE_API_BASE__`.

### Native (Capacitor)
- **[Capacitor 8](https://capacitorjs.com/)** — wraps the static web export in an Android/iOS shell. The native build is triggered by `CAPACITOR=true` at build time; `web/svelte.config.js` and `web/vite.config.ts` both branch on this env var.
- **`@capacitor/network`** — detects online/offline state to show or hide the AI button on device.
- **`@capacitor/preferences`** — durable storage (UserDefaults/SharedPreferences) that backs up settings the WebView's localStorage might evict.
- **`@capacitor-community/media`** — saves drawings to the device photo library in a "Splotch" album.
- **`@aparajita/capacitor-secure-storage`** — stores the user's BYO Gemini API key securely on-device.

### AI
- **[`@google/genai`](https://ai.google.dev/)** — Gemini API client. Image generation runs server-side (Netlify function `/api/generate-image`) and is token-gated. Native apps call the hosted endpoint via `__NATIVE_API_BASE__`. The SDK is confined to the Gemini adapter behind the provider-agnostic `AiImageProvider` seam in `lib/server/ai/` (ADR-0047) — routes never import it.

### Build & PWA
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — service worker and offline support. Web-only; skipped entirely when `CAPACITOR=true` (the native shell provides equivalent offline capability).
- **[`@fontsource-variable/quicksand`](https://fontsource.org/fonts/quicksand)** — self-hosted variable font, bundled for offline use.
- **[`patch-package`](https://github.com/ds300/patch-package)** — applies a patch to fix `gradlew` invocation inside Capacitor on Windows (`patches/`).
- **[`cross-env`](https://github.com/kentcdodds/cross-env)** — cross-platform env var injection for the `CAPACITOR=true` build scripts.

### Testing
- **[Vitest](https://vitest.dev/) + happy-dom** — unit tests for pure logic and state modules (`npm run test:unit`).
- **[Playwright](https://playwright.dev/)** — E2E web tests against the production build (`npm run test:e2e`).
- **[Maestro](https://maestro.mobile.dev/)** — Android smoke test that boots a real emulator and asserts the UI renders (`npm run test:android`). See the `testing` skill.

---

## Source Map

### `web/src/lib/`

| Path | Purpose |
|---|---|
| `drawing/engine.ts` | Imperative canvas engine. Owns the `<canvas>`, the undo baseline + command log (ADR-0033/0034), and all pointer tracking. Components connect via callbacks (`onDrawSound`, `onUndoStateChange`, etc.) and direct calls (`setColor`, `setStrokeWidth`, `clearCanvas`). |
| `drawing/strokeMath.ts` | Pure gesture math (edge-swipe guards, pointer-resume detection, stroke speed) factored out of the engine for unit testing. |
| `drawing/strokeSimplify.ts` | Pure stroke-simplification geometry (ADR-0036): RDP, corner/bulge analysis, and the sample/spline reconstruction pipelines the engine runs at commit. Unit-tested; the engine owns the tunables. |
| `drawing/overlay.ts` | Manages the coloring-book overlay image rendered behind the drawing layer. |
| `drawing/saveOnDelete.ts` | Saves the current drawing to the gallery before clearing, when the setting is enabled. |
| `drawing/screenshot.ts` | Persists canvas PNGs (exported via `engine.exportCanvasBlob`): on native, saves to the photo library; on web, triggers a download. `saveScreenshot` also plays the polaroid animation. |
| `state/canvas.svelte.ts` | Thin `$state` object bridging the imperative engine's callbacks (`canUndo`, `canvasEmpty`) into Svelte reactivity. |
| `state/colors.svelte.ts` | Active color selection and the full palette. |
| `state/strokeWidth.svelte.ts` | Stroke width levels and eraser size multiplier. |
| `state/tool.svelte.ts` | Active tool (pen vs. eraser). |
| `state/settings.svelte.ts` | User-configurable toggles (sounds, save-on-delete, screenshot button, coloring books, etc.), persisted via `storage.ts`. |
| `state/layout.svelte.ts` | Viewport and orientation state. |
| `state/fullscreen.svelte.ts` | Immersive-fullscreen support + active state and the toggle action, backing the Fullscreen Toggle button. Android web only; dismisses the mobile URL bar. |
| `state/network.svelte.ts` | Online/offline state via `@capacitor/network`. Controls AI button visibility on native. |
| `state/install.svelte.ts` | PWA install state (ADR-0039). Captures Chromium's `beforeinstallprompt` for one-tap install, falls back to iOS/Android guided hints; drives the Install Banner and the Parent Center Setup tab. Web-only; inert in the native shell. |
| `state/coloringBook.svelte.ts` | Selected coloring book and page. |
| `state/books.ts` | Static catalog of available coloring books and pages. |
| `actions/dragToClear.ts` | Svelte action that implements the drag-to-clear gesture (pointer tracking, threshold detection, animations). Keeps all gesture logic out of the component. |
| `actions/modalDialog.svelte.ts` | Svelte action wrapping the native `<dialog>` element with open/close state management. |
| `components/` | Svelte UI components. Each component owns its scoped styles. |
| `ai/styles.ts` | AI style presets (names, prompts, icons) for the image-generation picker. |
| `api.ts` | Single helper (`apiUrl`) that prefixes paths with `__NATIVE_API_BASE__` on native, or leaves them relative on web. |
| `audio/drawingSound.ts` | Plays pencil-scratch audio while drawing via Web Audio: MP3s are decoded once into `AudioBuffer`s, each stroke plays a looping `AudioBufferSourceNode` through a `GainNode`, and pointer speed modulates the gain (ramped to avoid clicks). |
| `colorRing.ts` | Computes the selection-ring color for palette swatches (slightly darker than the swatch, or lighter for very dark colors). The honeycomb layout itself is pure CSS in `ColorPicker.svelte`. |
| `platform.ts` | `isNative()` and `getPlatform()` — reads the Capacitor global without importing `@capacitor/core`, so the module is safe to evaluate during SSR. |
| `storage.ts` | Dual-layer storage: synchronous reads from `localStorage` (fast, no async flash); on native, every write is also mirrored to Capacitor Preferences for durability. `hydrateDurableStorage()` restores settings on app launch. |
| `secureStorage.ts` | Named client-held secrets (BYO Gemini key, admin session token): Keychain/Keystore via `@aparajita/capacitor-secure-storage` on native, AES-GCM-encrypted IndexedDB on web. |
| `orientation.ts` | Device orientation detection utilities. |
| `pwa/updates.ts` | Checks for PWA service worker updates and auto-applies them (with a reload) only while the canvas is blank; otherwise the update activates on next launch. |
| `server/ai/provider.ts` | Server-only: the provider-agnostic AI seam (ADR-0047) — the `AiImageProvider` interface (prompt + drawing in; image \| refusal \| error out) and the active-provider export. The only AI module routes may import. |
| `server/ai/gemini.ts` | Server-only: the Gemini `AiImageProvider` adapter — the sole runtime importer of `@google/genai`. Owns the model ids, the toddler-safety `systemInstruction` + `safetySettings`, and the call itself. |
| `server/ai/geminiSafety.ts` | Server-only: pure classifier splitting a Gemini response/error into image vs safety refusal vs empty (ADR-0023). Standalone dependency-free module because the asset scripts import it via `--experimental-strip-types`. |
| `server/tokens.ts` | Server-only: validates and manages AI access tokens (stored in Netlify Blobs). |
| `server/admin.ts` | Server-only: admin auth core (secret check, derived session token, invite building) shared by the `/admin` page actions and the `/api/admin/*` endpoints. |
| `server/rateLimit.ts` | Server-only: per-token rate limiting for the image generation endpoint. |
| `icons/` | SVG icon assets. `npm run gen:icons` generates `components/icon-names.d.ts` from them — the typed `IconName` union used by `<Icon>`. `<Icon>` inlines the raw SVG via `{@html}` (so the icon name lives only in a `data-icon` attribute, not the SVG), which means dynamic icons carry a hydration caveat — see `.claude/rules/svelte.md`. |
| `releases.json` | Auto-generated from `releases/*.md` by `npm run gen:releases`; consumed by the About tab in Parent Center. |

### `web/src/routes/`

Rendering mode is set per route via `prerender`/`ssr` page options; the site-wide
default is `prerender = true` in `+layout.ts`, and specific routes opt out. **Render**
below: **SSG** = prerendered to static HTML at build time (served from the CDN / baked
into the native bundle; the SSR function never runs for it); **SSR** = rendered per
request by the `sveltekit-render` Netlify function. See **ADR-0040** for the split and
why `/` deliberately stays SSG (it has no per-request personalization — user
preferences hydrate client-side from `localStorage`, orientation from CSS media
queries + the head-script stamp in `app.html`).

| Route | Render | Description |
|---|---|---|
| `/` | SSG | Main app (drawing canvas, palette, controls). Prerendered shell, SPA client — all user state hydrates client-side. |
| `/api/generate-image` | SSR | Serverless function (Netlify). Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image. Token-gated + rate-limited. Not bundled for native. |
| `/api/verify-access-code` | SSR | Validates an invite token string. |
| `/api/verify-key` | SSR | Validates a user-supplied Gemini API key (BYO Key flow). |
| `/api/admin/*` | SSR | JSON twin of the `/admin` console for the native apps (bearer-session auth). See the `api` skill. Not bundled for native — the apps call the hosted endpoints. |
| `/admin` | SSR | Token management console (`prerender = false` — cookie-authenticated form actions). Not bundled for native. |
| `/admin/native` | SSG | Static, prerendered variant of the console for the native apps; manages the same tokens through `/api/admin/*`. |
| `/privacy` | SSG | Static privacy policy page. |
| `/dev/engine` | SSR | Drawing engine test harness — blank canvas with debug controls. `prerender = false`; unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`. |
| `/dev/ai-timer` | SSR | AI generation timer — exercises the full round-trip with timing display. `prerender = false`; used by Playwright E2E specs. Unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`. |

---

## UI Elements

> **Layout notes (read before positioning a new control):**
> * The **Color Palette** is orientation-asymmetric (`ColorPalette.svelte`): a full-width **row along the top edge** in portrait, a **column down the left edge** in landscape (single- or two-column depending on height). So a "top-left corner" is *not* free space — it's under the first swatch in one orientation.
> * **Float canvas-overlay controls inside `.canvas-container`** (`DrawingCanvas.svelte`, `position: relative`), using `position: absolute`, rather than a fixed viewport corner — that container already tracks the drawing area across orientations. The **Fullscreen Toggle** (`top: 8px; left: 8px; z-index: 4`) is the reference example.
> * **Bottom edge is contested**: the **Parent Help Button** (`#parentHelpButton`, `z-index: 900`, bottom-right, `ParentCenter.svelte`) and the **Actions Panel** flyouts (`z-index: 901`, bottom-left, `ActionsPanel.svelte`) share it and collide on small viewports — a bug that's invisible from either file alone. Check both when changing sizes or breakpoints down there.

* **Color Palette** - Container bar holding all color swatches. **Top-edge row in portrait, left-edge column in landscape** (`ColorPalette.svelte`) — see Layout notes above.
  * **Color Swatch** - Individual circular color selection button
    * **Selection Ring** - Colored ring indicator around the active color swatch
* **Gradient Swatch** - Last color button with rainbow gradient and + symbol; opens custom color picker
  * **Color Picker Overlay** - Full-screen modal with blurred backdrop for selecting custom colors
  * **Hexagon Grid** - Honeycomb pattern of color tiles in the color picker
  * **Color Hexagon** - Individual hexagon-shaped color tile; drag across to explore, lift to select
* **Drawing Canvas** - Main touch-responsive drawing surface
* **Fullscreen Toggle** - Subtle top-left button that enters/exits immersive fullscreen to dismiss the mobile URL bar a non-scrolling canvas can never scroll away; the icon flips between expand and minimize. Opt-in only (never auto-triggered, so the chrome flicker is user-initiated) and shown on Android web browsers only — iOS Safari has no element fullscreen and the native shell is already fullscreen. See `docs/COMPATIBILITY.md`.
* **Notch Band** - Thin strip filling the device's top safe-area inset (the notch / hole-punch area behind the system clock), painted with the active drawing color and cleared to paper-white on the eraser. Hidden on devices without a real cutout (bezel iPads). See ADR-0026.
* **Clear Button** - Floating trash button for clearing the canvas
  * **Clear Preview Line** - Torn paper edge visual indicator showing where canvas will be cleared during drag
  * **Clear Accept Zone** - Bottom 15% of screen that turns red; drop Clear Button here to confirm
  * **Page Turn Overlay** - White overlay animation that sweeps across when clearing
* **Actions Panel** - Bottom-corner panel hosting auxiliary controls
  * **Undo Button** - Reverts the last drawing stroke
  * **Screenshot Button** - Saves the current drawing as a PNG (toggle in Parent Center)
  * **Stroke Width Button** - Opens a flyout for selecting line thickness (toggle in Parent Center)
  * **Coloring Book Button** - Opens the Coloring Book Picker (toggle in Parent Center)
  * **Magic Brush Button** (`#magicBrushButton`) - Toggles the magic brush; shown only while a coloring page is applied. Painting reveals that page's colored twin (`.color.webp`) where the child strokes — a `magic`-flagged op in the command log whose paint is a `CanvasPattern` of the twin, so undo/eraser/override are free (ADR-0043).
* **Coloring Book Picker** - Modal dialog for choosing a coloring page to use as a canvas overlay
  * **Coloring Book Grid** - First menu showing each coloring book by its cover image
  * **Coloring Book Tile** - Individual book cover button; tap to open that book's pages
  * **Coloring Page Grid** - Second menu showing the 6 selectable coloring pages in a book
  * **Coloring Page Tile** - Individual coloring page; tap to apply it as the canvas overlay
  * **Coloring Page Overlay** - Selected page rendered behind the drawing canvas with multiply blend, so white areas blend into the paper background and the line art stays visible
* **Install Banner** - Friendly bottom-center pill prompting "Add Splotch to your home screen", shown on web after the child has drawn a few strokes. One-tap native install on Chromium/Android; guided Share-sheet hint on iOS. Dismissible and remembered. See ADR-0039.
* **Parent Help Button** - Floating button that opens the Parent Center
  * **Parent Center** - Modal with platform install guides and app settings
    * **Install Guide** - iOS / Android tabs with step-by-step PWA setup, plus the one-tap install button when the browser supports it (Setup tab)
    * **Settings** - Tab for app preferences (Drawing Sounds, Save on Delete, Screenshot Button, Stroke Width Control, Coloring Books). Under Advanced Controls, a **Button Size** slider rescales the Actions Panel buttons; dragging it hides the rest of the Parent Center so the buttons resize in full view.
