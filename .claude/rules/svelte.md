---
paths:
  - "src/**/*.svelte"
  - "src/**/*.svelte.ts"
---

# Svelte component rules

* Runes only (`$state`, `$derived`, `$effect`, `$props`). Never `writable`/`readable`/`derived` from `svelte/store` (ADR-0002).
* Shared state lives in `src/lib/state/*.svelte.ts`. Components read state and call setters; they never own shared state.
* Complex gestures and dialog wiring are Svelte actions in `src/lib/actions/` (see `dragToClear.ts`, `modalDialog.svelte.ts`), not inline component logic.
* The drawing engine (`src/lib/drawing/engine.ts`) is imperative by design (ADR-0004). Components wire into it via callbacks on mount and call its exported functions directly — don't wrap it in reactive stores.
* Styles are scoped in the component's `<style>` block. No global CSS except genuine cross-component tokens; `:global()` only when a class is set imperatively (e.g. via `classList`).
* New icons: drop the SVG in `src/lib/icons/`, run `npm run gen:icons`, then use `<Icon name="..." />` — the `name` prop is type-checked against the generated union.
