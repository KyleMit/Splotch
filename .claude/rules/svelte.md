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
* Shared reactive state lives in `src/lib/state/*.svelte.ts`. Components read state and call
  setters; they never own shared state. A shared store has one shape: a `createX()` factory over
  private `$state` that returns read-only getters plus named mutators, and a shared instance when
  the module owns app-wide state. Plain `.ts` helpers and per-component factories in the directory
  are not singletons. A module that subscribes to the platform (`network`, `layout`, `fullscreen`,
  `install`, `appearance`, `aiProgress`) puts that in `install()`/`dispose()` on the instance and
  still calls `install()` once at module load behind its client guard. Tests take fresh instances
  from the factory, never `vi.resetModules()`.
* A state module's exported reactive singleton is named after the module basename plus a kind
  suffix: a `$state(...)` object or a `createX()` instance is `<basename>State` (`settingsState` in
  `settings.svelte.ts`, `aiProgressState` in `aiProgress.svelte.ts`); a modal controller ends in
  `Modal` (`settingsModal`). The rule is mechanical on purpose:
  `tools/tests/state-export-names.test.mjs` enforces one `<basename>State` name plus any `*Modal`
  controller names. Private module-scope `$state` is outside the rule.
* `$effect` synchronizes reactive state to a system outside Svelte; it is not a transition detector.
  Put transitions in their initiating handlers, declarative relationships in `$derived`, and modal
  lifecycle work in `modalDialog`'s `onOpen`/`onClose`. Gate thresholds on a named `$derived`
  boolean, and wrap bookkeeping reads that must not become dependencies in `untrack`. A rare
  cross-owner reconciliation effect must say why no initiating handler owns both sides and must not
  keep a previous-value latch.
* Never put browser-only cleanup in `onDestroy`, which also runs during SSR. An
  `onMount(() => teardown)` owns mount-once imperative wiring; an `$effect` cleanup owns a reactive
  subscription that must be replaced when its inputs change; and a dependency-free
  `$effect(() => () => teardown())` owns unmount-only cleanup for resources that handlers may create
  later.
* Multi-phase async state is a tagged union. A reset invalidates the previous visit's in-flight
  work; if the operation's external side effect must still land, detach it without aborting and
  reject its late result through a visit/request ownership check. Distinguish an operation's own
  deadline abort (a visible timeout) from supersede or unmount (silent because no current owner
  remains).
* Every `$bindable` has one writer. Bind parent-reset/child-edit form fields, but keep
  asynchronously collected child state local and expose an exported method through `bind:this`.
  Never bind a function.
* A per-request SSR render never writes module-level state. `vitest.webSsr.config.ts` runs the web
  branches and `perRequestRoutes.webSsr.test.ts` snapshots every module instance around every such
  route render.
* Strip a pre-router query with `history.replaceState(history.state, '', url)`, never the
  `$app/navigation` helper before the router mounts. ESLint rejects direct history entries and
  replacements that discard SvelteKit's state.
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
* Styles are scoped in the component's `<style>` block. Use `:global()` only for a class forwarded
  into a child component, cross-component state on `html[data-*]` or a sibling's data attributes,
  elements rendered inside `{@html}`, or a class set imperatively via `classList`. Pin every new
  global seam with a scoped compound (`.picker :global(.picker-option-icon)`,
  `:global(html[data-drawer-open]) .actions-drawer`); an entirely unpinned selector such as
  `:global(.gate-mascot)` is forbidden because it relies on a globally unique class name.
* A reduced-motion treatment is written `:global(:root[data-reduce-motion]) .thing { … }`, never
  `@media (prefers-reduced-motion: reduce)`. The attribute is the Reduce Motion setting resolved
  against the OS (`lib/platform/reducedMotion.ts`), so a media block would ignore the Settings
  switch in both directions; `reducedMotionCss.test.ts` fails on one. JS reads the same answer
  through `prefersReducedMotion()`.
* A value repeated 3+ times in a component's `<style>` (a duration, gradient, transition list)
  becomes a local custom property on the block's root selector (see `--drawer-transition` in
  `ActionsPanel.svelte`). Never `!important` to beat a sibling rule — fix specificity or ordering.
* A prop that renders help/explanatory text for a control must wire it to the control (`id` +
  `aria-describedby`) — axe does not flag the omission.
* New icons: drop the SVG in `src/lib/icons/` — or in `src/lib/icons/deferred/` when only lazily
  loaded UI renders it (a settings section, an overlay, a route other than `/`, the styleguide);
  every file that names a deferred icon then also carries `import '$lib/components/deferredIcons';`,
  enforced by `deferredIcons.test.ts` (ADR-0164) — run
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
  renders every component it imports at build time). Put mount-once browser teardown in the function
  returned from `onMount`, input-dependent teardown in a reactive `$effect` cleanup, or unmount-only
  cleanup for handler-created resources in a dependency-free `$effect` cleanup, rather than in
  `onDestroy` — see `Slider.svelte`'s `$effect(() => removeWindowListeners)`.
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
* Pointer-driven controls accept only `button === 0`. A document-level listener that must observe
  Svelte-delegated events uses capture phase or `on()` from `svelte/events`. The trailing-click
  guards in `scribbleGuard`, `colorFoldGesture`, and `pinchTextZoom` share
  `PRESS_CLICK_CONSUME_WINDOW_MS`, not a common click-swallowing helper; `launchGuard` is a spatial
  tap-zone guard with its own duration.
* Keep a conditionally rendered dialog mounted until the native dialog and its close animation have
  retired. Clear one-open state in a long-lived component on close.
* A freshly attached drawing-engine callback set receives the current flags on both adoption and
  init-fallback paths. An in-memory mirror of persisted state is retired or refreshed with the
  storage fact it mirrors; failed or superseded reads do not prove absence.
* `svelte/no-top-level-browser-globals` catches unguarded top-level browser-only globals in Svelte
  components, module scripts, and `.svelte.ts` modules. Globals Node also defines, such as
  `navigator`, still need an explicit `browser` guard.
