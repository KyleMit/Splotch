# One React Native web app for every page: technical design (issue 3007)

**Status:** design note. Not an ADR: issue 3007 asks for the ADR to be written with the
implementation, which is the last step of the plan below. Steps 1 and 2 are in progress.

**Base:** measured on `origin/codex/native-migration` at 3c48992d03be7ee6a5bf7bd4b7810cb2a38bdd30,
2026-10-20, on a MacBook with Chromium headless from Playwright. Revised the same day for the
owner's direction below.

**Owner direction, 2026-10-20** (issue 3007):

> "when we cutover, I'd like to have routing solved and get rid of sveltekit by the time we pull in
> RN. Let's solve that portion first."

The owner also ruled out rollout mitigations and backward compatibility: about ten real users, no
SLA, and stored settings may be lost. So SvelteKit is gone before RN replaces shipping, and cutover
publishes a site that is already all RN plus Netlify Functions.

The earlier direction still holds:

* one web app renders the drawing screen and its child pages;
* routing is hand-rolled, without Expo Router, whose empty app exported 776,341 more startup bytes
  in issue 3007's measurement;
* pages are SSG by default, SSR only where a page needs per-request data;
* the `/` startup caps do not move: first paint 47,052 bytes, core controls 827,535.

## What this note answers

1. [Cutover-window hosting](#1-cutover-window-hosting-superseded): what the rehearsal of RN-over-
   SvelteKit showed, and why it is no longer the plan.
2. [The end state](#2-the-end-state-built-before-cutover): one route table, prerendered pages,
   `/admin`, `/api/*` as Netlify Functions, the hosting, and what is retired. This is the plan to
   build before cutover.
3. [Page-load budget per page](#3-page-load-budget-per-page), with measured figures.
4. [The pre-cutover plan](#4-pre-cutover-plan), in PR-sized steps.
5. [Decisions only the owner can make](#5-owner-decisions).
6. [`/design` on RN web, and the `/dev/*` triage](#6-design-on-rn-web-and-the-dev-triage) (step 6).

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

## 1. Cutover-window hosting (superseded)

The first version of this note planned a cutover window. One Netlify deploy would serve the RN
export at `/` while SvelteKit kept every other page and `/api/*`, and installed shipping workers
would hand over to the RN one (ledger row X64). A composer tool assembled that deploy, and a local
Netlify-shaped rehearsal in Chromium drove it (`harness/serve.mjs`, `harness/rehearse.mjs`,
`results/cutover-rehearsal.json`).

What the rehearsal showed:

* **Static files win.** adapter-netlify's catch-all function is `preferStatic`, so the RN shell
  answered `/`. SvelteKit's prerendered `/privacy`, `/changelog` and `/beta`, and its function for
  `/feedback`, `/admin`, `/api/*` and unknown paths, kept working. A `fetch('/api/…')` from the RN
  page reached the function on its own origin.
* **SvelteKit's router had to lose `/`.** While `web/src/routes/+page.svelte` existed, the client
  router kept "Back to drawing" inside the shipping app and never requested the RN document. The
  Codex review found this. Without the route, all nine links to `/` on those three pages loaded the
  RN shell.
* **The handoff worked.** An installed shipping worker served the RN document on the next launch.
  The RN worker then installed and activated silently, and offline `/` booted RN.
* **It left loose ends:**
  * shipping's `coloring-packs-v2-compact`, `pages-v2` and `pages` caches were never deleted;
  * offline, `/privacy` showed RN's page while online showed SvelteKit's;
  * `/` without JavaScript showed only Expo's "enable JavaScript" line.

**Why it is no longer the plan:** the window existed to keep SvelteKit's pages alive while RN took
`/`, and to protect installed users across the switch. The direction removes both needs. SvelteKit
is retired before cutover, and the handoff, old-cache cleanup and settings compatibility are not
required. The composer (`tools/migration/compose-cutover-web.mjs` and its test) was removed before
PR 3095 merged. Its source is in that PR's commits b3e66875589a2c9bfb1510a8d036cba56f3c1c4b and
de563ff2af481ed0efb7cd54e72299daaf4e022d if the rehearsal ever needs rerunning. The hosting facts it
established carry into section 2.

## 2. The end state, built before cutover

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

* `APP_PAGE_PATHS`, `appPageAt`, the worker's navigation matchers and the publish file list derive
  from it, so a page added to the table is prerendered, routed and precached in one edit.
* Routing stays hand-rolled: `history.pushState` on web (`platform/appPath.web.ts`), in-memory state
  on native. `notFound` stays a location, not a page.
* Every page is SSG. None needs per-request data: `/feedback` posts to a function, `/admin` reads
  its data through the bearer API after load, and `/beta`'s `?os=` tab is read on the client.
  `render: 'ssr'` stays in the type only once a page needs it, with its reason recorded beside it.
* `/design` is rebuilt on RN web from the shared tokens, web only (owner, 2026-10-21; section 6).
  `/dev/*` harnesses retire with the Svelte engine; section 6's triage names the ones still used,
  which step 7 ports instead.

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
  the overlay; a shared link loads the page document. Both render the same RN page, so there is one
  implementation per URL.

### No-JavaScript contract

Every page document carries its full content in the HTML (the Node render, no templates), its CSS
inlined, and a policy hashing its inline scripts. Interactive parts the page cannot do without
script (the grown-up check on external links, the feedback form) render as plain links or a short
"needs JavaScript" note inside `<noscript>`. Done-when 2 of issue 3007 becomes one Playwright spec
that loads every route-table page with JavaScript disabled and checks its heading and body text.

The drawing document cannot render without script: its prerendered frames live in `<template>`s the
boot script clones. It gets a `<noscript>` with shipping's friendly copy and links instead. Markup
costs no first-paint bytes, since the startup check counts inline scripts and CSS. That closes issue
3026's item 6 for `/`.

### `/admin`

`/admin` is an unlinked RN web page (ADR-0101):

* no link from any page, and `noindex`;
* excluded from the worker's precache and navigation routes (the RN worker already leaves `/admin`
  to the network);
* served with `Cache-Control: no-store`.

It logs in through `POST /api/admin/login` and manages tokens through `/api/admin/tokens` with
`Authorization: Bearer <session>`, the contract ADR-0016 kept and the deleted `/admin/native` page
used. Where the session token lives, and whether the cookie form-action login
(`routes/admin/+page.server.ts`) retires with SvelteKit, are owner decisions.

### `/api/*` as plain Netlify Functions

* One V2 function per endpoint under `netlify/functions/`, each with `config.path` set to its
  current `/api/...` path, calling the framework-free code in `web/src/lib/server` as the SvelteKit
  `+server.ts` files do today (8.2k lines of server code; the 1.1k lines of route files are thin).
  The precedent exists: `netlify/functions/` already holds the background generation functions and
  the scheduled purges, type-checked by `npm run check:netlify`.
* The wire does not change, because installed Capacitor builds keep calling it. One wrapper
  reproduces what `hooks.server.ts` adds to every `/api/*` response:
  * the CORS headers and the `OPTIONS` answer;
  * the default `Cache-Control` and the security headers (`web/src/lib/apiHeaders.ts`);
  * `handleError`'s logging;
  * SvelteKit's CSRF guard: a cross-site form POST from an untrusted origin gets a 403 before any
    handler runs, with `https://localhost` and `capacitor://localhost` trusted
    (`web/svelte.config.js`).
* **Wire-diff test.** One test drives each endpoint through both the SvelteKit handler and the
  function, and compares status, headers and body. Its requests are the recorded ones in
  `docs/API.md` plus the legacy multipart `generate-image` body (ADR-0064). `test:browserless` and
  `test:api:smoke` then run against the functions, and a Capacitor build completes an AI generation
  and a report against them.
* Functions with the same path as a static file never collide: every `/api/*` path is a function.

### Hosting on Netlify

The rehearsal settled how Netlify answers a site with static documents and functions. At the end
state, `netlify.toml` publishes the RN export and Netlify evaluates, in order:

1. **`netlify.toml` user redirects.** The `.env`/`.git` deny rules and the `/android-beta`,
   `/ios-beta` 308s keep working unchanged.
2. **Static files**, with pretty URLs (`/privacy` → `privacy.html`). `index.html` is the RN drawing
   document, so `/`, `/index.html`, `/?v=…` and the worker's `/?app-shell-build=…` all get it.
3. **Functions** at their `config.path`: every `/api/*` path.
4. **The RN `404.html`** for anything else. With no catch-all function left, Netlify's static 404
   answers again, and it renders the RN not-found page.

Headers and policy:

* The RN documents carry their own CSP meta tag (`tools/migration/lib/native-web-csp.mjs`). The
  site-wide `[[headers]] for = "/*"` block (frame-ancestors, report-uri, HSTS and the rest) applies
  to them as it does to shipping's prerendered `/` today. Nothing in `hooks.server.ts` ever applied
  to a static file, so nothing is lost.
* Two cache rules join `netlify.toml`: `/_expo/static/*` and `/assets/*` immutable for a year. Every
  file under both is content-hashed (Expo names them `name-<md5>.js` and `name.<md5>.webp`), which
  is what `tools/tests/netlify-cache-rules.test.mjs` requires. `/sw.js` and `/version.json` already
  have their no-store rules.
* **Integrity on the real host.** The RN worker pins every precache entry, the shell included, to
  the exported bytes. If Netlify rewrote HTML (snippet injection, any post-processing), every
  install would fail its integrity check. The first deploy of the end state fetches
  `/?app-shell-build=<hash>` and compares its sha384.

The RN web build calls its API by a relative path: its own origin hosts the functions. Today
`AI_ORIGIN` (`src/ai/contract.ts`), `FEEDBACK_URL` (`src/feedback/feedbackTransport.ts`) and
`PACK_ORIGIN` (`src/offlineLibrary/manifest.ts`) all name `https://splotch.art`. They read one
origin constant with a `.web.ts` split instead; native keeps `https://splotch.art`. This settles
issue 3027's L0160:

* the web app's JSON calls need no CORS preflight, and their `Origin` is splotch.art's own;
* each branch preview calls its own functions, never production's;
* the CSP's `https://splotch.art` `connect-src` entry stays for the native meta policy and is unused
  on web.

A branch preview is self-contained: its own RN documents, worker and functions, with the site's
environment variables. The Netlify build needs:

* **`ignore`** watching `experiments/native-architecture` (today a candidate-only change skips the
  build).
* **`dependencies`** (ADR-0070). Netlify installs with `--prod`, and the export needs Expo, React
  Native Web and their peers (all candidate `devDependencies` today), `workbox-build` and
  `happy-dom` (root `devDependencies`, ADR-0180's Node render). That is a `package.json` and
  lockfile change, and `npm run lint:deps:prod` (knip over `knip.production.json`) needs the new
  tool entries.
* More build time, for the export and its Node render.

### Retired

SvelteKit, `@sveltejs/adapter-netlify`, `@sveltejs/adapter-static`, `@sveltejs/vite-plugin-svelte`,
`svelte-check`, `vite-plugin-pwa` (the RN worker uses `workbox-build` directly), `web/src/routes`,
the Svelte components and engine, and `tools/stage-netlify-functions.mjs`. The `web/` directory
keeps only what the functions and the RN build still import (`securityPolicy.ts`, `lib/server`,
`lib/pwa` helpers, `static/`), until those move.

## 3. Page-load budget per page

Every figure in this table is in `check-native-web-startup.mjs`'s own measure, applied per document:
inline bytes plus named resources. An RN page document built like `/` names no script or stylesheet
(its boot script holds the bundle in a JSON list), so its whole figure is its inline bytes.
Shipping's SvelteKit documents also name their hydration `modulepreload`s, which do not block their
paint; their checker totals are shown beside their inline bytes so the comparison is explicit.

| Page         | Today, RN web (checker total)      | Shipping today (SvelteKit)            | End state, first paint (checker total) | End state, interactive                        |
| ------------ | ---------------------------------- | ------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `/`          | 45,601, cap 47,052                 | —                                     | unchanged cap                          | core controls 821,371, cap 827,535, unchanged |
| `/privacy`   | 849,053; 1,685,327 fetched to show | 407,537 total, of which 84,707 inline | ≤ 84,707, all inline (ceiling)         | page entry: 323,984 RN Web floor + page code  |
| `/changelog` | 849,053; 1,685,327 fetched to show | 374,922 total, 80,809 inline          | ≤ 80,809                               | as `/privacy`                                 |
| `/beta`      | not served                         | 374,319 total, 81,816 inline          | ≤ 81,816                               | as `/privacy`                                 |
| `/feedback`  | 849,053; 1,687,445 fetched to show | SSR (function)                        | measured when built; no-JS form note   | page entry + the form                         |
| `/admin`     | not served                         | SSR (function)                        | measured when built; never precached   | admin entry, not counted against pages        |

* The end-state first-paint figures are ceilings: shipping's inline bytes, the part of its document
  that paints without a request, so no page paints from more than it does today. Each page's cap is
  set from its own measurement when its prerender lands (section 5, decision 3), in a per-document
  table that `check-native-web-startup.mjs` reads instead of its single `index.html`. A page
  document that named its bundle would fail by the whole bundle, as `/` already does.
* The page entry's interactive budget has a known floor: an empty React Native Web app is 323,984
  bytes (`REACT_NATIVE_WEB_FLOOR_BYTES`), against the 292–323 KB of JS and CSS shipping's documents
  name for hydrating these pages. A page can show its content without any of it, since its HTML is
  complete; the bundle only adds the grown-up gate, the contents disclosure and in-app navigation.
* The `/` caps stay fixed through every step: first paint 47,052, core controls 827,535.

## 4. Pre-cutover plan

Each step is one PR into `codex/native-migration`. The order puts first what unblocks deleting
SvelteKit soonest: every page SvelteKit serves needs an RN document, and every `/api/*` route needs
a function, before the last step can remove it. Steps 1 and 2 are independent and run in parallel.

| Step | Status      | PR                                                                                                                                                                                                                                                                                                                                                                                  | Touches                                                                                               |
| ---- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | in progress | Route table with render modes; the page entry and its Node render; `/privacy` as the first prerendered page with its no-JS spec and first-paint cap; the drawing-entry drift guard.                                                                                                                                                                                                 | `appPages.ts`, prerender tool, startup check                                                          |
| 2    | in progress | `/api/*` as plain Netlify Functions with the wire-diff test.                                                                                                                                                                                                                                                                                                                        | `netlify/functions`, `web/src/lib/server`                                                             |
| 3    | next        | `/changelog`, `/beta` (with its `?os=` tabs; the 308s stay in `netlify.toml`), the not-found document, and the drawing document's `<noscript>`.                                                                                                                                                                                                                                     | pages, route table, prerender tool                                                                    |
| 4    |             | `/feedback` as a page posting to `/api/report`, with its no-JS note.                                                                                                                                                                                                                                                                                                                | feedback page                                                                                         |
| 5    |             | `/admin` as an unlinked RN page on the bearer API.                                                                                                                                                                                                                                                                                                                                  | new admin page                                                                                        |
| 6    | in review   | `/design` rebuilt on RN web as its own document and entry; `/dev/*` triaged (section 6).                                                                                                                                                                                                                                                                                            | routes, the `design` skill's references                                                               |
| 7    |             | Remove SvelteKit and its toolchain, the drawing route's post-build checks and the function staging. `netlify.toml` publishes the RN export with functions for `/api/*`, with the `ignore`, `dependencies` and cache-rule changes above. The web build's API origin goes relative. Write the ADR. Check shell integrity, the API smoke and a Capacitor generation on a deploy of it. | `web/`, `netlify.toml`, `package.json`, lockfile, `src/ai`, `src/feedback`, `src/offlineLibrary`, ADR |

Step 7 leaves the site cutover-ready: RN serves every page and functions serve `/api/*`. Switching
the stores and the app identity to RN remains the owner's call, outside this plan.

Step 1 is the riskiest: it decides how a second entry is bundled and proves the drawing startup set
does not move. Step 2 is the longest, but the wire-diff test contains its risk.

## 5. Owner decisions

Answered by the 2026-10-20 direction:

* **In-app links load RN pages.** There is no window with two implementations of one URL; every
  link, in-app or shared, reaches an RN page.
* **`/feedback` is an RN page.** Without JavaScript it shows a "needs JavaScript" note; a form POST
  would need a function accepting form bodies just for script-less visitors.
* **No rollout mitigations.** No handoff rehearsal on a deploy preview, no shipping-cache cleanup,
  no preservation of stored settings. Step 7's integrity check stays because it guards the RN
  install itself, not the transition.

Still open, each with a recommendation:

1. **`/design`: rebuild against the RN tokens, or retire.** Answered 2026-10-21: rebuild ("yeah, i
   open it all the time - A is a must"); section 6 has the result. The recommendation was retiring
   it in step 6. It is a reference for whoever styles the app, not a page users visit. Rebuilding it
   costs a page entry and its budget, and the RN token projection
   (`check:migration:rsd-drawing-tokens`) already pins the vocabulary. Rebuild later only if a
   concrete use appears.
2. **`/admin` session storage, and the cookie login.** Recommend keeping the bearer session in
   memory, so a reload asks for the secret again. `sessionStorage` would survive a reload, but
   memory leaves nothing for an injected script to read after the tab reloads, and the page is
   rarely used. Recommend retiring the cookie form-action login with SvelteKit: no installed client
   uses it, and `/api/admin/login` already serves the bearer form.
3. **The exact per-page first-paint caps.** Recommend setting each from its own measurement plus
   ADR-0179's headroom when its prerender lands, with shipping's inline bytes (84,707, 80,809 and
   81,816 for `/privacy`, `/changelog` and `/beta`) as a ceiling no cap may exceed. A text page
   built like `/` should land well under them, and a cap at shipping's figure would leave that slack
   to absorb regressions.

## 6. `/design` on RN web, and the `/dev/*` triage

### `/design`

The styleguide is a web-only document, `design.html`, outside the app's navigation: its path is in
`WEB_DOCUMENT_PATHS` beside the route table, not in `APP_PAGE_PATHS`, so `AppPage` never names it,
the native app has no route to it, and the drawing screen's document treats `/design` as unknown. It
renders the RN app's own tokens (`rsdDrawing/tokens.css.ts`) and components, with each token's value
and usage rule read from the source the RN projection is generated from
(`web/src/lib/design/tokens.ts`, `tokenUsage.ts`).

* **Its own entry**, `src/pageDocument/design/designApp.ts`, rendered in Node from
  `design/prerender.tsx`. The information pages share one page entry; adding the specimens to it
  would have made every information page load them. The drawing-entry drift guard covers it, since
  it sits under `src/pageDocument/`.
* **Its own styles.** `strict.css` holds every React Strict DOM style in `src/`, and every document
  inlines it whole, `/` included. The styleguide's sources are excluded from it
  (`postcss.config.mjs`, `DESIGN_DOCUMENT_STYLE_SOURCES`) and compiled for `design.html` alone, so
  `/`'s first paint and `strict.css`'s hash are unchanged.
* **One layout.** It lays itself out with media queries instead of the window, so it carries one
  variant per theme (`FLUID_LAYOUTS`) where an information page carries eight.
* **Budgets:** DESIGN_BUDGET_LINE

### `/dev/*` triage (report only; step 7 removes)

Found by `rg` over `tools/`, `web/tests/`, `web/src/` (outside the routes), `.ruler/`, `docs/` and
`package.json`, excluding committed evidence logs and the asset-gen idea archive.

| Harness                                              | Still used by                                                                                                                                                                                                                                                                                              | Proposal for step 7                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dev` (index, `dev-harnesses.ts`)                   | `docs/CONTRIBUTING.md`'s route table                                                                                                                                                                                                                                                                       | Retire with the harnesses it lists.                                                                                                                                                                                                                                           |
| `/dev/crash`                                         | `web/tests/error-screen.spec.ts` (shipping's root error boundary)                                                                                                                                                                                                                                          | Retire. The RN boundary (`RsdScreenBoundary`, `RsdErrorScreen`) has its own mount tests.                                                                                                                                                                                      |
| `/dev/engine`                                        | `web/tests/engine-harness.ts` and the Playwright specs on it; the perf harness (`tools/perf/**`, `serve-profile-build.mjs`, the probes); the `run-splotch` skill and its driver; `capture-performance-matrix`'s platform reference; `docs/PROFILING*.md`, `TESTING.md`; `tools/asset-gen/crayon-reference` | Retire with the Svelte engine. Step 7 repoints those docs and skills at the RN app's own probes; no RN counterpart of the bare-canvas harness is needed.                                                                                                                      |
| `/dev/notch`, `/dev/notch/frame`                     | `web/tests/safe-area-matrix.spec.ts` (CI); `docs/SAFE-AREA.md` and the knowledge map; `securityHeaders.ts`'s `FRAMEABLE_ROUTE`; `lint-token-styles.mjs`'s allowlist                                                                                                                                        | Port. It is the only check of the safe-area matrix, by eye and in CI. Keep the framework-free dataset (`lib/devices.ts`, `orientations.ts`, `deviceProfile.ts`) and render the RN drawing screen under each profile's insets on rn-web-chromium; retire the Svelte frames.    |
| `/dev/share-cards`                                   | `npm run gen:share-cards` (`tools/marketing-assets/gen-share-cards.mjs`, `share-card-inputs.mjs`); `web/tests/share-cards.spec.ts`                                                                                                                                                                         | Port. The committed link-preview PNGs keep serving after step 7, but regenerating them needs a renderer. Render `ShareCard` as an RN page document (or a static template) for `gen:share-cards`.                                                                              |
| `/dev/store-frames` (`render`, `identity`, `assets`) | `npm run gen:store-assets` and `:frames`; `gen:readme-hero` (`STORE_FRAME_IDENTITY_PATH`); `tools/mobile/check-static-bundle.mjs` (`storePage` copy); `committed-captures.test.mjs`; ADR-0122; `lint-token-styles.mjs`'s allowlist                                                                         | Port. Store screenshots and the README hero must show the RN app once it ships. The frame data (`lib/geometry.ts`, `pages.ts`, `targets.ts`, `paths.ts`, `marks.ts`) is framework-free and stays; the Svelte frame components and the capture flow move to the RN web export. |

## Files

* `harness/serve.mjs`: a Netlify-shaped static server (static first with pretty URLs, every other
  path a function stand-in) whose root can be switched to simulate a deploy landing.
* `harness/rehearse.mjs`: the cutover-window rehearsal (section 1). It drives the composed deploy
  online, offline and without JavaScript, every link to `/` on the SvelteKit pages, and the handoff
  from an installed shipping worker. Its `composed` root came from the removed composer, at the
  commits section 1 names. It is the record behind `results/cutover-rehearsal.json`, not a step of
  the plan.
* `harness/measure-docs.mjs`: first-paint bytes of the SvelteKit and RN documents, run from the repo
  root after both builds.
* `harness/measure-rn-pages.mjs`: the JS and CSS an RN web secondary page fetches before its content
  shows.
* `results/`: the outputs quoted above. They are the measured baseline the per-page budgets compare
  against.
