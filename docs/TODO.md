# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

- [ ] **[Performance] Investigate forced layout from a bundled dependency** — File(s): TBD (Vite dep `chunk-AYX5C5U2.js:737`)
  From the 2026-06-09 trace: a function in a Vite-bundled dep reads a layout-sensitive property synchronously, forcing an 8.1ms layout during toolbar/panel interactions (not while drawing). Note: package.json has no melt-ui/floating-ui, so the chunk is likely Svelte/SvelteKit internals or a Capacitor plugin. Identify it by checking `node_modules/.vite/deps/_metadata.json` for the chunk hash (or re-trace with `build.sourcemap: true`); then move the offending read outside the preceding DOM write, or batch it in a rAF. If the trace is stale and the chunk no longer exists, re-profile first and drop this item if it doesn't reproduce.
