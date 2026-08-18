---
paths:
  - "web/src/**/*.svelte"
  - "web/src/**/*.svelte.ts"
---

# Svelte component rules

* Runes only (`$state`, `$derived`, `$effect`, `$props`). Never `writable`/`readable`/`derived` from
  `svelte/store` (ADR-0002).
* Mutable component-level state defaults to `$state`; a deliberately non-reactive `let` (timer
  handles, transition-time latches) carries a one-line comment saying it's intentionally untracked.
* Props that forward `...rest` extend the matching `svelte/elements` attributes type
  (`HTMLAttributes<...>`); index-signature prop bags are lint-banned.
* Shared state lives in `src/lib/state/*.svelte.ts`. Components read state and call setters; they
  never own shared state.
* Complex gestures and dialog wiring are Svelte actions in `src/lib/actions/` (see `dragToClear.ts`,
  `modalDialog.svelte.ts`), not inline component logic.
* The drawing engine (`src/lib/drawing/engine.ts`) is imperative by design (ADR-0004) and boots
  before hydration (ADR-0072): components **adopt** the running engine on mount
  (`adoptDrawingCanvas` attaches callbacks and replays state) and call its exported functions
  directly — don't wrap it in reactive stores. Never insert DOM into the prerendered `/` subtree
  before hydration (engine code included): Svelte bails to a full client re-render, silently
  replacing the live canvas.
* **Hot-path rule:** code reached per `pointermove`/`resize`/frame (the engine stroke path, gesture
  trackers, viewport sync) must not allocate arrays/objects, create or measure DOM, or make
  defensive lazy-init calls — hoist that work to `pointerdown`/init and verify with
  `npm run perf:*`. Bind only element refs something actually reads, and never into `$state` unless
  something reacts to them.
* Styles are scoped in the component's `<style>` block. No global CSS except genuine cross-component
  tokens; `:global()` only when a class is set imperatively (e.g. via `classList`).
* A value repeated 3+ times in a component's `<style>` (a duration, gradient, transition list)
  becomes a local custom property on the block's root selector (see `--drawer-transition` in
  `ActionsPanel.svelte`). Never `!important` to beat a sibling rule — fix specificity or ordering.
* A prop that renders help/explanatory text for a control must wire it to the control (`id` +
  `aria-describedby`) — axe does not flag the omission.
* New icons: drop the SVG in `src/lib/icons/`, run
  `npm run gen:icon-viewbox && npm run optimize:svg-assets` (imported artwork arrives on foreign
  grids — Material exports on `0 -960 960 960`; every icon must sit on the canonical
  `viewBox="0 0 1000 1000"`, enforced by `iconViewBox.test.ts` and pixel-verified by the rebase
  tool), then `npm run gen:icon-names`, and use `<Icon name="..." />` — the `name` prop is
  type-checked against the generated union. `<Icon>` sets `data-icon={name}` so the icon is
  assertable in tests (the SVG itself goes in via `{@html}` and carries no identity). A
  full-color/"spot" icon must also be added to the `COLOR_ICONS` set in `Icon.svelte` (so it gets
  the `icon-color` class instead of the monochrome tint filter) — `Icon.svelte.test.ts` enforces
  this against every icon's chroma. A spot icon whose paths need different fills per theme declares
  them in `lib/design/iconTokens.ts` and paints with
  `style="fill:var(--icon-<icon>-<part>,#lightHex)"` (ADR-0102) — see the `design` skill.
* **An icon that needs an internal `id` must prefix it `icon-`** (a gradient, a `<use>` target).
  Icons are inlined into one document, so an id is global across every icon on screen together, and
  SVGO's `cleanupIds` otherwise minifies ids to `a`, `b`, … per file — which is how two
  independently authored icons come to collide and `url(#a)` resolves to the wrong element.
  `tools/optimize-svg-assets.mjs` preserves the `icon-` prefix from that minification; uniqueness
  across the surviving ids is enforced by `web/src/lib/icons/iconIds.test.ts`.
* **`{@html}` is not reconciled against SSR markup during hydration.** `Icon.svelte` renders its SVG
  via `{@html}`, so an icon whose value depends on client-only state (orientation, a
  `localStorage`-backed setting) keeps the *server-rendered* SVG after hydration until something
  else forces a re-render — the code looks correct but the wrong icon paints. Drive the
  server/client difference with a reconciled attribute/`class`/`transform` (e.g. rotate one chevron
  with CSS) instead of swapping the `{@html}` body. For an icon that follows the held brush, render
  every face and let CSS pick off `[data-brush]` — `BrushButtonFaces.svelte` for the Brush Button,
  `InkOrMagicIcon.svelte` for the ink/magic pair. The eraser is the one brush that may stay a plain
  reactive branch: it is never persisted, so it cannot differ between SSR and hydration.
* **`onDestroy` (and any component-init code outside `onMount`/`$effect`) also runs during SSR.**
  `onMount` never fires on the server, but `onDestroy` does — the server destroys the component
  immediately after rendering it. So any `window`/`document` access reached from `onDestroy` (or
  top-level init) throws `ReferenceError: window is not defined` the moment a prerendered/SSR'd
  route imports the component, even one that only mounts client-side today (a prerendered route
  renders every component it imports at build time). Put such teardown in an `$effect` cleanup (the
  function it returns), which never runs on the server, rather than `onDestroy` — see
  `Slider.svelte`'s `$effect(() => removeWindowListeners)`.
* **`$state` deep-proxies objects and arrays** — a value read back from `$state` is never `===` the
  raw object it was created from, so identity checks against a plain constant list silently fail
  (e.g. `checked={selected === option}` never matches, and the selection UI looks correct but
  selects nothing). For selection-among-constants state use `$state.raw(...)`, or compare by a key
  field instead of by identity.
* **Pointer/activation gotchas** (the app fights these — see `strokeMath.ts`, `scribbleGuard.ts`,
  `ActionsPanel.svelte`): (a) a `pointerdown` does **not** grant transient user activation — call
  `requestFullscreen()`, wake lock, etc. from `pointerup`/`touchend`/`click`; (b) closing an overlay
  on `pointerup` can leak the trailing native `click` to whatever control sits beneath it (a "ghost
  click") — guard the region or the timing when overlays overlap other buttons.
