# ADR-0103: Ship One Starter Coloring Book and Install the Rest as Verified Background Packs

**Status:** Active — implements issue #200 and amends
[ADR-0022](0022-pwa-service-worker-strategy.md),
[ADR-0042](0042-static-media-cache-invalidation.md), and
[ADR-0045](0045-coloring-picker-thumbnails-and-prefetch.md). **Date:** 2026-08

## Context

The eight-book coloring catalog had become most of both offline installs. Native packages bundled
every canonical runtime image, while the PWA precached every canonical book. That made first install
pay for pictures a child might never open and tied future catalog growth directly to app-download
size.

The picker cannot expose an incomplete book. A book needs its cover, all page thumbnails, light and
dark overlays, and light/night Magic fills before any of its pages can work offline. Downloads also
must not compete with early engine boot or pointer handling: the drawing route is usable before
catalog expansion begins, and no asset-store work belongs on the drawing hot path.

We considered three alternatives:

1. Keep every book bundled. This preserves the simplest offline model but does not solve install
   growth.
2. Bundle every cover thumbnail, then download a book when selected. This advertises unavailable
   content, introduces a child-facing wait, and still makes the initial bundle grow with the
   catalog.
3. Bundle one complete starter book and install whole additional books in the background. This gives
   a complete offline picker immediately and lets availability expand only at atomic book
   boundaries.

## Decision

Choose option 3. **Farm** is the starter book. The initial native export and PWA precache contain
only Farm's 73 canonical runtime files: its cover thumbnail and, for all six pages and both
orientations, pen/chalk thumbnails, light/dark alpha overlays, and light/night fills. Authoring
outlines, responsive web derivatives, and all seven other canonical book directories remain outside
the initial install. The deployed web origin still serves every catalog file so it can supply packs.

### Versioned integrity manifest

Each build emits `/coloring/manifest-<app-version>.json`. `books.ts` owns the exact runtime-file set
for every book; the build reads those files and records each path, byte length, and SHA-256 digest.
The manifest also names the starter book and total bytes per book.

An installer writes each verified file into a version-scoped store, one book and one file at a time.
It publishes an `.installed` marker only after every file in that book passes both length and digest
verification. The picker derives its book list from those markers, so a partial or interrupted pack
is never visible. A new app version gets a new store namespace and old namespaces are removed.

### Storage and background execution

The same TypeScript store contract has platform-specific implementations:

* **Web/PWA:** a versioned Cache Storage cache holds canonical responses and install markers. The
  service worker checks this cache before the network for canonical coloring requests. Responsive
  requests retain ADR-0022's network-first route and fall back to the installed canonical response
  offline. The responsive runtime route must remain before the canonical pack route because Workbox
  uses the first matching route.
* **Android:** a constrained WorkManager job streams into `noBackupFilesDir/coloring`, verifies
  SHA-256 while writing, atomically renames each `.part` file, and writes the marker last. Work is
  unmetered by default and pauses under Data Saver.
* **iOS:** a discretionary background `URLSession` downloads into Application Support. The coloring
  root is excluded from backup, job progress is persisted, and AppDelegate reconnects background
  session events after suspension or system termination. Expensive and constrained network access
  are disabled by default.

#### Android Play Asset Delivery canary

Android has two distribution flavors over that shared store contract:

* `generic` contains only the WorkManager/HTTPS implementation. It is the debug, emulator, sideload,
  and non-Play build, so the Android API 24 support floor and ordinary local tooling do not depend
  on Google Play delivery services.
* `play` adds the official Play Asset Delivery library. Its AAB carries Dinosaur as an on-demand
  `coloring_dinosaur` asset pack. The native store asks Play for that pack first on the default
  unmetered policy, verifies the delivered files against the same manifest SHA-256/length contract,
  and publishes the same installed-book result. Unsupported, failed, or confirmation-requiring Play
  requests fall back to the WorkManager/HTTPS path.

Distribution capability, not Android version, selects the source. Product flavors decide whether the
Play API exists in the binary; the `play` runtime then checks whether the requested pack has a
usable file-backed location. This avoids treating an OS release as a proxy for Play Store install,
Play services availability, or alternate-store compatibility. The initial canary is deliberately one
non-starter book; moving another book to PAD means adding it to the build-owned pack list and the
drift-guarded runtime mapping.

The canary exists to learn Play Asset Delivery's operational shape before considering it for more of
the catalog: internal-track delivery behavior, update invalidation, failure recovery, Play Console
workflow, and Families-policy disclosure. It is not justified by current hosting savings. Dinosaur
is 73 files totaling about 4.57 MiB, and no measured hosted-bandwidth cost presently requires moving
those bytes to Google's CDN.

The canonical `npm run android:bundle` therefore continues to build the signed generic AAB used by
release and artifact-publishing automation. `npm run android:bundle:play` builds the explicit
internal-track canary and validates its exact Dinosaur file list and bytes; the matching
`android:verify:play` and `android:open:play` commands cannot silently inspect a stale generic or
Play artifact. Promoting the Play flavor to the canonical release requires a successful
internal-track install, download, update, offline-restart, removal, and HTTPS-fallback smoke test.

Three narrower Android alternatives were rejected for the canary:

1. **Keep HTTPS only until hosting cost becomes material.** This remains the public-release default,
   but postponing all PAD work would not answer the operational questions the canary exists to
   investigate.
2. **Ship the Play library in one flavor and detect availability at runtime.** The library supports
   the API 24 floor, but an OS version does not establish Play install provenance or alternate-store
   asset-module support. A single binary would also add a Play SDK and its disclosure to sideload
   and alternate-store builds that cannot benefit from the pack module.
3. **Use `fast-follow` delivery.** Automatic post-install transfer would run outside Splotch's
   parent-controlled mobile-data policy. On-demand delivery preserves that policy and deliberately
   exercises fetch, recovery, and HTTPS fallback behavior; a bounded attempt prevents Play from
   blocking the sequential catalog queue.

The Parent Settings Coloring section can allow automatic downloads over mobile data and can remove
all downloaded books. Removal cancels/pauses installation for the current app session, clears
versioned storage, and immediately returns the picker to Farm.

### Scheduling and drawing-path boundary

The route mounts only a tiny idle scheduler. The manifest loader, policy, Cache Storage/Capacitor
store, hashing, and download loop live behind a dynamic import started at idle. Books install
strictly sequentially in manifest order. Web starts each file only from an idle callback; Android
and iOS perform file and hashing work in native background facilities. No drawing engine, pointer,
stroke, commit, undo, or export module imports the downloader.

Installed native paths are resolved at the `books.ts` URL boundary. Web retains canonical URLs so
the service worker and export compositor share the same cache authority. This leaves the canvas and
Magic-fill consumers unchanged.

## Consequences

* **+** A fresh picker is completely usable offline with Farm and all six Farm pages; additional
  books appear one at a time only when complete.
* **+** The measured native static export is about 6.5 MB instead of carrying roughly 44 MB of
  additional runtime books. The web precache is about 6.7 MB and has a 12 MB regression budget that
  rejects a second bundled book.
* **+** SHA-256 and byte-length checks make interrupted, stale, or corrupted responses
  non-publishable. Version namespaces make catalog changes deterministic.
* **+** Native background facilities can continue useful transfer work while the WebView is not
  actively executing JavaScript, subject to each operating system's scheduler.
* **+** Catalog growth increases hosted storage and post-install transfer, not app-store or PWA
  install size.
* **+** Play installs can adopt store-native delivery one book at a time without raising the OS
  floor or removing the already-shipped HTTPS fallback.
* **+** Alternate stores, sideloads, emulators, and development builds remain independent of Play
  Asset Delivery.
* **-** A fresh offline install exposes only Farm until it has had an online background session.
* **-** The deployed origin must retain the exact manifest-addressed stable paths for the lifetime
  of the corresponding app version. Verification deliberately rejects mismatched CDN bytes rather
  than accepting a visually plausible stale file.
* **-** Three storage backends and two native lifecycle integrations replace the former static-only
  model. Web, Android, and iOS builds plus bundle guards cover their shared contract.
* **-** Android release automation owns a generic public artifact plus an explicit Play canary. The
  Play build must enable its asset-pack module, and invoking an arbitrary Gradle release task is not
  equivalent to either canonical command.
