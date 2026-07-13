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

Options:

* **Runtime env reads (`$env/dynamic/public`)** — available only in SSR/server context; not
  available in pure client-side modules.
* **`.env` files with `PUBLIC_` prefix** — available client-side but require explicit naming in
  Vite's env allowlist; also can't be computed at build time from `package.json`.
* **Vite `define`** — inlines values as string literals at build time; works in any client or server
  module; the value can be computed from other files (e.g., reading `package.json`).

## Decision

Inject the three constants via `define` in `vite.config.ts`:

```ts
define: {
  __APP_VERSION__: JSON.stringify(APP_VERSION),   // from package.json
  __BUILD_TIME__:  JSON.stringify(BUILD_TIME),     // computed at build
  __NATIVE_API_BASE__: JSON.stringify(NATIVE_API_BASE) // '' or 'https://splotch.art'
}
```

`NATIVE_API_BASE` is computed from the same `CAPACITOR=true` env var used by the adapter selection
(ADR-0001). This means the decision of "web vs native" is made once at build time and baked into the
bundle — no runtime branching on a window global.

TypeScript declarations for these globals live in `src/app.d.ts`.

## Consequences

* **+** Constants are available in any module — client, server, or shared — with no async await or
  runtime env access.
* **+** Dead code elimination: when `__NATIVE_API_BASE__` is an empty string literal, the native
  branch in `api.ts` is optimized away in the web bundle (and vice versa).
* **-** Changing these values requires a full rebuild and redeploy; they can't be updated at runtime
  without a new build.
* **-** The `__APP_VERSION__` in a live native APK reflects the version at build time, not the
  current server version — version skew between the app and the hosted API must be managed through
  backward compatibility.
