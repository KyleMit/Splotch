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
   phones until hydration); it now composes a CSS-media-query axis rotation
   (`--drawer-axis-rot`) with a JS-driven open/close flip (`--drawer-open-rot`), so the
   axis is correct at first paint. Orientation that *can't* be pure CSS stays in JS
   (`lib/state/layout.svelte.ts`): the notch-band edge (combines orientation with
   *measured* insets and native status-bar calls), the coloring-book art (portrait vs
   landscape *image assets*), the clear-button home-corner reset (imperative geometry),
   and the actions-panel palette-clearing offset (needs the *measured* palette width).
2. **Pre-paint head-script stamp** (`web/src/app.html`). A tiny synchronous inline
   script runs before first paint and seeds the two pieces of first-paint state a
   prerendered document can't otherwise know:
   - `data-orientation` on `<html>` — the boot orientation, read by
     `lib/state/layout.svelte.ts` as its initial value and available as an
     `[data-orientation]` hook (CSS media queries remain primary).
   - `--action-btn-scale` on `<html>` — the parent's button-size preference from
     `localStorage`, so the CSS variable is correct before hydration. It lives on
     `<html>` (not the panel) so the head script and the live `$effect` in
     `ActionsPanel.svelte` write one shared target and the SSR markup carries no
     competing default. Keep the key/clamp in sync with `ACTION_BUTTON_SCALE_*` in
     `lib/state/settings.svelte.ts`.

Preferences that only appear behind a gesture (the drawer defaults closed, so the action
buttons aren't mounted at first paint) and non-persisted state (the active color always
boots to Purple) need neither treatment — there's nothing to flash.

## Consequences

- **+** The home route stays a static, CDN-served, offline-capable page that is
  identical across web and the native static export — no serverless cost, no
  web/native divergence.
- **+** First-paint orientation is correct without JS (media queries), and the two
  remaining first-paint variables (boot orientation, button scale) are seeded before
  paint by the head script — no flash-of-default-then-correct.
- **+** The prerender/SSR boundary is now documented (this ADR + the render column in the
  `architecture` skill's route table), so a new `prerender = false` (or a stray
  personalization attempt on `/`) is a deliberate, reviewable choice.
- **−** Personalizing `/` on the server is now explicitly off the table. Doing it later
  means dropping `prerender` for `/`, moving the relevant prefs to a cookie, and adding a
  `+layout.server.ts`/`+page.server.ts` load — with the serverless-cost, native-divergence,
  and PWA-cache trade-offs listed above. Orientation would still need the client.
- **−** The head script duplicates one `localStorage` key and the button-scale clamp from
  `settings.svelte.ts`. This is called out in both files; a mismatch would silently
  mis-seed the value until hydration corrects it.
- **−** `--action-btn-scale` is now written to `document.documentElement` from a
  component `$effect`, a small reach outside the component's own subtree — justified
  because the value must be seedable from `<head>` before the component exists.
