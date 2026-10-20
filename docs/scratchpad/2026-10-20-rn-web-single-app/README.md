# One React Native web app for every page: technical design (issue 3007)

**Status:** design note, held for the owner's review. Not an ADR: issue 3007 asks for the ADR to be
written with the implementation. The proof step is PR "Compose the web cutover deploy" into
`codex/native-migration` (the `compose-cutover-web.mjs` tool below).

**Base:** `origin/codex/native-migration` at 3c48992d03be7ee6a5bf7bd4b7810cb2a38bdd30, measured
2026-10-20 on a MacBook, Chromium headless from Playwright.

Owner direction this design follows: one web app renders the drawing screen and its child pages,
hand-rolled routing (no Expo Router, whose empty app exported 776,341 more startup bytes in issue
3007's measurement), SSG by default and SSR only where a page needs per-request data, and the `/`
startup caps unchanged (first paint 47,052 bytes, core controls 827,535). Losing shipping users'
on-device data at cutover is accepted.

## What this note answers

1. [Cutover-time hosting](#1-cutover-time-hosting-ledger-row-x64): how the RN export serves `/` on
   splotch.art while SvelteKit and Netlify keep everything else, including the shipping worker's
   handoff, same-origin `/api` (issue 3027's L0160) and branch previews. It was rehearsed end to end
   in a browser.
2. [The end state](#2-the-end-state-after-cutover): one route table, prerendered pages, `/admin`,
   `/api/*` as Netlify Functions, and what is retired.
3. [Page-load budget per page](#3-page-load-budget-per-page), with measured figures.
4. [A sequenced plan](#4-sequenced-plan), each step marked before or after cutover.
5. [Decisions only the owner can make](#5-owner-decisions).

## Measured baseline

From `npm run native:web:build`, `npm run build` and the harness in `harness/`; raw output in
`results/`.

Two measures, kept apart because they answer different questions:

* **Inline bytes**: the executable inline scripts and inline CSS a document carries, which paint it
  without a request. For RN `/` this is exactly `check-native-web-startup.mjs`'s first-paint figure,
  because its boot script holds the bundle in a JSON list that the document never names.
* **Named resources**: every script, stylesheet and preload the document names, which is the rest of
  that checker's `startupResources` measure. On RN `/` that is zero; on the `404.html` shell it is
  the whole bundle and `strict.css`, which the content waits for. On SvelteKit's pages it is JS
  `modulepreload`s for hydration plus `disabled media="(max-width: 0)"` stylesheet links, neither of
  which blocks the first paint.

| Document                        | Paints with                              | Inline bytes                               | Named resources (checker total)        | Fetched before content shows                 |
| ------------------------------- | ---------------------------------------- | ------------------------------------------ | -------------------------------------- | -------------------------------------------- |
| RN `/` (`index.html`)           | prerendered first frame (ADR-0180)       | 45,601 (4,211 JS + 41,390 CSS), cap 47,052 | 0 (45,601); core controls 821,371 held | nothing beyond the document                  |
| RN `/privacy`, `/changelog`     | client render in the `404.html` shell    | 843                                        | 848,210 (849,053)                      | 1,685,327 bytes in 31 files (410,053 brotli) |
| RN `/feedback`                  | same                                     | 843                                        | 848,210 (849,053)                      | 1,687,445 in 32 files (411,129 brotli)       |
| RN unknown path                 | same                                     | 843                                        | 848,210 (849,053)                      | 1,396,960 in 21 files (335,413 brotli)       |
| SvelteKit `/privacy` (shipping) | prerendered HTML, CSS inlined (ADR-0040) | 84,707 (7,417 JS + 77,290 CSS)             | 322,830 (407,537)                      | nothing beyond the document (30,627 brotli)  |
| SvelteKit `/changelog`          | same                                     | 80,809                                     | 294,113 (374,922)                      | nothing beyond the document                  |
| SvelteKit `/beta`               | same                                     | 81,816                                     | 292,503 (374,319)                      | nothing beyond the document                  |

`results/document-bytes.jsonl` has the checker totals (`firstPaintBytes`) and their parts. The RN
secondary-page rows of the last column count every JS and CSS file fetched by the time the page's
heading was visible, so they include the drawing screen's post-paint prewarms: the information pages
render inside the drawing screen, which mounts beneath them (issue 3026). Today a direct visit to
`/privacy` on RN web downloads about five times the bytes shipping's whole page document weighs
before it shows anything, and shows nothing without JavaScript.

## 1. Cutover-time hosting (ledger row X64)

### Deploy shape

One Netlify site, one build, one publish directory. The build runs the SvelteKit build without its
drawing route (next section), the RN export (`npm run native:web:build`), then
`npm run native:web:compose`, and publishes the composed directory.
`tools/stage-netlify-functions.mjs` keeps staging the SvelteKit function unchanged.

`tools/migration/compose-cutover-web.mjs` (the proof PR) builds that directory:

* It refuses a SvelteKit build that still renders `/` (an `index.html` in `web/build`; `+layout.ts`
  prerenders every route), for the reason in the next section.
* It copies `web/build`, then lays over it the RN files the deploy needs: `index.html`, `sw.js`,
  `version.json`, and every file the RN worker precaches. Expo's `metadata.json` and the RN
  `404.html` stay out (see routing below).
* The RN `sw.js` and `version.json` replace SvelteKit's until the web build stops emitting them. Any
  other file both builds write must be byte-identical (today: the manifest and the eight icons the
  RN build copies from `web/static`), or the composition fails before writing anything.
* After copying, every one of the RN worker's 151 precache entries must resolve in the composed
  directory to the bytes its sha384 integrity pins, the content-addressed shell included. A composed
  deploy that fails this would abandon every install.
* It is not wired into `netlify.toml`; that is the cutover switch itself (plan step P5).

### The SvelteKit pages cross a document boundary back to `/`

The Codex review of the proof PR found this, and reproduced it in Chromium. Every retained SvelteKit
page links to `/` (Back to drawing, the SPLOTCH mark, the footer). SvelteKit's client router
intercepts a link to any route it has, so while the web build still has
`web/src/routes/+page.svelte` a click on `/privacy`'s back link mounts the shipping drawing screen
client-side and never requests the RN document. A static-file override of `index.html` alone does
not cut the shipping app over.

The fix is to build the web app without its `/` route. SvelteKit's router then has no match for `/`
and falls back to a full navigation, which Netlify answers with the RN shell. The rehearsal did this
locally by moving `+page.svelte` aside and letting `prerender.handleHttpError` skip `/`, which the
other pages' links make the prerender crawler request:

```js
prerender: {
  handleHttpError: ({ path, message }) => {
    if (path === '/') return;
    throw new Error(message);
  },
},
```

The SvelteKit build itself then succeeded. Its post-build checks (`check-pwa-precache.mjs`, which
expects the prerendered `/`, and the shipping bundle budgets) failed, as they should: they guard the
shipping drawing route, which this build no longer has. Plan step P5 removes them with the route and
`VitePWA`. With that build composed, all three links to `/` on each of `/privacy`, `/changelog` and
`/beta` made a document request for `/` and loaded the RN shell (`results/cutover-rehearsal.json`,
`links to / from …`). The composer refuses a SvelteKit build that still has the route, so this
cannot regress silently.

### Routing order on Netlify

Netlify evaluates, in order:

1. **`netlify.toml` user redirects.** The `.env`/`.git` deny rules and the `/android-beta`,
   `/ios-beta` 308s keep working unchanged.
2. **Static files.** adapter-netlify emits its catch-all function with `path: ["/*"]` and
   `preferStatic: true` (`node_modules/@sveltejs/adapter-netlify/index.js`), so any file in the
   publish directory wins, with Netlify's pretty URLs (`/privacy` → `privacy.html`). The composed
   `index.html` is the RN shell, so `/`, `/index.html`, `/?v=…` and the worker's
   `/?app-shell-build=…` all get it.
3. **The SvelteKit function** answers everything else: `/api/*`, `/admin`, `/feedback` (it has a
   server action, so it is not prerendered), `/design`, `/dev/*` and unknown paths, with SvelteKit's
   `+error.svelte` 404. Because the function matches every path, Netlify never serves a static
   `404.html`, which is why the composer leaves the RN one out.

| Path                     | Served by at cutover                | Rehearsal, online     | Rehearsal, offline (RN worker active) |
| ------------------------ | ----------------------------------- | --------------------- | ------------------------------------- |
| `/`                      | RN shell (static)                   | RN, hydrated          | RN, from precache                     |
| `/privacy`, `/changelog` | SvelteKit prerendered HTML (static) | SvelteKit             | **RN's own page** (shell fallback)    |
| `/beta`                  | SvelteKit prerendered HTML (static) | SvelteKit             | RN not-found page                     |
| `/feedback`              | SvelteKit function (server action)  | function              | RN's own page (shell fallback)        |
| `/admin`                 | SvelteKit function                  | function              | network error; never cached           |
| `/design`, `/dev/*`      | SvelteKit function                  | function              | RN not-found page                     |
| `/api/*`                 | SvelteKit function                  | function, same origin | —                                     |
| unknown                  | SvelteKit function (404)            | function 404          | RN not-found page                     |

The rehearsal (`harness/serve.mjs`, `harness/rehearse.mjs`, `results/cutover-rehearsal.json`) serves
the composed directory with the same precedence (static first with pretty URLs, every other path a
stand-in for the function), on `127.0.0.1`. It is not a Netlify deploy; the plan verifies the real
host before cutover.

### Headers and policy

* The RN documents carry their own CSP meta tag (`tools/migration/lib/native-web-csp.mjs`), whose
  `connect-src` already admits `'self'`. The site-wide `[[headers]] for = "/*"` block in
  `netlify.toml` (frame-ancestors, report-uri, HSTS and the rest) applies to them as it does to
  shipping's prerendered `/`. Nothing in `hooks.server.ts` ever applied to a static file, so nothing
  is lost.
* Two cache rules join `netlify.toml`: `/_expo/static/*` and `/assets/*` immutable for a year. Every
  file under both is content-hashed (Expo names them `name-<md5>.js` and `name.<md5>.webp`), which
  is what `tools/tests/netlify-cache-rules.test.mjs` requires. `/sw.js` and `/version.json` already
  have their no-store rules.
* **Integrity on the real host.** The RN worker pins every entry, the shell included, to the
  exported bytes. If Netlify rewrote HTML (snippet injection, any post-processing), every install
  would fail its integrity check and users would stay on the shipping worker. The first deploy
  preview must fetch `/?app-shell-build=<hash>` and compare its sha384 before cutover.

### The service worker and the handoff from shipping's

Both apps register `/sw.js` at scope `/`, so the deploy that replaces the file updates every
installed shipping registration in place. There is one worker owner after cutover, the RN one.

Rehearsed (`results/cutover-rehearsal.json`, part C): shipping's build was served, five strokes
registered its worker (276 precache entries, 163 of them SvelteKit chunks, plus a
`coloring-packs-v2-compact` cache of 145 entries in the recorded run). The root was switched to the
composed build and the app launched again:

1. The shipping worker's NetworkFirst navigation answered `/` with the RN document from the network.
2. The navigation's update check installed the RN worker. Its install fetches its own shell and
   chunks; it depends on nothing from the shipping page or worker.
3. The RN page found the waiting worker at its own version (`version.json` and the page's meta tag
   come from one build) and activated it silently through shipping's `createPWAUpdates`
   (`pwaUpdates.web.ts` reuses it). The RN worker obeys `SKIP_WAITING`: workbox-build adds that
   listener whenever `skipWaiting` is false.
4. The RN worker's activation replaced the shared `workbox-precache-v2-<scope>` contents: 151
   entries, 62 RN chunks, no SvelteKit chunk left.
5. A third launch was RN and controlled; offline, `/` booted RN from its precache.

What the rehearsal also showed, and what to do about it:

* **Shipping's runtime caches leak.** `coloring-packs-v2-compact` (145 entries in the recorded run;
  downloaded books can make it tens of MB), `pages-v2` and the legacy `pages` cache are never
  deleted: the RN worker has no activate hook beyond Workbox's precache cleanup. Fix: an activate
  step in the RN worker that deletes those names, imported from
  `web/src/lib/pwa/pageCacheCleanup.ts` and the coloring-pack cache keys. Their data is the shipping
  data the owner accepted losing.
* **A visible shipping tab can lose its precache.** If a second shipping tab is open when the first
  applies the update, or an update is owed while visible, the RN activation removes that tab's
  shipping chunks from the shared precache, and lazy loads then go to a network that no longer hosts
  them. This is the same hazard every shipping deploy has today (`updates.ts`), and a reload
  recovers. Keeping the shared cache name is still right: it is what cleans the shipping precache
  up.
* **Nothing pins the `SKIP_WAITING` listener.** Switching the RN worker to `injectManifest` or
  `skipWaiting: true` would silently change the handoff. Fix: assert the listener in
  `check-native-web-precache.mjs`, and correct the comment above `clientsClaim` in
  `build-native-web.mjs`, which says a new worker activates only when every window has closed.
* **Offline answers differ from online ones.** The RN worker answers `/privacy`, `/changelog` and
  `/feedback` with a 5 s NetworkFirst that falls back to its own shell, so offline (or after a 5 s
  stall) those paths show RN's pages while online they show SvelteKit's. `/beta` offline shows the
  not-found page, where shipping's `pages-v2` served a cached copy. Both are acceptable for the
  window and disappear once RN owns those pages.
* **Fallback.** Keep a self-unregistering `/sw.js` ready (skip waiting, delete caches, unregister,
  never `clients.navigate`, which would break the ink rule) as an untested-in-production escape
  hatch, not as the plan.

### Same-origin `/api` (settles L0160)

RN web calls `https://splotch.art/api/*` from every host: `AI_ORIGIN` in `src/ai/contract.ts`,
`FEEDBACK_URL` in `src/feedback/feedbackTransport.ts` and `PACK_ORIGIN` in
`src/offlineLibrary/manifest.ts`. On the composed deploy the API is on the page's own origin, so the
web build should call relative paths, as shipping's `apiUrl` does with an empty
`__NATIVE_API_BASE__`. The rehearsal fetched `/api/free-generation-grant` from the RN page and
reached the function stand-in on the same origin.

The change is a `.web.ts` split of one origin constant, used by all three; native keeps
`https://splotch.art`. It must ship with or after the deploy wiring, because before it a locally
served export has no API on its origin. Effects:

* no CORS preflight for the web app's JSON calls, and the `Origin` header becomes splotch.art's own;
* each branch preview calls its own preview's functions, never production's;
* the CSP's `https://splotch.art` `connect-src` entry stays for the native meta policy and becomes
  unused on web.

### Branch previews

A composed deploy is self-contained: each deploy preview serves its own RN shell, its own worker and
its own `/api` functions, with the site's environment variables, as shipping's previews do today.
Before that works, the Netlify build needs:

* **`ignore`** to watch `experiments/native-architecture` (today a candidate-only change skips the
  build).
* **`dependencies`** (ADR-0070): Netlify installs with `--prod`, and the export needs Expo, React
  Native Web and their peers (all candidate `devDependencies` today), `workbox-build` and
  `happy-dom` (root `devDependencies`, ADR-0180's Node render). That is a `package.json` and
  lockfile change, sequenced after lane L3 (issue 3022) releases the lockfile.
  `npm run lint:deps:prod` (knip over `knip.production.json`) needs the new tool entries.
* Build time grows by the export and its Node render.

### No-JavaScript pages at cutover

Rehearsed with JavaScript disabled (part B): `/privacy`, `/changelog` and `/beta` show their full
content, because SvelteKit still prerenders them. `/` shows only Expo's "You need to enable
JavaScript to run this app." The prerendered frames live in `<template>`s that the boot script
clones, so nothing paints without a script. A `<noscript>` with shipping's friendly copy and links
costs no first-paint bytes (the startup check counts inline scripts and CSS, not markup) and closes
issue 3026's item 6 for `/` and the not-found shell.

### In-app links during the window

RN's in-app links to `/privacy`, `/changelog` and `/feedback` push state and render RN's copies,
while a reload or a shared link loads SvelteKit's. The two match closely (issue 3026), but they are
two implementations of one URL. Options: accept the split for the window (recommended, since the
window ends when the RN pages are prerendered), or have the web links navigate in full to the hosted
pages.

## 2. The end state after cutover

### One route table

`experiments/native-architecture/src/information/appPages.ts` stays the single route table and gains
what the build needs to prerender each page. Shape, not final code:

```ts
export const APP_PAGES = {
  drawing: { path: '/', render: 'ssg', document: 'drawing' },
  privacy: { path: '/privacy', render: 'ssg', document: 'page' },
  changelog: { path: '/changelog', render: 'ssg', document: 'page' },
  feedback: { path: '/feedback', render: 'ssg', document: 'page' },
  beta: { path: '/beta', render: 'ssg', document: 'page' },
  admin: { path: '/admin', render: 'ssg', document: 'admin' },
} as const satisfies Record<string, AppPageRoute>;
```

* `APP_PAGE_PATHS`, `appPageAt`, the worker's navigation matchers and the composer's file list
  derive from it, so a page added to the table is prerendered, routed and precached in one edit.
* Routing stays hand-rolled: `history.pushState` on web (`platform/appPath.web.ts`), in-memory state
  on native. `notFound` stays a location, not a page.
* Every page is SSG. None needs per-request data: `/feedback` posts to a function, `/admin` reads
  its data through the bearer API after load, and `/beta`'s `?os=` tab is read on the client.
  `render: 'ssr'` stays in the type only once a page needs it, with its reason recorded beside it.
* `/design` is rebuilt against the RN tokens or retired (owner decision). `/dev/*` harnesses retire
  with the Svelte engine; the notch harness, store frames and share cards come back only if still
  used.

### Documents, entries and the bundle boundary

The drawing page keeps ADR-0180's document exactly. Each other page gets its own prerendered
document (`privacy.html`, …), which Netlify serves by pretty URL and the worker precaches.

* **A second bundle entry, never a lazy branch of the drawing entry.** If the drawing entry
  dynamically imported the pages, a `/privacy` visit would still download the 821 KB drawing entry
  before its page chunk, which is today's 1.69 MB problem. If a page entry statically imported a
  module the drawing entry also loads lazily, Metro could hoist it. So the pages get their own entry
  (`src/pageApp.tsx`), built through the same out-of-band Metro request ADR-0180's prerender already
  uses (`createMetroServerAndBundleRequestAsync`), for `platform: web` and for `environment: node`.
* **The drawing startup path cannot grow.** `check-native-web-startup.mjs` measures `index.html` by
  what it names, and nothing in a page entry is named there. A drift guard alongside it fails when
  the drawing entry's chunk graph reaches a page module, the way `check-native-web-precache.mjs`
  already rejects release notes and lazy icons in a startup script.
* **Shared code goes through the lazy surfaces it uses today.** `PageShell`, the reading layout and
  the release notes are reached from the drawing screen only through `RsdSettingsRoute`'s chunk
  (`informationSurface.web.ts`, `notFoundSurface.web.ts`). The page entry imports them statically;
  the drawing entry keeps its lazy edge, so its startup set is unchanged.
* **In-app navigation crosses documents.** From the drawing screen, a link to `/privacy` stays an
  in-app overlay (as now, the paper stays mounted beneath). From a page document, Back to drawing is
  a full navigation to `/`, which the worker answers from precache. Settings' About links can keep
  the overlay; a shared link loads the page document.

### No-JavaScript contract

Every page document carries its full content in the HTML (the Node render, no templates), its CSS
inlined, and a policy hashing its inline scripts. Interactive parts the page cannot do without
script (the grown-up check on external links, the feedback form) render as plain links or a short
"needs JavaScript" note inside `<noscript>`. Done-when 2 of issue 3007 becomes one Playwright spec
that loads every route-table page with JavaScript disabled and checks its heading and body text.

### `/admin`

An unlinked RN web page (ADR-0101): no link from any page, `noindex`, excluded from the worker's
precache and navigation routes (the RN worker already leaves `/admin` to the network), served with
`Cache-Control: no-store`. It logs in through `POST /api/admin/login` and manages tokens through
`/api/admin/tokens` with `Authorization: Bearer <session>`, the contract ADR-0016 kept and the
deleted `/admin/native` page used. The session token lives in memory, so a reload asks for the
secret again; persisting it in `sessionStorage` is the alternative. The cookie form-action front
door (`routes/admin/+page.server.ts`) retires with SvelteKit. No installed client uses it, but it is
browser-visible wire behaviour, so its retirement is the owner's call.

### `/api/*` as plain Netlify Functions

* One V2 function per endpoint under `netlify/functions/`, each with `config.path` set to its
  current `/api/...` path, calling the framework-free code in `web/src/lib/server` as the SvelteKit
  `+server.ts` files do today (8.2k lines of server code; the 1.1k lines of route files are thin).
  The precedent exists: `netlify/functions/` already holds the background generation functions and
  the scheduled purges, type-checked by `npm run check:netlify`.
* One wrapper reproduces what `hooks.server.ts` adds to every `/api/*` response: the CORS headers
  and `OPTIONS` answer, the default `Cache-Control`, the security headers
  (`web/src/lib/apiHeaders.ts`), and `handleError`'s logging. SvelteKit's CSRF guard is wire
  behaviour too: a cross-site form POST from an untrusted origin gets a 403 before any handler runs,
  with `https://localhost` and `capacitor://localhost` trusted (`web/svelte.config.js`). The wrapper
  reproduces that check and its trusted list.
* **Wire-diff test.** One test drives each endpoint with the recorded requests of `docs/API.md` (and
  the legacy multipart `generate-image` body, ADR-0064) through both the SvelteKit handler and the
  function, and compares status, headers and body. `test:browserless` and `test:api:smoke` then run
  against the functions, and a pre-cutover Capacitor build completes an AI generation and a report
  against a deploy preview.
* Functions with the same path as a static file never collide: every `/api/*` path is a function.

### Retired

SvelteKit, `@sveltejs/adapter-netlify`, `@sveltejs/adapter-static`, `@sveltejs/vite-plugin-svelte`,
`svelte-check`, `vite-plugin-pwa` (the RN worker uses `workbox-build` directly), `web/src/routes`,
the Svelte components and engine, `tools/stage-netlify-functions.mjs`, and the composer itself. The
`web/` directory keeps only what the functions and the RN build still import (`securityPolicy.ts`,
`lib/server`, `lib/pwa` helpers, `static/`), until those move. `netlify.toml` then publishes the RN
export and routes `/api/*` to functions.

## 3. Page-load budget per page

Every figure in this table is in `check-native-web-startup.mjs`'s own measure, applied per document:
inline bytes plus named resources. An RN page document built like `/` names no script or stylesheet
(its boot script holds the bundle in a JSON list), so its whole figure is its inline bytes.
Shipping's SvelteKit documents also name their hydration `modulepreload`s, which do not block their
paint; their checker totals are shown beside their inline bytes so the comparison is explicit.

| Page         | Today, RN web (checker total)      | Cutover window                                   | End state, first paint (checker total) | End state, interactive                        |
| ------------ | ---------------------------------- | ------------------------------------------------ | -------------------------------------- | --------------------------------------------- |
| `/`          | 45,601, cap 47,052                 | unchanged: the composer copies the bytes         | unchanged cap                          | core controls 821,371, cap 827,535, unchanged |
| `/privacy`   | 849,053; 1,685,327 fetched to show | SvelteKit: 407,537 total, of which 84,707 inline | ≤ 84,707, all inline (proposed cap)    | page entry: 323,984 RN Web floor + page code  |
| `/changelog` | 849,053; 1,685,327 fetched to show | SvelteKit: 374,922 total, 80,809 inline          | ≤ 80,809                               | as `/privacy`                                 |
| `/beta`      | not served                         | SvelteKit: 374,319 total, 81,816 inline          | ≤ 81,816                               | as `/privacy`                                 |
| `/feedback`  | 849,053; 1,687,445 fetched to show | SvelteKit SSR (function)                         | measured when built; no-JS form note   | page entry + the form                         |
| `/admin`     | not served                         | SvelteKit SSR (function)                         | measured when built; never precached   | admin entry, not counted against pages        |

* The end-state caps are proposals: shipping's inline bytes, the part of its document that paints
  without a request, so no page paints from more than it does today. Each is set from the page's
  measurement plus headroom when its prerender lands, by ADR-0179's rule, in a per-document table
  that `check-native-web-startup.mjs` reads instead of its single `index.html`. A page document that
  named its bundle would fail by the whole bundle, as `/` already does.
* The page entry's interactive budget has a known floor: an empty React Native Web app is 323,984
  bytes (`REACT_NATIVE_WEB_FLOOR_BYTES`), against the 292–323 KB of JS and CSS shipping's documents
  name for hydrating these pages. A page can show its content without any of it, since its HTML is
  complete; the bundle only adds the grown-up gate, the contents disclosure and in-app navigation.
* The `/` numbers do not move in this PR: `native:web:build` reports first paint 45,601 and core
  controls 821,371 before and after it.

## 4. Sequenced plan

Each step is one PR. **Before cutover** steps land on `codex/native-migration`; P5 is the cutover
switch itself.

| Step | When       | PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Touches                                                         |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| P1   | before     | **This proof.** The composer, its rules and this rehearsal.                                                                                                                                                                                                                                                                                                                                                                                                                | `tools/migration/compose-cutover-web.mjs`, test, `package.json` |
| P2   | before     | Pin the handoff: assert the `SKIP_WAITING` listener in the precache check, fix the `clientsClaim` comment, add an activate step that deletes `pages`, `pages-v2` and `coloring-packs-*`.                                                                                                                                                                                                                                                                                   | RN worker config (another lane's file now)                      |
| P3   | before     | `<noscript>` friendly copy and links in the RN shell and its `404.html`.                                                                                                                                                                                                                                                                                                                                                                                                   | prerender / boot files (another lane's)                         |
| P4   | before     | Same-origin web API: one origin constant with a `.web.ts` split; `AI_ORIGIN`, `FEEDBACK_URL` and `PACK_ORIGIN` read it. Lands with P5, or behind it.                                                                                                                                                                                                                                                                                                                       | `src/ai`, `src/feedback`, `src/offlineLibrary` (another lane's) |
| P5   | at cutover | Netlify wiring: remove the SvelteKit `/` route (with `prerender.handleHttpError` skipping `/`, and the shipping drawing route's post-build checks), build both and compose, publish the composed directory, `ignore` watches the candidate, the RN build's packages move to `dependencies`, immutable rules for `/_expo/static/*` and `/assets/*`, drop `VitePWA` from the web build. Verified on a deploy preview: shell integrity, the handoff rehearsal, the API smoke. | `netlify.toml`, `package.json`, lockfile (after L3)             |
| Q1   | after      | Route table with render modes; the page entry and its Node render; `/privacy` as the first prerendered page with its no-JS spec and first-paint cap; the drawing-entry drift guard.                                                                                                                                                                                                                                                                                        | `appPages.ts`, prerender tool, startup check                    |
| Q2   | after      | `/changelog`, `/beta` (and its `?os=` tabs; the 308s stay in `netlify.toml`), and the not-found document.                                                                                                                                                                                                                                                                                                                                                                  | pages, route table                                              |
| Q3   | after      | `/feedback` as a page posting to `/api/report`, with its no-JS note.                                                                                                                                                                                                                                                                                                                                                                                                       | feedback page                                                   |
| Q4   | after      | `/admin` as an unlinked RN page on the bearer API.                                                                                                                                                                                                                                                                                                                                                                                                                         | new admin page                                                  |
| Q5   | after      | `/api/*` as Netlify Functions with the wire-diff test, smoke tiers, and an old Capacitor build's generation and report.                                                                                                                                                                                                                                                                                                                                                    | `netlify/functions`, `web/src/lib/server`                       |
| Q6   | after      | `/design` rebuilt or retired; `/dev/*` retired.                                                                                                                                                                                                                                                                                                                                                                                                                            | routes                                                          |
| Q7   | after      | Remove SvelteKit and its toolchain, the composer and the function staging; `netlify.toml` routes every path to the RN export or a function; the ADR.                                                                                                                                                                                                                                                                                                                       | `web/`, `package.json`, ADR                                     |

Q1 is the riskiest post-cutover step: it decides how a second entry is bundled and proves the
drawing startup set does not move. Q5 is the longest, but its risk is contained by the wire-diff
test.

## 5. Owner decisions

1. The in-app links during the window: accept RN's overlay copies alongside SvelteKit's documents,
   or navigate in full to the hosted pages.
2. Whether the cutover deploy's handoff needs a deploy-preview rehearsal on real Netlify before
   cutover (it needs a preview, which only the owner can authorize).
3. `/design`: rebuild against the RN tokens, or retire.
4. `/admin`: retire the cookie form-action front door with SvelteKit, and keep the bearer session in
   memory or in `sessionStorage`.
5. `/feedback` without JavaScript: a "needs JavaScript" note, or a form POST to a function.
6. The end-state per-page first-paint caps: shipping's measured figures, or tighter.

## Files

* `harness/serve.mjs`: a Netlify-shaped static server (static first with pretty URLs, every other
  path a function stand-in) whose root can be switched to simulate a deploy landing.
* `harness/rehearse.mjs`: the browser rehearsal (composed deploy online, offline and without
  JavaScript, every link to `/` on the retained SvelteKit pages, and the handoff from an installed
  shipping worker). The `composed` root is `npm run native:web:compose` over a web build without its
  `/` route (see "The SvelteKit pages cross a document boundary back to `/`"); the `shipping` root
  is a copy of an ordinary `npm run build`. Run with the server on a free port:
  `node docs/scratchpad/2026-10-20-rn-web-single-app/harness/serve.mjs '{"composed":"<dist/cutover-web>","shipping":"<copy of web/build>"}' <port>`,
  then `node …/harness/rehearse.mjs http://127.0.0.1:<port>`.
* `harness/measure-docs.mjs`: first-paint bytes of the SvelteKit and RN documents, run from the repo
  root after both builds.
* `harness/measure-rn-pages.mjs`: the JS and CSS an RN web secondary page fetches before its content
  shows.
* `results/`: the outputs quoted above.
