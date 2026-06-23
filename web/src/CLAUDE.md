# src/ orientation

Where things live (full file-by-file map: `architecture` skill):

* `lib/drawing/` — imperative canvas engine. `engine.ts` owns the canvas, undo stack, and pointer tracking; callbacks out, direct function calls in (ADR-0004).
* `lib/state/` — all shared state, as Svelte 5 rune modules (`*.svelte.ts`).
* `lib/components/` — UI components with scoped styles.
* `lib/actions/` — Svelte actions for gestures and dialog wiring.
* `lib/server/` — server-only modules (tokens, admin, rate limiting). Never imported client-side; excluded from the native bundle.
* `lib/storage.ts` — dual-layer persistence (localStorage + Capacitor Preferences mirror on native, ADR-0005). `lib/secureStorage.ts` — client-held secrets. `lib/platform.ts` — native detection without importing `@capacitor/core` (ADR-0013).
* `routes/api/*` — serverless endpoints (see `api` skill). `routes/admin` — token console. `routes/dev/*` — test harnesses, unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`.

Compile-time constants from Vite (ADR-0010): `__APP_VERSION__`, `__BUILD_TIME__`, `__NATIVE_API_BASE__`.
