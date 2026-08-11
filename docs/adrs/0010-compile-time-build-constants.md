# ADR-0010: Compile-Time Build Constants via Vite Define

**Status:** Active\
**Date:** 2024

## Context

Several values differ between web and native builds, or between development and production, and need
to be available in client-side code without a runtime server request:

* **`__APP_VERSION__`** — the release version string (from `package.json`), displayed in the About
  tab.
* **`__BUILD_TIME__`** — ISO timestamp of when the build ran, used for debugging.
* **`__NATIVE_API_BASE__`** — the base URL for API calls. On the web, API routes are same-origin
  (empty string). Inside the native app there is no local server, so this must point to
  `https://splotch.art`.
* **`__IS_CAPACITOR__`** — the web/native build boundary. Native-only plugin imports sit behind this
  literal so Rollup can remove their chunks from the web build.
* **`__PERF_MARKS__`** — whether profiling builds retain `engine.*` user-timing marks and the native
  screenshot persistence sink.
* **`__DEV_HARNESS__`** — whether client-side test/profiling seams are retained. Inspection seams
  stay read-only; ADR-0109 permits a narrowly constrained production-function invoke handle. This is
  separate from the runtime server gate for `/dev/*` routes.

Options:

* **Runtime env reads (`$env/dynamic/public`)** — available only in SSR/server context; not
  available in pure client-side modules.
* **`.env` files with `PUBLIC_` prefix** — available client-side but require explicit naming in
  Vite's env allowlist; also can't be computed at build time from `package.json`.
* **Vite `define`** — inlines values as string literals at build time; works in any client or server
  module; the value can be computed from other files (e.g., reading `package.json`).

## Decision

Inject the constants through `buildDefines()` in `defines.ts`, called by `vite.config.ts` and the
Vitest config:

```ts
define: buildDefines({
  appVersion,
  buildTime,
  nativeApiBase,
  isCapacitor,
  perfMarks,
  devHarness,
});
```

`NATIVE_API_BASE` is computed from the same `CAPACITOR=true` env var used by the adapter selection
(ADR-0001). This means the decision of "web vs native" is made once at build time and baked into the
bundle — no runtime branching on a window global. `PERF_MARKS=true` and
`PUBLIC_ENABLE_DEV_HARNESS=true` select instrumented builds; ordinary web and native builds replace
both with literal `false`.

TypeScript declarations for these globals live in `src/app.d.ts`.

## Consequences

* **+** Constants are available in any module — client, server, or shared — with no async await or
  runtime env access.
* **+** Dead code elimination: when `__NATIVE_API_BASE__` is an empty string literal, the native
  branch in `api.ts` is optimized away in the web bundle (and vice versa).
* **+** Test and profiling property names do not merely remain dormant in release clients. The false
  literals remove their branches, and the post-build release scan rejects a bundle that still
  contains them or any `engine.*` mark name.
* **-** Changing these values requires a full rebuild and redeploy; they can't be updated at runtime
  without a new build.
* **-** The `__APP_VERSION__` in a live native APK reflects the version at build time, not the
  current server version — version skew between the app and the hosted API must be managed through
  backward compatibility.
