# ADR-0001: SvelteKit Dual-Adapter Strategy (Web + Native)

**Status:** Active\
**Date:** 2024 (initial), revised 2026-06

## Context

Splotch targets two distinct deployment environments:

1. **Web** — hosted on Netlify, needing SSR for the home page, serverless functions for the AI image
   generation endpoint (`/api/generate-image`), and a token management admin console (`/admin`).
2. **Native (Android/iOS)** — wrapped via Capacitor, which requires a fully static, pre-rendered
   bundle embedded in the app binary. Serverless functions aren't available inside the native shell;
   the native app calls the hosted endpoint directly.

SvelteKit supports pluggable adapters, but a project can only be built with one adapter at a time.

## Decision

> **Layout note (2026-06):** the SvelteKit app moved into the `web/` subdirectory (Capacitor's
> `android/`/`ios/` stay at the repo root) to scope netlify-cli's file watcher — see
> [ADR-0024](0024-web-app-subdirectory-for-netlify-watcher.md). The strategy below is unchanged; the
> config files now live at `web/svelte.config.js` and `web/vite.config.ts`.

Use the `CAPACITOR=true` environment variable as a build-time signal to branch between two adapters
in `svelte.config.js`:

* **Web build:** `@sveltejs/adapter-netlify` — produces SSR pages and Netlify functions.
* **Native build:** `@sveltejs/adapter-static` with `fallback: '200.html'` and `strict: false` —
  produces a static export. `strict: false` suppresses errors for routes that can't be prerendered
  (server-only API routes, `/admin`) since those routes are unreachable inside the native bundle.

The same branch in `vite.config.ts` conditionally excludes `vite-plugin-pwa` for native builds (the
Capacitor shell provides equivalent offline capability).

## Consequences

* **+** One codebase, one set of routes and components, shipped to both targets.
* **+** Server-side routes (`/api/*`, `/admin`) are silently excluded from the native bundle at
  build time without any runtime branching.
* **-** Two separate build commands (`vite build` vs `cross-env CAPACITOR=true vite build`) must be
  run and kept aligned — the native bundle bakes a snapshot of the web build's output format, so
  adapter API changes require attention.
* **-** `strict: false` means misconfigured static routes fail silently at runtime instead of at
  build time.
