# Splotch – Architecture

## Tech Stack

### Core Framework
- **[SvelteKit](https://kit.svelte.dev/)** — full-stack framework. Web target uses `adapter-netlify` (SSR + serverless functions). Native target uses `adapter-static` (fully static export bundled via Capacitor).
- **[Svelte 5](https://svelte.dev/)** — UI components with runes (`$state`, `$effect`, `$derived`) for reactivity. No legacy stores.
- **[TypeScript](https://www.typescriptlang.org/)** — strict typing across the whole codebase.
- **[Vite](https://vite.dev/)** — build tool. Injects three compile-time constants: `__APP_VERSION__`, `__BUILD_TIME__`, `__NATIVE_API_BASE__`.

### Native (Capacitor)
- **[Capacitor 8](https://capacitorjs.com/)** — wraps the static web export in an Android/iOS shell. The native build is triggered by `CAPACITOR=true` at build time; `svelte.config.js` and `vite.config.ts` both branch on this env var.
- **`@capacitor/network`** — detects online/offline state to show or hide the AI button on device.
- **`@capacitor/preferences`** — durable storage (UserDefaults/SharedPreferences) that backs up settings the WebView's localStorage might evict.
- **`@capacitor-community/media`** — saves drawings to the device photo library in a "Splotch" album.
- **`@aparajita/capacitor-secure-storage`** — stores the user's BYO Gemini API key securely on-device.

### AI
- **[`@google/genai`](https://ai.google.dev/)** — Gemini API client. Image generation runs server-side (Netlify function `/api/generate-image`) and is token-gated. Native apps call the hosted endpoint via `__NATIVE_API_BASE__`.

### Build & PWA
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — service worker and offline support. Web-only; skipped entirely when `CAPACITOR=true` (the native shell provides equivalent offline capability).
- **[`@fontsource-variable/quicksand`](https://fontsource.org/fonts/quicksand)** — self-hosted variable font, bundled for offline use.
- **[`patch-package`](https://github.com/ds300/patch-package)** — applies a patch to fix `gradlew` invocation inside Capacitor on Windows (`patches/`).
- **[`cross-env`](https://github.com/kentcdodds/cross-env)** — cross-platform env var injection for the `CAPACITOR=true` build scripts.

### Testing
- **[Vitest](https://vitest.dev/) + happy-dom** — unit tests for pure logic and state modules (`npm run test:unit`).
- **[Playwright](https://playwright.dev/)** — E2E web tests against the production build (`npm run test:e2e`).
- **[Maestro](https://maestro.mobile.dev/)** — Android smoke test that boots a real emulator and asserts the UI renders (`npm run test:android`). See [TESTING.md](TESTING.md).

---

## Source Map

### `src/lib/`

| Path | Purpose |
|---|---|
| `drawing/engine.ts` | Imperative canvas engine. Owns the `<canvas>`, virtual canvas (composite buffer), undo stack, and all pointer tracking. Components connect via callbacks (`onDrawSound`, `onUndoStateChange`, etc.) and direct calls (`setColor`, `setStrokeWidth`, `clearCanvas`). |
| `drawing/overlay.ts` | Manages the coloring-book overlay image rendered behind the drawing layer. |
| `drawing/saveOnDelete.ts` | Saves the current drawing to the gallery before clearing, when the setting is enabled. |
| `drawing/screenshot.ts` | Exports the canvas as a PNG blob. On native, saves to the photo library; on web, triggers a download. |
| `state/canvas.svelte.ts` | Thin `$state` object bridging the imperative engine's callbacks (`canUndo`, `canvasEmpty`) into Svelte reactivity. |
| `state/colors.svelte.ts` | Active color selection and the full palette. |
| `state/strokeWidth.svelte.ts` | Stroke width levels and eraser size multiplier. |
| `state/tool.svelte.ts` | Active tool (pen vs. eraser). |
| `state/settings.svelte.ts` | User-configurable toggles (sounds, save-on-delete, screenshot button, coloring books, etc.), persisted via `storage.ts`. |
| `state/layout.svelte.ts` | Viewport and orientation state. |
| `state/network.svelte.ts` | Online/offline state via `@capacitor/network`. Controls AI button visibility on native. |
| `state/coloringBook.svelte.ts` | Selected coloring book and page. |
| `state/books.ts` | Static catalog of available coloring books and pages. |
| `actions/dragToClear.ts` | Svelte action that implements the drag-to-clear gesture (pointer tracking, threshold detection, animations). Keeps all gesture logic out of the component. |
| `actions/modalDialog.svelte.ts` | Svelte action wrapping the native `<dialog>` element with open/close state management. |
| `components/` | Svelte UI components. Each component owns its scoped styles. |
| `ai/styles.ts` | AI style presets (names, prompts, icons) for the image-generation picker. |
| `api.ts` | Single helper (`apiUrl`) that prefixes paths with `__NATIVE_API_BASE__` on native, or leaves them relative on web. |
| `audio/drawingSound.ts` | Plays pencil-scratch audio while drawing; pauses/resumes based on pointer speed crossing a threshold. |
| `colorRing.ts` | Honeycomb color-ring layout math for the custom color picker. |
| `platform.ts` | `isNative()` and `getPlatform()` — reads the Capacitor global without importing `@capacitor/core`, so the module is safe to evaluate during SSR. |
| `storage.ts` | Dual-layer storage: synchronous reads from `localStorage` (fast, no async flash); on native, every write is also mirrored to Capacitor Preferences for durability. `hydrateDurableStorage()` restores settings on app launch. |
| `secureStorage.ts` | Thin wrapper around `@aparajita/capacitor-secure-storage` for the BYO API key. |
| `orientation.ts` | Device orientation detection utilities. |
| `pwa/updates.ts` | Detects and prompts for PWA service worker updates. |
| `server/tokens.ts` | Server-only: validates and manages AI access tokens (stored in Netlify Blobs). |
| `server/rateLimit.ts` | Server-only: per-token rate limiting for the image generation endpoint. |
| `icons/` | SVG icon assets. `icon-names.d.ts` is auto-generated by `npm run icons:types` and provides a typed `IconName` union used by `<Icon>`. |
| `releases.json` | Auto-generated from git tags by `npm run releases:gen`; consumed by the About tab in Parent Center. |

### `src/routes/`

| Route | Description |
|---|---|
| `/` | Main app (drawing canvas, palette, controls). Server-rendered layout, SPA client. |
| `/api/generate-image` | Serverless function (Netlify). Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image. Token-gated + rate-limited. Not bundled for native. |
| `/api/verify-access-code` | Validates an invite token string. |
| `/api/verify-key` | Validates a user-supplied Gemini API key (BYO Key flow). |
| `/admin` | Token management console (server-rendered, cookie-authenticated). Not bundled for native. |
| `/privacy` | Static privacy policy page. |
| `/dev/engine` | Drawing engine test harness — blank canvas with debug controls. Unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`. |
| `/dev/ai-timer` | AI generation timer — exercises the full round-trip with timing display. Used by Playwright E2E specs. Unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`. |

---

## UI Elements

* **Color Palette** - Container bar holding all color swatches
  * **Color Swatch** - Individual circular color selection button
    * **Selection Ring** - Colored ring indicator around the active color swatch
* **Gradient Swatch** - Last color button with rainbow gradient and + symbol; opens custom color picker
  * **Color Picker Overlay** - Full-screen modal with blurred backdrop for selecting custom colors
  * **Hexagon Grid** - Honeycomb pattern of color tiles in the color picker
  * **Color Hexagon** - Individual hexagon-shaped color tile; drag across to explore, lift to select
* **Drawing Canvas** - Main touch-responsive drawing surface
* **Clear Button** - Floating trash button for clearing the canvas
  * **Clear Preview Line** - Torn paper edge visual indicator showing where canvas will be cleared during drag
  * **Clear Accept Zone** - Bottom 15% of screen that turns red; drop Clear Button here to confirm
  * **Page Turn Overlay** - White overlay animation that sweeps across when clearing
* **Actions Panel** - Bottom-corner panel hosting auxiliary controls
  * **Undo Button** - Reverts the last drawing stroke
  * **Screenshot Button** - Saves the current drawing as a PNG (toggle in Parent Center)
  * **Stroke Width Button** - Opens a flyout for selecting line thickness (toggle in Parent Center)
  * **Coloring Book Button** - Opens the Coloring Book Picker (toggle in Parent Center)
* **Coloring Book Picker** - Modal dialog for choosing a coloring page to use as a canvas overlay
  * **Coloring Book Grid** - First menu showing each coloring book by its cover image
  * **Coloring Book Tile** - Individual book cover button; tap to open that book's pages
  * **Coloring Page Grid** - Second menu showing the 6 selectable coloring pages in a book
  * **Coloring Page Tile** - Individual coloring page; tap to apply it as the canvas overlay
  * **Coloring Page Overlay** - Selected page rendered behind the drawing canvas with multiply blend, so white areas blend into the paper background and the line art stays visible
* **Parent Help Button** - Floating button that opens the Parent Center
  * **Parent Center** - Modal with platform install guides and app settings
    * **Install Guide** - iOS / Android tabs with step-by-step PWA setup
    * **Settings** - Tab for app preferences (Drawing Sounds, Save on Delete, Screenshot Button, Stroke Width Control, Coloring Books)
