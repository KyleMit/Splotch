# src/ orientation

Where things live (full file-by-file map: `architecture` skill):

* `lib/drawing/` — imperative canvas engine. `engine.ts` is the facade + orchestrator (canvas,
  pointer tracking, public API; callbacks out, direct function calls in — ADR-0004);
  ops/undo/simplification/export live in sibling modules (`strokeOps`, `undoHistory`,
  `commandSimplify`, `exportDrawing` — map in the `architecture` skill).
* `lib/state/` — all shared state, as Svelte 5 rune modules (`*.svelte.ts`).
* `lib/components/` — UI components with scoped styles.
* `lib/actions/` — Svelte actions for gestures and dialog wiring.
* `lib/server/` — server-only modules (tokens, admin, rate limiting). Never imported client-side;
  excluded from the native bundle. `lib/server/ai/` — the provider-agnostic AI seam (ADR-0047):
  routes import `aiProvider` from `ai/provider.ts`; the `@google/genai` SDK is only touched inside
  that directory.
* `lib/storage.ts` — dual-layer persistence (localStorage + Capacitor Preferences mirror on native,
  ADR-0005). `lib/secureStorage.ts` — client-held secrets. `lib/platform.ts` — native detection
  without importing `@capacitor/core` (ADR-0013). `lib/nativePlugin.ts` — `lazyPluginModule()`:
  lazy-loads a Capacitor plugin as its module namespace, never the plugin proxy (a proxy resolves
  `.then` to a native call and hangs the awaiting promise). Every plugin load — this or an inline
  `import()` in a component — must sit behind the literal `__IS_CAPACITOR__` so Rollup drops the
  chunk from the web bundle (`isNative()` alone can't tree-shake); see the `mobile` skill's
  plugin-loading section.
* `routes/api/*` — serverless endpoints (see `api` skill). `routes/admin` — token console.
  `routes/dev/*` — test harnesses, unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`.

Compile-time constants from Vite (ADR-0010): `__APP_VERSION__`, `__BUILD_TIME__`,
`__NATIVE_API_BASE__`, `__IS_CAPACITOR__` (true in the native build — prefer it over a runtime
`isNative()` for build-time platform branches).
