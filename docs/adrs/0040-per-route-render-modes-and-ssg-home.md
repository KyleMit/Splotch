# ADR-0040: Per-Route Render Modes — the Home Route Stays Prerendered (SSG), Not Per-Request SSR

**Status:** Active
**Date:** 2026-07

## Context

The web target is built with `@sveltejs/adapter-netlify` (ADR-0001), which is
*capable* of runtime SSR: it emits a `sveltekit-render` Netlify function wired to a
`/*` catch-all with `preferStatic: true`. But most of the app doesn't use it. The
site-wide default is `prerender = true` (`web/src/routes/+layout.ts`, alongside
`ssr = true; csr = true`), so every route that doesn't opt out is prerendered to
static HTML at build time. Because `preferStatic: true` serves a matching static file
without invoking the function, the prerendered routes are served straight from the CDN
and the SSR function only runs for the routes that set `prerender = false`.

This split had never been written down. It surfaced during a question about whether the
home page's server render could be made to respect the visitor's stored preferences and
device orientation — e.g. by intercepting the navigation in the service worker and
passing client state to the server. That's not possible as things stand, and the
reasons are worth recording so the constraint isn't rediscovered the hard way:

- **`/` is SSG, so there is no per-request server render to personalize.** It's baked to
  a single static `index.html` at build time and served identically to everyone (the
  render function's manifest even lists `/` in `prerendered_routes`). The build-time
  render runs with `browser === false`, so `localStorage`-backed settings return their
  defaults and orientation resolves to its `'landscape'` default.
- **A service worker can't supply the missing state anyway.** It has no access to
  `localStorage` (synchronous; denied to SW contexts) and no `window`/`matchMedia`/
  `screen`, so it cannot read preferences without a mirror and cannot know orientation
  at all.
- Switching `/` to per-request SSR to personalize it would cost a serverless invocation
  per load, diverge from the `CAPACITOR=true` static build (adapter-static genuinely
  cannot SSR), and fight the offline-first PWA navigation cache (ADR-0022). Orientation
  still couldn't ride a cookie reliably — it's a viewport property the server doesn't
  know on a cold load.

## Decision

Keep the current per-route split, and keep **`/` prerendered (SSG)**. Personalize the
home route on the **client**, not the server:

| Render | Routes | Why |
|---|---|---|
| **SSG** (prerendered, CDN/bundle-served) | `/`, `/privacy`, `/admin/native` | No per-request input; must also work in the native static export |
| **SSR** (`sveltekit-render` per request) | `/admin` (cookie auth + form actions), `/api/*`, `/dev/*` | Genuinely need request context (cookies, headers, live data) |

Because `/` renders from defaults, anything whose stored/measured value differs from the
default is corrected on the client. To keep that correction from *flashing* on first
paint, prefer mechanisms that are already correct in the prerendered HTML:

1. **Orientation → CSS media queries.** `@media (orientation: …)` is resolved by the
   browser on the prerendered HTML's first paint with no JS. This is the primary
   mechanism; the color palette, actions panel, canvas, and clear button all branch
   layout this way. The Action-center drawer chevron was the last orientation-driven
   piece still computed in JS markup (which flashed the landscape axis on portrait
   phones until hydration); its rotation is now fully CSS, composing a media-query axis
   (`--drawer-axis-rot`) with an open/close flip (`--drawer-open-rot`) keyed off the
   `[data-drawer-open]` attribute (see mechanism 2). Orientation that *can't* be pure CSS
   stays in JS (`lib/state/layout.svelte.ts`): the notch-band edge (combines orientation
   with *measured* insets and native status-bar calls), the coloring-book art (portrait
   vs landscape *image assets*), the clear-button home-corner reset (imperative
   geometry), and the actions-panel palette-clearing offset (needs the *measured* palette
   width).
2. **Pre-paint head-script stamp** (`web/src/app.html`) + CSS. A tiny synchronous inline
   script runs before first paint and stamps `<html>` from `localStorage`, and the
   Action-center panel's CSS reads those stamps so the state is correct at render. The
   same values are kept live through hydration and every change by a publish `$effect` in
   `ActionsPanel.svelte` (one shared target, so there's no competing default), giving
   correctness at **render + hydration + live update**. Stamps:
   - `data-orientation` — boot orientation, also read by `lib/state/layout.svelte.ts` as
     its initial value (CSS media queries remain primary for layout).
   - `--action-btn-scale` — the parent's button-size preference (keep the key/clamp in
     sync with `ACTION_BUTTON_SCALE_*` in `settings.svelte.ts`).
   - `data-drawer-open` / `data-adv` — the Action drawer's open state and the
     advanced-controls master switch.
   - `data-ctl-*` — each Parent-Center control on/off toggle; absent = hidden.

   This is what lets the drawer be **always rendered** (in the DOM) yet shown/hidden and
   the individual controls gated **purely by CSS** — so a returning user who left the
   drawer open, or turned a control off, sees it correctly at first paint instead of the
   drawer flashing open (or a disabled control flashing visible) after hydration. The
   old `{#if}` gates could only ever render the SSG default (drawer closed, all controls
   on). The collapse animates via a grid `0fr↔1fr` accordion (the CSS equal of the old
   Svelte `slide`); closed state is `visibility: hidden` (delayed past the collapse) so
   the buttons are truly inert — out of hit-testing, the a11y tree, and tab order.

The one exception is the AI button, whose visibility also depends on a *runtime*,
non-persisted signal (`network.online`) the head script can't know, and which defaults
hidden (no access token) — so it keeps its reactive binding and needs no stamp. Fully
non-persisted state (the active color always boots to Purple) needs no treatment either.

## Consequences

- **+** The home route stays a static, CDN-served, offline-capable page that is
  identical across web and the native static export — no serverless cost, no
  web/native divergence.
- **+** First-paint orientation is correct without JS (media queries), and every other
  first-paint variable (boot orientation, button scale, drawer open state, each control
  toggle) is seeded before paint by the head script — no flash-of-default-then-correct,
  including for a returning user who left the drawer open or switched a control off.
- **+** The prerender/SSR boundary is now documented (this ADR + the render column in the
  `architecture` skill's route table), so a new `prerender = false` (or a stray
  personalization attempt on `/`) is a deliberate, reviewable choice.
- **−** Personalizing `/` on the server is now explicitly off the table. Doing it later
  means dropping `prerender` for `/`, moving the relevant prefs to a cookie, and adding a
  `+layout.server.ts`/`+page.server.ts` load — with the serverless-cost, native-divergence,
  and PWA-cache trade-offs listed above. Orientation would still need the client.
- **−** The head script duplicates a handful of `localStorage` keys, their defaults, and
  the button-scale clamp from `settings.svelte.ts` (it runs in `<head>` before `<body>`
  exists, so it can only stamp `<html>` — it can't import the source of truth or touch the
  buttons directly). Both files call this out; a mismatch would silently mis-seed until
  hydration corrects it. The `data-drawer-open`/`data-adv`/`data-ctl-*` publish path is
  covered by an E2E test (`flows.spec.ts`, "persisted-open drawer … at first paint").
- **−** The drawer moved from a Svelte `{#if}` + `slide` to always-rendered markup gated
  by CSS (grid accordion + delayed `visibility`). More CSS mechanism, and the buttons are
  always in the DOM — but inert when closed, so no a11y/interaction cost.
- **−** `--action-btn-scale` is now written to `document.documentElement` from a
  component `$effect`, a small reach outside the component's own subtree — justified
  because the value must be seedable from `<head>` before the component exists.
