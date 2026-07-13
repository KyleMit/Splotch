# ADR-0013: Platform Detection Without Importing @capacitor/core

**Status:** Active\
**Date:** 2025

## Context

Several modules need to know at runtime whether the app is running inside a native Capacitor shell
(`isNative()`) or on the web, in order to branch between web and native code paths (e.g., whether to
mirror writes to Capacitor Preferences, whether to use the photo library vs. download, whether to
show the network-aware AI button).

The conventional approach is to import `{ Capacitor } from '@capacitor/core'` and call
`Capacitor.isNativePlatform()`. However, importing `@capacitor/core` has a side effect during
SSR/prerender (Node.js): Capacitor initializes in a non-browser context, which either throws or
produces incorrect results. SvelteKit prerenders routes at build time, so any module that imports
`@capacitor/core` at module scope can break the build or return wrong values during prerender.

## Decision

Read the `Capacitor` global off `globalThis` rather than importing the package:

```ts
export function isNative(): boolean {
  return browser && globalThis.Capacitor?.isNativePlatform?.() === true;
}
```

`browser` is the SvelteKit `$app/environment` flag (false during SSR). The optional chaining (`?.`)
means the function safely returns `false` in any non-native context, including Node.js during
prerender.

This module (`src/lib/platform.ts`) is therefore safe to import from any module — shared, server, or
client — without risking SSR breakage.

## Consequences

* **+** `platform.ts` can be imported from state modules, storage, screenshot, and server hooks
  without conditional guards or dynamic imports.
* **+** No runtime initialization side effects from `@capacitor/core` during prerender.
* **-** Relies on Capacitor injecting a `window.Capacitor` global before any app code runs. If that
  injection timing changes in a future Capacitor major version, this approach would silently return
  `false` in a native context. Validate after major Capacitor upgrades.
* **-** IDE tooling has no type for `globalThis.Capacitor` — it's typed as `unknown` unless
  declarations are added. In practice this is acceptable since the usage is guarded by optional
  chaining.
