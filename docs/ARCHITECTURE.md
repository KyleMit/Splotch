# Splotch — High-Level Architecture

This document proposes an implementation architecture for the product defined in
[REQUIREMENTS.md](REQUIREMENTS.md). Where the requirements leave the technology open, each
major decision is presented with the realistic options and their tradeoffs, followed by a
recommendation. Requirement IDs (e.g. PERF-1, ACC-5) are cited as the forcing constraints.

---

## 1. System overview

```
┌──────────────────────────── Client (4 targets) ────────────────────────────┐
│                                                                            │
│  Web app ──── PWA (same build, installed) ── Android app ──── iOS app      │
│  (browser)                                    (web core in    (web core in │
│                                               native shell)   native shell)│
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Shared web core (offline-first)                 │  │
│  │  Input pipeline → Stroke engine → Layered canvas renderer            │  │
│  │  Undo journal · Coloring-book library · Audio · Settings store       │  │
│  │  Parent Center · Install prompt · Service-worker update cycle        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │ platform adapter layer (save, haptics, secure storage,           │
│         │ orientation lock, kiosk detection, Pencil gestures)              │
└─────────┼──────────────────────────────────────────────────────────────────┘
          │  exactly one network feature (AI) + operator console
          ▼
┌──────────────────── Hosted service (static CDN + edge API) ────────────────┐
│  Static hosting: child app, operator console, privacy page (COST-1)        │
│  API: /generate · /verify-code · /verify-key · /admin/* (API-1..4)         │
│  State: allow-list + per-code usage tally in tiny KV (PERS-4)              │
│  Upstream: image-generation AI provider (operator key, server-side only)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

Two deliberately separate halves:

* **The client** is a self-contained offline drawing app. Everything except the AI wand and
  the operator console works with the network cable cut (P-4, OFF-1).
* **The service** is intentionally tiny: static file hosting plus a handful of API endpoints
  and two small operational records (PERS-4, COST-1). It holds the operator's AI key and all
  prompt assembly (API-1) so no client can ever inject text into the model.

---

## 2. Decision: how to ship four targets

The single most consequential choice. PLAT-1 demands web, PWA, Android (Play Store), and iOS
(App Store) at feature parity; PERF-1 demands 60 fps drawing on low-end hardware; PLAT-2 sets
old OS floors (iOS 16.4, Android 7).

### Option A — Web-first core + native WebView shells (Capacitor or equivalent)

One TypeScript/canvas codebase is the product. Web and PWA are the same build; Android and
iOS wrap the identical bundle in a thin native shell with plugins for the few genuinely
native needs (photo-library save, Keychain/Keystore, haptics, orientation lock, Guided
Access detection, Apple Pencil double-tap).

* **Pros:** One implementation of the hard parts (stroke engine, undo journal, magic brush,
  toddler-proofing heuristics) — parity across targets is nearly free and stays free
  (PLAT-1's "stay at parity"). The PWA/offline/update machinery (OFF-1, UPD-1) is native to
  this stack. Canvas-2D drawing at 60 fps in a WebView is well within reach on phone-class
  hardware when the render loop is built for it (see §4). Smallest team surface.
* **Cons:** The WebView *is* the OS floor: Android 7's updatable System WebView and iOS
  16.4's WKWebView bound the JS/CSS features you may ship — PLAT-2 explicitly demands the
  shipped bundle provably runs on the floor (build-target transpilation + a real-device
  smoke test, not hope). Some capabilities need custom native plugins (Pencil double-tap,
  Guided Access state, add-only photo permission). Store review for "web content in a
  wrapper" requires the app to feel fully native (it does: fullscreen canvas, no chrome).
* **Cost profile:** ~1 codebase + ~5 small native plugins.

### Option B — Cross-platform native UI framework (Flutter) for all four

* **Pros:** Single codebase with compiled rendering; excellent canvas performance on native
  targets; first-class store presence.
* **Cons:** Flutter *web* is the weak leg exactly where this product lives: multi-MB initial
  payloads fight PERF-3's ~1.9 s LCP on Slow-4G; CanvasKit/HTML renderers complicate the
  crisp-raster and true-eraser semantics; PWA install/update flows (INST-2, UPD-1's
  blank-canvas-gated reload) are second-class; DOM-level accessibility and browser-floor
  support (Safari 16.4, Firefox 114) get harder, not easier. You'd likely end up shipping a
  separate lightweight web app anyway — two codebases.

### Option C — Fully native per platform (Swift + Kotlin + web)

* **Pros:** Maximum per-platform fidelity: Metal/Skia stroke rendering, PencilKit-adjacent
  input, effortless store compliance, best possible latency.
* **Cons:** Three implementations of a large, subtle spec. Every toddler-proofing heuristic
  (TP-3 edge-gesture disambiguation, INP-2 stream-splitting, UNDO-1 contact groups, the
  magic-brush compositing) is written and *bug-fixed* three times. Parity drift is the
  default state. Only justified if WebView performance measurably fails PERF-1 — which
  should be proven with a spike before paying 3× forever.

### Option D — React Native + separate web app

* **Pros:** Shared JS logic between the two native apps; native rendering surface.
* **Cons:** The core value is in the canvas/gesture layer, which RN shares *least* well
  (Skia canvas bindings exist but diverge from web canvas); you still maintain a distinct
  web implementation of the same engine. Worst of both worlds for this particular app.

**Recommendation: Option A.** The product is a canvas, an audio loop, and pointer events —
the web platform's sweet spot — and half the spec (service worker updates, install prompts,
folder saves, browser floors) is written in web-platform terms. De-risk with an early spike:
run the PERF-1 toddler-session harness inside Android 7-era WebView and an iPhone 8 before
committing. Capacitor over Cordova (maintained, modern plugin API); a hand-rolled
WKWebView/WebView shell is a fallback if Capacitor's floor or plugin model disappoints.

---

## 3. Decision: web framework for the core

The app is a single screen with floating controls and a few modals — no routing, no data
fetching, heavy real-time canvas work. PERF-1 forbids main-thread tasks > 50 ms; PERF-3 wants
LCP ≈ 1.9 s on Slow-4G, personalization applied before first paint.

| | Vanilla TS + tiny store | Svelte | Preact | React |
|---|---|---|---|---|
| Runtime payload | ~0 | ~5 KB | ~11 KB | ~45 KB+ |
| Render-loop interference | none (you own it) | minimal | minimal | scheduler/VDOM in the way |
| UI ergonomics (modals, flyouts, Parent Center) | worst — hand-rolled | best-in-class | good | best ecosystem |
| Risk | ad-hoc structure grows gnarly | low | low | perf tax for no benefit here |

The critical insight: **the drawing path must not run through any framework at all.**
Pointer events → stroke engine → canvas must be a direct, framework-free loop regardless of
choice. The framework only renders the chrome (palette, panels, modals, Parent Center),
which updates rarely.

**Recommendation: Svelte (or Preact — either is fine) for the chrome; zero framework in the
canvas/input path.** Vanilla-everything is viable but the Parent Center, pickers, and modal
choreography are enough UI to want declarative rendering. React's payload and scheduler buy
nothing this app needs.

---

## 4. Canvas & stroke engine

The heart of the app. Constraints: true eraser (TOOL-2), page outlines always above paint
(BOOK-3), magic-brush reveal (TOOL-3/4), lossless rotation round-trip (CANV-2), 2×-capped
DPR (CANV-3), bounded undo memory (PERF-2), 60 fps on low-end (PERF-1).

### Rendering model options

* **Single flattened canvas** — simplest, but a true eraser and always-on-top outlines are
  mutually exclusive on one layer (erasing would cut holes in the page art; outlines would
  have to be redrawn constantly). Rejected by the requirements' compositing semantics.
* **Retained vector scene (SVG / re-render all strokes per frame)** — undo and resize are
  trivial, but repaint cost grows with stroke count; a long toddler session degrades,
  violating PERF-1/PERF-2. Rejected.
* **WebGL/WebGPU stroke renderer** — highest ceiling, needed for pressure-textured brushes
  we don't have. Adds shader pipeline complexity, context-loss handling, and a floor risk on
  old WebViews (PLAT-2). Not justified by round-cap solid-color strokes. Fallback option if
  Canvas2D measurably misses PERF-1.
* **Layered Canvas2D (recommended):**

  ```
  z4  DOM chrome (palette, buttons, modals)
  z3  cursor overlay canvas   — eraser footprint bubble, transient previews
  z2  page-overlay canvas     — coloring-page line art (white = transparent)
  z1  paint canvas            — all child ink; eraser = destination-out
  z0  paper background        — CSS color + tiled grain texture (never repainted)
  ```

  * True eraser is `destination-out` on z1 — paper and page art show through by construction.
  * Page outlines live on z2, permanently above paint (BOOK-3) with zero per-frame cost.
  * Magic brush on a page: stroke geometry is rendered into an offscreen mask, the page's
    "colored twin" is composited through it (`source-in`) onto z1 — revealed paint is then
    ordinary ink (undoable, erasable, over-paintable) exactly as TOOL-3 demands. Twins are
    authored/preprocessed to flat fills with outline pixels removed, so no ghosted lines.
  * Magic brush on blank canvas: same mask composite against a generated gradient bitmap,
    held for the drawing's lifetime (TOOL-4).

### Stroke pipeline

Pointer events (with coalesced events where available — TOOL-1's "all high-frequency
samples") feed per-pointer stroke builders (INP-1 multi-touch: one builder per active
pointer). Points are smoothed into quadratic/Catmull-Rom segments and **incrementally**
appended to the paint canvas each animation frame — never a full repaint per frame. Input
handling is decoupled from rAF so event processing stays cheap even when frames are busy.

The **input front-end** is a small state machine implementing the toddler-proofing rules
before anything reaches the stroke engine: edge-guard buffering (TP-3), post-selection
debounce (TP-5), merged-stream splitting (INP-2), stylus exemptions (TP-3/TP-5/TP-6). This
isolation keeps the heuristics testable as pure functions over event sequences.

### Undo & the stroke journal

PERF-2 explicitly forbids both naive designs — full-canvas snapshots per step (memory) and
full replay from zero (time). Standard hybrid:

* Every completed **contact group** (UNDO-1) appends a step to a journal of compact stroke
  commands (points simplified visually-losslessly, ≤ ~1.5 px — Ramer–Douglas–Peucker).
* A **checkpoint bitmap** (offscreen canvas) is captured every K steps (e.g. 8–10). Undo =
  restore nearest checkpoint ≤ target step, replay the few journal steps after it. Cost is
  bounded by K, not session length. Memory is bounded by (few checkpoints × canvas size) +
  compact journal; steps older than the undo horizon fold into the base checkpoint.
* **Clear** is journaled as a step (undoable, UNDO-1); rotation/resize rebuilds (CANV-2) are
  the same mechanism — replay the journal onto a re-sized canvas, preserving off-screen
  content in the journal so rotation round-trips losslessly. An in-flight stroke keeps
  building during the rebuild and replays onto the new canvas.

---

## 5. Backend service & hosting

Constraints: static CDN for the app (COST-1), tiny editable KV state — allow-list + per-code
tallies (PERS-4), atomic concurrent tally increments ("losing a concurrent usage increment
is not acceptable"), sliding-window rate limits with bounded memory (API-2), 120 s
generation requests (API-1), degrade-don't-throw when storage is down (API-4).

### Option A — Edge serverless: Cloudflare Pages + Workers + KV/Durable Objects

* **Pros:** Static hosting and API on one platform, effectively $0 at this scale; Workers
  KV fits the allow-list (read-heavy, eventual consistency explicitly acceptable per
  PERS-4); a Durable Object (or KV-backed counter with atomic semantics) gives the required
  non-lossy tally increments and clean per-key sliding-window rate limiting; no servers to
  patch. 120 s upstream calls are fine on paid Workers.
* **Cons:** Vendor-specific primitives (DO) — mitigate with a thin storage interface;
  KV's eventual consistency must be kept away from the tally path (it's only fine for the
  allow-list and even there ACC-4 wants next-request revocation → read through the DO or
  use strongly-consistent reads for the revocation check).

### Option B — Serverless functions + managed Redis (e.g. Vercel/Netlify + Upstash)

* **Pros:** Redis gives textbook atomic `INCR` tallies and sliding-window limits (sorted
  sets) with one mental model; functions stay stateless; portable Redis semantics.
* **Cons:** Two vendors; function platforms often cap request duration below 120 s on free
  tiers (must verify); a small always-on Redis bill.

### Option C — One tiny always-on server (Fly.io / small VPS) + SQLite

* **Pros:** Simplest possible mental model; SQLite transactions trivially satisfy atomic
  tallies; in-process rate limiter; no platform quirks; 120 s requests are a non-issue.
* **Cons:** A real (if small) monthly cost and a single instance to keep alive/patched —
  runs against COST-1's "near-zero" spirit; deploys briefly interrupt the API; durability
  depends on volume snapshots.

**Recommendation: Option A** (with the storage layer behind an interface so B/C remain
escape hatches). It matches COST-1 exactly, and PERS-4/ADM-3 were visibly written with a
KV-plus-fallback world in mind (env-seeded allow-list fallback, "edits may not persist"
warning). API-4's degrade path: on storage failure, serve from an env-seeded allow-list and
in-memory tallies, log, and set the console warning flag.

### API surface (all explicit-credential, no cookies — API-3)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/generate` | access code or BYO key | multipart image ≤ 15 MB + style id; prompt assembled server-side from fixed base + allow-listed style suffix; distinct machine-readable outcomes (success / safety-refusal / transient / unauthorized / over-limit / validation) |
| `POST /api/verify-code` | — (rate-limited) | allow-list membership check |
| `POST /api/verify-key` | — (rate-limited) | minimal-cost live probe against the AI provider |
| `POST /api/admin/login` | operator secret | returns derived session (HMAC(secret-version, session-id)); cookie for web console, bearer for in-app |
| `GET/POST/DELETE /api/admin/codes*` | session | issue / revoke / usage view; every mutation returns full resulting state |

Operator sessions are derived, not stored: an HMAC over a rotating server-side secret
version means rotating the operator secret invalidates every session at once (ADM-2) with
zero session storage. All comparisons constant-time; uniform 401s; per-address login
throttle.

The **response classifier** for AI-5 (prose-but-no-image ⇒ safety refusal; empty/failed ⇒
transient) is a small deterministic, unit-tested module in the service — the single choke
point mapping upstream behavior to the client's three failure UX states.

---

## 6. Decision: AI provider integration

The requirements are vendor-neutral but demand: image+instruction → image ("re-render the
child's idea"), strictest vendor safety settings, a cheap/fast tier (COST-1), a
minimal-cost key probe (ACC-2), and the prose-instead-of-image refusal pattern (AI-5).

* **Option A — Google Gemini image generation (Flash-tier image model).** Cheap/fast tier
  exists; image-in/image-out with instruction fits; configurable safety settings; declines
  often arrive as prose-without-image — matching AI-5's classification rule almost
  verbatim; key probe = a one-token text call. BYOK is plausible for parents (free-tier
  keys exist).
* **Option B — OpenAI image models (gpt-image-1 family).** Strong editing quality and
  moderation; costlier per image at comparable quality tiers; BYOK requires a funded
  account (higher parent friction).
* **Option C — Self-hosted open model (SDXL + ControlNet scribble).** Best composition
  preservation from scribbles; but you own the entire safety problem (a red-line risk for a
  toddler product) and a GPU bill — violates COST-1 and the spirit of AI-5. Rejected.

**Recommendation: a provider-agnostic adapter in the service (image + assembled prompt in;
image | refusal | error out), with Gemini Flash-tier as the launch provider.** The adapter
plus the deterministic classifier keeps a vendor swap a one-module change, which matters
because model deprecations are a when, not an if. The red-team suite (AI-5) runs against
the adapter boundary with encrypted probe fixtures, human-reviewed, never in unattended CI.

---

## 7. Offline, caching & the update cycle (web/PWA)

Service worker, hand-rolled or thin-Workbox, implementing UPD-1 precisely:

* **Precache** the app shell + all coloring-book art/thumbnails + sounds on install
  (BOOK-1 "available offline", SND-1 first-stroke-not-silent aided by idle preload).
* **Versioned, content-hashed** core assets; stable-named media served
  stale-while-revalidate with a bounded TTL (≤ 1 week, UPD-1).
* A **never-cached version marker** (`/version.json`): checked at launch, on visibility
  gain, and hourly. A waiting worker activates (and reloads) **only when the canvas is
  blank** — the app, not the SW, decides, because only the app knows canvas state (P-6).
  Startup self-heal: running version ≠ marker ⇒ one forced reload, blank canvas only.
* Manual refresh = network-first with a ~5 s timeout, cache fallback.
* AI wand visibility = parent toggle ∧ credential ∧ `navigator.onLine`/probe (OFF-1).

Native shells bundle all assets (fully offline from install) and update via store releases
on their own cadence (UPD-1).

---

## 8. Platform adapter layer

One narrow interface per capability, feature-detected (PLAT-3: absent ⇒ hidden, never
disabled), with web and native implementations:

| Capability | Web | iOS shell | Android shell |
|---|---|---|---|
| Save image (SAVE-2) | File System Access dir handle → silent writes; else download | Photos add-only permission | MediaStore app album |
| Secure credential (ACC-5) | WebCrypto non-extractable AES key (IndexedDB) wrapping the BYOK + `navigator.storage.persist()` | Keychain | Keystore/EncryptedPrefs |
| Settings persistence (PERS-1) | localStorage (sync read pre-first-paint, PERF-3) | + durable native mirror reconciled at launch (survives WebView-storage eviction) | same |
| Haptics (SND-2) | `navigator.vibrate` where real | Taptic via plugin | Vibrator |
| Wake lock (TP-2) | Screen Wake Lock API | idle-timer disable | FLAG_KEEP_SCREEN_ON |
| Orientation lock (PC-5) | best-effort (installed PWA only) | native lock | native lock |
| Kiosk status (TP-7) | instructions only | Guided Access API | Lock-task/pinning detection |
| Pencil double-tap (INP-3) | — | UIPencilInteraction plugin | — |

Settings live in a single synchronous key-value store read before first paint so a
returning user's control layout is correct at first render (PC-3, PERF-3) — no async
storage on the startup path.

---

## 9. Repository & code structure

Monorepo (the four targets share one core by design):

```
/app          web core: engine/ (input, strokes, undo, compositing — framework-free)
              ui/ (chrome: palette, panels, pickers, Parent Center)
              platform/ (adapter interfaces + web impls)
              sw/ (service worker, update cycle)
/native       Capacitor project + custom plugins (pencil, kiosk, photos, secure storage)
/service      edge API: generate, verify, admin; ai/ (provider adapter + classifier)
              storage/ (KV interface + CF impl + in-memory fallback)
/console      operator console (static SPA, separate bundle — never loaded by kids' app)
/content      coloring books: source art → build pipeline emits portrait/landscape line
              art, outline-free colored twins, ~15 KB thumbnails (BOOK-4, PERF-4)
/perf         deterministic toddler-session harness (PERF-5): scripted pointer replay +
              trace analysis (frame times, long tasks), runnable on web/Android/iOS builds
/redteam      encrypted AI probe fixtures + runner (AI-5; manual, human-reviewed)
```

The coloring-book pipeline is a build step, not runtime code: it guarantees every page has
its orientation pair, outline-stripped twin, and thumbnail, and fails the build if any is
missing (BOOK-1/-3/-4 become build-time invariants).

---

## 10. Key risks & de-risking order

1. **PERF-1 in old WebViews** — the bet behind Option A (§2). Spike first: harness a
   scribble session on an Android 7 WebView device and an iPhone 8 before building UI.
2. **AI composition fidelity + safety** (AI-1/AI-5) — prompt/model iteration with the
   red-team suite early; the adapter keeps vendor swaps cheap.
3. **iOS Kids Category review** (PRIV-4) — the parental-gate open item can force Parent
   Center rework; prototype a compliant gate early so it's a toggle, not a redesign.
4. **File System Access / storage-eviction edge cases** (SAVE-2, PERS-1) — stale directory
   handles and WebView storage eviction need explicit tests, not incidental coverage.
5. **Tally atomicity under the chosen storage** (PERS-4) — verify concurrent-increment
   behavior against the real backend in the API-4 smoke checks.
