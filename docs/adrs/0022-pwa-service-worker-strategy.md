# ADR-0022: PWA Service Worker Strategy — vite-plugin-pwa as Manifest Injector with Custom Update Lifecycle

**Status:** Active — amended 2026-07 (issue #462) to make `src/lib/pwa/updates.ts` own registration
end-to-end, 2026-08-02 (issue #621) to keep responsive coloring derivatives out of the precache with
an explicit canonical offline fallback, and 2026-08-05 (issue #778) to place the version-mismatch
cache-bust redirect under the same canvas-empty guard as the waiting-worker reload. **Date:**
2026-06. Amended 2026-08-08 by [ADR-0103](0103-progressive-coloring-book-packs.md) so only the Farm
starter book is precached and other books use verified runtime pack caches. Amended 2026-08-18 to
activate a version-matched waiting worker silently (no reload) and to defer the stale-page reload to
the hidden edge (`visibilitychange` → hidden), so a visible session is never reloaded out from under
the user.

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

| Option                      | Value                                                                                               | Reason                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `registerType`              | `'prompt'`                                                                                          | Disables the auto-update injection; `updates.ts` is the sole driver                                                            |
| `manifest`                  | `false`                                                                                             | Web manifest is maintained manually in `static/site.webmanifest`                                                               |
| `workbox.skipWaiting`       | *(omitted)*                                                                                         | New SW enters the waiting state; `updates.ts` activates it only when canvas is blank                                           |
| `workbox.clientsClaim`      | `true`                                                                                              | New SW claims all clients immediately after activation                                                                         |
| `workbox.navigateFallback`  | `''`                                                                                                | Suppresses the default `NavigationRoute(createHandlerBoundToURL('index.html'))` which would shadow the NetworkFirst handler    |
| `workbox.globPatterns`      | no `html`                                                                                           | HTML is not precached; navigation uses the runtime NetworkFirst cache instead                                                  |
| `workbox.globIgnores`       | social card, source line art, responsive tiers, and non-starter coloring books                      | Avoids served-only assets, duplicate resolutions, and post-install book packs                                                  |
| `additionalManifestEntries` | `'_app/env.js'` plus the versioned coloring-pack manifest                                           | Keeps offline hydration and the downloader's integrity/file inventory available                                                |
| `workbox.runtimeCaching`    | responsive and installed-canonical coloring handlers; `NetworkFirst` navigations with a 5 s timeout | Resolves installed book caches without putting downloads in the precache and makes navigation fall back to cached HTML offline |

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

### Progressive coloring packs

[ADR-0103](0103-progressive-coloring-book-packs.md) narrows the canonical precache authority from
the full catalog to Farm. The versioned pack manifest is precached, while all canonical files for
the other seven books are excluded. A separate Cache Storage namespace receives verified whole-book
downloads. The canonical runtime route checks all caches before going to the network, so installed
packs and the Workbox precache share one URL contract without letting ordinary image requests write
partially downloaded packs. The responsive route can therefore fall back to either Farm's precache
entry or a downloaded canonical entry.

### Custom update lifecycle (`src/lib/pwa/updates.ts`)

`initPWAUpdates()` is called from `lib/boot/webOnlyServices.ts` on web (skipped in native and dev).
It:

* Calls `registration.update()` on page load, on `visibilitychange` to visible, on `focus`, and
  hourly — so the browser always has a fresh copy of `sw.js` to compare against. A check only
  *downloads* the new worker; applying it is a separate decision.
* When a new SW reaches the `waiting` state, fetches `/version.json` and compares the deployed
  version with the running page's `__APP_VERSION__`:
  * **Equal** — every online cold launch, since navigations are NetworkFirst and fresh HTML boots
    under the old SW while the new one installs. The waiting worker is activated **silently**
    (`{ type: 'SKIP_WAITING' }`, no reload, regardless of canvas state): same-version precache means
    no asset skew, so nothing visible needs to happen. Before this amendment the app reloaded an
    already-current page here — the refresh users saw seconds after every post-deploy launch.
  * **Different, or `version.json` unreachable** — the page is stale, typically a resumed PWA that
    predates a deploy. The update holds in a `ready` state and `applyPendingUpdate()` posts
    `SKIP_WAITING` with a `{ once: true }` `controllerchange` listener that reloads — but only from
    the `visibilitychange` → hidden handler, and only while the canvas is blank. The reload happens
    while the app is backgrounded (for an iPad PWA, "hidden" is what "closed" looks like), so a
    visible session — an open settings menu, a mid-tap — is never yanked, and the next resume boots
    the new version with no visible refresh. `SKIP_WAITING` and the reload stay atomic: activating
    without reloading a stale page would let lazy-loaded chunks miss under the new worker's
    precache. If the app is never hidden with a blank canvas, the waiting SW activates on the next
    full launch as before (it activates when the old SW loses all clients).
* Also calls `checkVersionMismatch()`: fetches `/version.json` (not precached; always network) with
  `cache: 'no-store'`, compares its `version` field against `__APP_VERSION__` (a Vite compile-time
  constant). If they differ the running SW is serving stale HTML, so it redirects to
  `?v=<deployed-version>`, which the SW's NetworkFirst handler sees as an uncached URL and fetches
  fresh from the origin. The `?v=` param is stripped from the URL on the next init. This is the
  escape hatch for clients already stuck on a broken SW (e.g. from before this update lifecycle was
  in place). That redirect is a hard navigation, so it obeys the same blank-canvas condition as the
  waiting-worker reload — and reads the flag **after** the fetch resolves, not when the check is
  kicked off, because the response can land seconds into a session in which the child is already
  drawing (ADR-0072). An inked canvas cancels the redirect for that boot; the check runs once per
  init, so a stale session recovers on the next blank-canvas launch rather than through a deferred
  retry.

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

**+** Offline coloring begins with one complete canonical Farm book while the initial install omits
both 11.66 MiB of responsive derivatives and every non-starter book. Installed books become complete
offline units. Online responsive requests still receive the smaller candidate.

**+** The runtime-generated SvelteKit environment module is explicitly precached, so an offline
navigation can hydrate rather than stopping after server-rendered markup.

**+** The `version.json` cache-bust handles clients that were already stuck on a broken SW before
this strategy was locked in, without requiring a server-side redirect or unregistering the SW.

**+** The canvas-empty guard covers *every* path that can navigate the page, not just SW activation.
A single deploy makes every returning client stale at once, so the cache-bust redirect fires far
more often than a waiting worker does; leaving it unguarded meant the most common navigation was the
one exempt from the invariant the rest of the module defends.

**-** Several vite-plugin-pwa defaults must be explicitly overridden (`registerType`,
`navigateFallback`, `skipWaiting`, `manifest`, `globPatterns`). A future upgrade to vite-plugin-pwa
could silently re-introduce a conflicting default — the config and this ADR should be reviewed
together on any major version bump.

**+** A cold online launch never visibly reloads: the page is already the deployed version (HTML is
NetworkFirst), so the freshly installed worker activates silently instead of reloading a current
page. With multiple deploys a day, this was the most common visible refresh.

**-** Deferring an update mid-drawing means a user might run old JS code under a new SW for the
duration of a drawing session. In practice this is safe because the new SW serves new assets and the
old SW's cache is cleaned up by `cleanupOutdatedCaches`, but it means the app version in memory and
the SW version in control can briefly diverge.

**-** A stale visible session keeps running its old build until the app is next hidden with a blank
canvas — a deeper version of the divergence above, deliberately traded for never reloading a visible
session. If the canvas is never blank, or the app is never hidden, the update defers until the app
is closed and reopened.

**-** The silent-activation decision costs one extra `/version.json` fetch per pending update (not
per check), and depends on that endpoint staying un-precached and un-cached; an unreachable
`version.json` degrades safely to the hidden-edge reload path.

**-** The guarded cache-bust narrows the escape hatch: a client on stale HTML that starts drawing
before `/version.json` answers keeps running that stale HTML for the rest of the session. The
alternative — discarding a toddler's in-progress drawing, which nothing autosaves — is worse, and
this is the tradeoff already accepted for waiting workers. If a stuck client ever needs recovery
sooner, the fix is to stash the pending version and retry from `checkForUpdates()` when the canvas
empties, mirroring the `owed` state.

**-** `version.json` adds one extra network round-trip per page load (async, non-blocking, only in
production). It fails silently when offline.

**-** The responsive-coloring handler is serialized into the generated worker by Workbox. It must
remain self-contained; a unit test evaluates the serialized function to guard that constraint.
