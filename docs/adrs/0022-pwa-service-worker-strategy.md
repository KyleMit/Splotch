# ADR-0022: PWA Service Worker Strategy — vite-plugin-pwa as Manifest Injector with Custom Update Lifecycle

**Status:** Active — amended 2026-07 (issue #462) to make `src/lib/pwa/updates.ts` own registration
end-to-end, and 2026-08-02 (issue #621) to keep responsive coloring derivatives out of the precache
with an explicit canonical offline fallback. **Date:** 2026-06

## Context

The web target needs a service worker to:

1. Precache static assets (JS bundles, fonts, sounds, images) for fast repeat loads and offline use.
2. Manage update rollout without interrupting an active drawing session.

Two alternatives were considered:

**A. vite-plugin-pwa (chosen, with constraints)** — wraps Workbox's `generateSW` and injects the
precache manifest automatically after each build. The plugin also offers SW registration injection
and an optional update-lifecycle virtual module.

**B. Raw `workbox-build` + hand-written SW** — call `workbox-build`'s `generateSW` or
`injectManifest` directly in a `scripts/generate-sw.mjs` post-build step; register the SW with a few
lines in a `src/lib/pwa/register.ts`. More explicit, but roughly the same configuration surface area
and an extra build script to maintain.

Option A was chosen because the precache manifest injection (scanning the build output, computing
content hashes, embedding the manifest into the generated SW) is the hardest part to get right and
is where vite-plugin-pwa adds the most leverage. Option B would cost similar complexity for no
meaningful gain at this stage.

### The canvas-empty guard requirement

Splotch's audience is toddlers. A mid-session reload to apply a SW update would erase an in-progress
drawing with no warning. Therefore: a new SW must **never** force a page reload while the canvas has
content. It should wait until the canvas is blank, or defer to the next launch.

This requirement is fundamentally at odds with vite-plugin-pwa's `registerType: 'autoUpdate'`
default, which unconditionally sends `SKIP_WAITING` to the waiting SW and reloads the page the
moment an update is detected.

### Discovered conflict (2026-06)

The original configuration had three interacting bugs:

1. `workbox.skipWaiting: true` caused the new SW to call `self.skipWaiting()` during its own install
   phase, so it **never entered the waiting state**. `registration.waiting` was always `null`, so
   the canvas-empty guard in `updates.ts` was never reached.
2. `registerType: 'autoUpdate'` caused vite-plugin-pwa to inject a competing `SKIP_WAITING` + reload
   script alongside the custom `updates.ts`, creating a race that failed silently on iOS Safari.
3. `html` was in `globPatterns` and the plugin's default `navigateFallback: 'index.html'` registered
   a CacheFirst `NavigationRoute`, so a manual browser refresh served stale HTML from the SW cache
   rather than hitting the network.

## Decision

vite-plugin-pwa is retained **only for Workbox `generateSW` and precache manifest injection**. Its
update-lifecycle and manifest-generation features are explicitly disabled. A custom module
(`src/lib/pwa/updates.ts`) owns the entire update lifecycle.

### vite-plugin-pwa configuration (`vite.config.ts`)

| Option                      | Value                                                                             | Reason                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `registerType`              | `'prompt'`                                                                        | Disables the auto-update injection; `updates.ts` is the sole driver                                                         |
| `manifest`                  | `false`                                                                           | Web manifest is maintained manually in `static/site.webmanifest`                                                            |
| `workbox.skipWaiting`       | *(omitted)*                                                                       | New SW enters the waiting state; `updates.ts` activates it only when canvas is blank                                        |
| `workbox.clientsClaim`      | `true`                                                                            | New SW claims all clients immediately after activation                                                                      |
| `workbox.navigateFallback`  | `''`                                                                              | Suppresses the default `NavigationRoute(createHandlerBoundToURL('index.html'))` which would shadow the NetworkFirst handler |
| `workbox.globPatterns`      | no `html`                                                                         | HTML is not precached; navigation uses the runtime NetworkFirst cache instead                                               |
| `workbox.globIgnores`       | source-only line art plus responsive coloring tiers                               | Avoids caching runtime-unused sources and duplicate resolutions of the same coloring art                                    |
| `additionalManifestEntries` | `'_app/env.js'`, revisioned by build time                                         | Precaches SvelteKit's runtime-generated public-environment module so an offline navigation can hydrate                      |
| `workbox.runtimeCaching`    | custom responsive-coloring handler; `NetworkFirst` navigations with a 5 s timeout | Keeps responsive derivatives network-first without runtime caching and makes navigation fall back to cached HTML offline    |

### Responsive coloring and offline fallback

The web UI offers smaller `srcset` candidates under `/coloring/max-1152px/` and
`/coloring/max-240px/`, but the corresponding canonical files under `/coloring/<book>/` remain the
source of truth. Precaching both resolutions added 392 entries and 12,223,226 bytes (11.66 MiB) to
every install. The responsive tier directories are therefore explicit `globIgnores`.

A custom Workbox runtime route attempts the responsive request from the network. On a network error
or non-success response it removes the `max-<edge>px` path segment and resolves the canonical URL
from the revisioned precache with `ignoreSearch: true`. It does not put responsive responses in a
runtime cache. This preserves the smaller transfer on a cold online visit while keeping offline
coloring complete without storing duplicate art. A browser may still report the responsive URL as an
image's `currentSrc` offline; the bytes returned for that request are the canonical asset.

`scripts/check-pwa-precache.mjs` runs after every web build. It rejects responsive entries, a
responsive derivative without a canonical precache entry, a missing `/_app/env.js`, or a precache
above the named size budget. The production Playwright suite clears the HTTP cache and verifies the
offline DPR 1 and DPR 3 picker and canvas paths against decoded response dimensions.

### Custom update lifecycle (`src/lib/pwa/updates.ts`)

`initPWAUpdates()` is called from `lib/boot/webOnlyServices.ts` on web (skipped in native and dev).
It:

* Calls `registration.update()` on page load, on `visibilitychange` to visible, on `focus`, and
  hourly — so the browser always has a fresh copy of `sw.js` to compare against.
* When a new SW is found in the `waiting` state, calls `activateWaitingSW()`, which checks
  `canvasState.canvasEmpty`. If the canvas is blank it posts `{ type: 'SKIP_WAITING' }` to the
  waiting SW (the Workbox-generated SW handles this message) and sets a `{ once: true }`
  `controllerchange` listener that reloads the page. If the canvas has content the update is
  silently deferred to the next launch (the waiting SW activates when the old SW loses all clients).
* Also calls `checkVersionMismatch()`: fetches `/version.json` (not precached; always network) with
  `cache: 'no-store'`, compares its `version` field against `__APP_VERSION__` (a Vite compile-time
  constant). If they differ the running SW is serving stale HTML, so it redirects to
  `?v=<deployed-version>`, which the SW's NetworkFirst handler sees as an uncached URL and fetches
  fresh from the origin. The `?v=` param is stripped from the URL on the next init. This is the
  escape hatch for clients already stuck on a broken SW (e.g. from before this update lifecycle was
  in place).

### Build output

A `emit-version-json` Vite plugin emits `version.json` into the build output on every build. The
file is excluded from the SW precache (`.json` is not in `globPatterns`) and carries a
`no-cache, no-store, must-revalidate` Netlify header so the CDN never serves a stale copy.

## Consequences

**+** Workbox precache manifest injection is handled automatically; content-hash busting of all
static assets works without a separate build script. How that content-hash busting actually
invalidates the stable-filename static media (`/sounds`, `/styles`, `/icons`), and how it interacts
with their HTTP `Cache-Control`, is documented in
[ADR-0042](0042-static-media-cache-invalidation.md).

**+** The canvas-empty guard is reliably enforced: the new SW cannot activate itself (no
`skipWaiting: true`), and vite-plugin-pwa's auto-reload injection is disabled
(`registerType: 'prompt'`), so `updates.ts` is the only code path that can trigger a reload.

**+** Manual browser refresh always hits the network for HTML (NetworkFirst), so a user can unstick
themselves without clearing the SW cache manually.

**+** Offline coloring keeps the canonical catalog while the install omits 11.66 MiB of duplicate
responsive derivatives. Online responsive requests still receive the smaller candidate.

**+** The runtime-generated SvelteKit environment module is explicitly precached, so an offline
navigation can hydrate rather than stopping after server-rendered markup.

**+** The `version.json` cache-bust handles clients that were already stuck on a broken SW before
this strategy was locked in, without requiring a server-side redirect or unregistering the SW.

**-** Several vite-plugin-pwa defaults must be explicitly overridden (`registerType`,
`navigateFallback`, `skipWaiting`, `manifest`, `globPatterns`). A future upgrade to vite-plugin-pwa
could silently re-introduce a conflicting default — the config and this ADR should be reviewed
together on any major version bump.

**-** Deferring an update mid-drawing means a user might run old JS code under a new SW for the
duration of a drawing session. In practice this is safe because the new SW serves new assets and the
old SW's cache is cleaned up by `cleanupOutdatedCaches`, but it means the app version in memory and
the SW version in control can briefly diverge.

**-** If the canvas is never blank in a session (unlikely but possible), the update defers
indefinitely until the app is closed and reopened.

**-** `version.json` adds one extra network round-trip per page load (async, non-blocking, only in
production). It fails silently when offline.

**-** The responsive-coloring handler is serialized into the generated worker by Workbox. It must
remain self-contained; a unit test evaluates the serialized function to guard that constraint.
