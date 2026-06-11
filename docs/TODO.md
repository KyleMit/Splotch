# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

- [ ] **[Readability] Remove dead `colors.lastColorChangeAt` state** — File(s): `src/lib/state/colors.svelte.ts`, `src/lib/state/colors.svelte.test.ts`
  `lastColorChangeAt` is written by all three setters but never read by any app code — the stray-stroke debounce actually uses the engine's private `lastColorChangeTime`, stamped via `setColor()` (engine.ts:53, 422–425). Delete the field, its three assignments, and the test assertions that reference it (colors.svelte.test.ts:18,36,47). If a future feature needs the timestamp, the engine already owns it.

- [ ] **[Performance] Position the eraser bubble with `transform` instead of `left`/`top`** — File(s): `src/lib/components/DrawingCanvas.svelte`
  The eraser cursor updates `style:left`/`style:top` from `$state` on every pointermove (DrawingCanvas.svelte:106–114), forcing style/layout work per frame while erasing. Switch to a single `style:transform="translate3d({x}px, {y}px, 0) translate(-50%, -50%)"` (move the existing `translate(-50%,-50%)` out of the CSS class) so updates stay compositor-only. Size can stay as width/height since it only changes on stroke-level changes.

- [ ] **[Performance] Investigate forced layout from a bundled dependency** — File(s): TBD (Vite dep `chunk-AYX5C5U2.js:737`)
  From the 2026-06-09 trace: a function in a Vite-bundled dep reads a layout-sensitive property synchronously, forcing an 8.1ms layout during toolbar/panel interactions (not while drawing). Note: package.json has no melt-ui/floating-ui, so the chunk is likely Svelte/SvelteKit internals or a Capacitor plugin. Identify it by checking `node_modules/.vite/deps/_metadata.json` for the chunk hash (or re-trace with `build.sourcemap: true`); then move the offending read outside the preceding DOM write, or batch it in a rAF. If the trace is stale and the chunk no longer exists, re-profile first and drop this item if it doesn't reproduce.
