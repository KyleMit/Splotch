---
paths:
  - "web/src/**/*.svelte"
  - "web/src/**/*.svelte.ts"
---

# Svelte component rules

* Runes only (`$state`, `$derived`, `$effect`, `$props`). Never `writable`/`readable`/`derived` from `svelte/store` (ADR-0002).
* Shared state lives in `src/lib/state/*.svelte.ts`. Components read state and call setters; they never own shared state.
* Complex gestures and dialog wiring are Svelte actions in `src/lib/actions/` (see `dragToClear.ts`, `modalDialog.svelte.ts`), not inline component logic.
* The drawing engine (`src/lib/drawing/engine.ts`) is imperative by design (ADR-0004). Components wire into it via callbacks on mount and call its exported functions directly — don't wrap it in reactive stores.
* Styles are scoped in the component's `<style>` block. No global CSS except genuine cross-component tokens; `:global()` only when a class is set imperatively (e.g. via `classList`).
* New icons: drop the SVG in `src/lib/icons/`, run `npm run gen:icons`, then use `<Icon name="..." />` — the `name` prop is type-checked against the generated union. `<Icon>` sets `data-icon={name}` so the icon is assertable in tests (the SVG itself goes in via `{@html}` and carries no identity).
* **`{@html}` is not reconciled against SSR markup during hydration.** `Icon.svelte` renders its SVG via `{@html}`, so an icon whose value depends on client-only state (orientation, a `localStorage`-backed setting) keeps the *server-rendered* SVG after hydration until something else forces a re-render — the code looks correct but the wrong icon paints. Drive the server/client difference with a reconciled attribute/`class`/`transform` (e.g. rotate one chevron with CSS) instead of swapping the `{@html}` body.
* **`onDestroy` (and any component-init code outside `onMount`/`$effect`) also runs during SSR.** `onMount` never fires on the server, but `onDestroy` does — the server destroys the component immediately after rendering it. So any `window`/`document` access reached from `onDestroy` (or top-level init) throws `ReferenceError: window is not defined` the moment a prerendered/SSR'd route imports the component, even one that only mounts client-side today (a prerendered route renders every component it imports at build time). Put such teardown in an `$effect` cleanup (the function it returns), which never runs on the server, rather than `onDestroy` — see `Slider.svelte`'s `$effect(() => removeWindowListeners)`.
* **`$state` deep-proxies objects and arrays** — a value read back from `$state` is never `===` the raw object it was created from, so identity checks against a plain constant list silently fail (e.g. `checked={selected === option}` never matches, and the selection UI looks correct but selects nothing). For selection-among-constants state use `$state.raw(...)`, or compare by a key field instead of by identity.
* **Pointer/activation gotchas** (the app fights these — see `strokeMath.ts`, `scribbleGuard.ts`, `ActionsPanel.svelte`): (a) a `pointerdown` does **not** grant transient user activation — call `requestFullscreen()`, wake lock, etc. from `pointerup`/`touchend`/`click`; (b) closing an overlay on `pointerup` can leak the trailing native `click` to whatever control sits beneath it (a "ghost click") — guard the region or the timing when overlays overlap other buttons.
