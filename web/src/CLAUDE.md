

<!-- Source: .ruler/AGENTS.md -->

# web/src/ Orientation

Where things live (full file-by-file map: `architecture` skill):

* `lib/drawing/` - imperative canvas engine. `engine.ts` is the facade + orchestrator
  (canvas, pointer tracking, public API; callbacks out, direct function calls in -
  ADR-0004). Ops, undo, simplification, and export live in sibling modules.
* `lib/state/` - all shared state, as Svelte 5 rune modules (`*.svelte.ts`).
* `lib/components/` - UI components with scoped styles.
* `lib/actions/` - Svelte actions for gestures and dialog wiring.
* `lib/server/` - server-only modules (tokens, admin, rate limiting). Never imported
  client-side; excluded from the native bundle. `lib/server/ai/` is the provider-agnostic AI
  seam (ADR-0047): routes import `aiProvider` from `ai/provider.ts`; `@google/genai` is only
  touched inside that directory.
* `lib/storage.ts` - dual-layer persistence (localStorage + Capacitor Preferences mirror on
  native, ADR-0005). `lib/secureStorage.ts` - client-held secrets. `lib/platform.ts` -
  native detection without importing `@capacitor/core` (ADR-0013). `lib/nativePlugin.ts` -
  `lazyPluginModule()`: lazy-loads a Capacitor plugin as its module namespace, never the
  plugin proxy. Every plugin load must sit behind literal `__IS_CAPACITOR__` so Rollup drops
  the chunk from the web bundle.
* `routes/api/*` - serverless endpoints (see `api` skill). `routes/admin` - token console.
  `routes/dev/*` - test harnesses, unlocked by `PUBLIC_ENABLE_DEV_HARNESS=true`.

Compile-time constants from Vite (ADR-0010): `__APP_VERSION__`, `__BUILD_TIME__`,
`__NATIVE_API_BASE__`, `__IS_CAPACITOR__` (true in the native build; prefer it over runtime
`isNative()` for build-time platform branches).

## Svelte Component Rules

* Runes only (`$state`, `$derived`, `$effect`, `$props`). Never `writable`/`readable`/
  `derived` from `svelte/store` (ADR-0002).
* Shared state lives in `src/lib/state/*.svelte.ts`. Components read state and call setters;
  they never own shared state.
* Complex gestures and dialog wiring are Svelte actions in `src/lib/actions/`, not inline
  component logic.
* The drawing engine is imperative by design (ADR-0004). Components wire into it via
  callbacks on mount and call exported functions directly; do not wrap it in reactive
  stores.
* Styles are scoped in the component's `<style>` block. No global CSS except genuine
  cross-component tokens; `:global()` only when a class is set imperatively.
* New icons: drop the SVG in `src/lib/icons/`, run `npm run gen:icons`, then use
  `<Icon name="..." />`.
* `{@html}` is not reconciled against SSR markup during hydration. Do not swap icon SVG
  bodies based on client-only state; drive the difference with reconciled attributes,
  classes, or transforms.
* `onDestroy` and component-init code outside `onMount`/`$effect` also run during SSR. Put
  browser-only teardown in an `$effect` cleanup instead of `onDestroy`.
* `$state` deep-proxies objects and arrays. For selection-among-constants state, use
  `$state.raw(...)` or compare by a key instead of object identity.
* Pointer/activation gotchas: `pointerdown` does not grant transient user activation; call
  `requestFullscreen()`, wake lock, etc. from `pointerup`/`touchend`/`click`. Closing an
  overlay on `pointerup` can leak the trailing native `click` to controls beneath it.

## Server And API Rules

* Server code is web-only: it never ships in the native bundle. The apps call hosted
  endpoints via `apiUrl()` (`src/lib/api.ts`). Never import `src/lib/server/*` from client
  code.
* `/api/*` sends `Access-Control-Allow-Origin: *` (ADR-0007). That wildcard is only safe
  because every endpoint is gated by a credential the caller already holds and nothing under
  `/api` uses cookies. Never add a cookie-authenticated `/api` endpoint.
* Any unauthenticated oracle (login, code/key verification) must be rate-limited per IP via
  `src/lib/server/rateLimit.ts` (ADR-0014). Use `throttled(retryAfter)` and
  `readJsonBody(request)` from `src/lib/server/http.ts`.
* Admin auth: the raw `ADMIN_ACCESS_TOKEN` is exchanged once for a derived HMAC session
  token; all secret comparisons must be constant-time (`timingSafeEqual`). The web `/admin`
  console and JSON `/api/admin/*` endpoints share one core.
* `/api/admin/tokens` mutations return the full snapshot shape (`tokens` + `invites`) so
  clients never need a follow-up fetch.
* The model-vendor SDK (`@google/genai`) is imported only inside `src/lib/server/ai/`
  (ADR-0047). Routes and other server modules go through `AiImageProvider`; never import the
  SDK or Gemini types outside that directory. Dev-time asset scripts are the sanctioned
  exception.
* When adding or changing an endpoint, update the API reference in
  `.ruler/skills/api/SKILL.md` as part of the same change.
* After changing an endpoint, run `npm run test:api:smoke`. Extend
  `scripts/api-smoke.mjs` when adding an endpoint or changing a response shape.
