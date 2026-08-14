# ADR-0101: The Admin Console Is Web-Only and Unlinked

**Status:** Active **Date:** 2026-08

## Context

ADR-0016 gave the token console two front doors over one server core: the cookie-session `/admin`
for the web, and `/admin/native` — a prerendered static page bundled into the app — talking to
`/api/admin/*` with a bearer session. Both were reached from an in-app affordance: five taps on the
version string in the About section revealed an **Admin** link, persisted in `adminLinkVisible`.

Splotch is submitted to both stores declared for a children's audience. Reviewed against that
declaration, the arrangement has two independent problems.

**The reveal gesture.** An undocumented gesture that unlocks a privileged surface is what Play's
Deceptive Behavior policy and App Review 2.3.1 are written against. Reviewers tap version strings as
routine practice, and what this one produced was a console that mints and revokes AI access tokens
against production (`__NATIVE_API_BASE__` is hard-coded to `https://splotch.art`, ADR-0016's own
last consequence). In a 4+/Families app that is the worst possible thing to find that way.

**What shipping it costs even unlinked.** Deleting the link is not enough. `/admin/native` was
prerendered, so its HTML sat in both bundles; and a route's `prerender` flag governs only HTML — the
route module still compiles into the client bundle, so `/admin`'s console markup and copy shipped
too, with `entry/app.*` mapping the path and adapter-static's `fallback: '200.html'` ready to render
it. A reviewer's string scan finds "Admin access key" in the `.ipa` whether or not anything links
there.

Alternatives considered:

1. **Keep both doors, delete only the gesture.** Rejected: the console's markup still ships, so the
   string scan still finds it, and the on-device console still operates on production data with no
   way for a reviewer to tell it apart from a user-facing feature.
2. **Keep `/admin/native`, gate it behind the parental gate** (ADR-0094). Rejected: the gate exists
   to keep a child out of an adult operation, not to keep a store reviewer out of an internal tool.
   It would also be the only gated surface whose purpose is not a parent-facing one.
3. **Build-time platform branch that keeps the native console in dev builds only.** Rejected: it
   adds a second axis to a bundle that already branches on `CAPACITOR` alone (ADR-0001), for an
   audience of one operator who has a browser.
4. **Web-only, unlinked, excluded from the native bundle at build time.** **Chosen.**

## Decision

The console exists only at `/admin` on the web, and nothing in the app links to it. It is reached by
typing the URL.

* The five-tap gesture, the `adminLinkVisible` setting, its storage key, and the About-section link
  are removed. `web/src/routes/admin/native/` is deleted, along with the now-unreferenced
  `saveAdminSession` / `loadAdminSession` / `clearAdminSession` in `src/lib/secureStorage.ts` (the
  module keeps its Gemini-key duties).
* `/admin` is listed in `NATIVE_EXCLUDED_ROUTES` (`web/nativeExcludedRoutes.ts`), whose Vite plugin
  replaces the **client-facing** route modules (`+page.svelte`, `+page.ts`) with empty stubs when
  `CAPACITOR=true`. `+page.server.ts` is deliberately left alone: it never reaches the client
  bundle, and it owns `export const prerender = false`, which is what keeps the route out of the
  static export.
* `scripts/check-native-bundle.mjs` runs in `postbuild:cap` and fails the build if the console's
  copy appears in the output. Its sentinels are **derived** — read out of `AdminConsole.svelte`'s
  own `placeholder="…"` attributes at scan time — and the extractor throws if it finds none, because
  a guard whose sentinels quietly stop matching is worse than no guard: the build stays green while
  the console returns.

**What ADR-0016 keeps.** The shared server core is untouched and still correct:
`lib/server/admin.ts` (secret verification, the derived HMAC session, constant-time comparison,
invite building), `lib/server/tokens.ts`, and the `/api/admin/*` JSON endpoints with their shared
rate-limit bucket. Those endpoints are still driven by `scripts/lib/adminClient.mjs` in the local
and deploy smoke tests. What this ADR removes is the second **front door**, not the core behind it.

**Residual, stated plainly:** `/admin` still appears as a path in the native bundle's route manifest
(`entry/app.*`). SvelteKit has no route-exclusion API, so the manifest entry survives even though
the module behind it is empty — navigating there in a WebView renders nothing. The compliance
property that matters is that no console code or copy ships, which the postbuild guard enforces; the
inert manifest string is accepted.

## Consequences

* **\+** No privileged surface, and no hidden gesture revealing one, inside an app declared for
  children — the two store findings this addresses.
* **\+** The native bundle is smaller by the console component and its route, and the client bundle
  no longer carries admin copy on either platform's build.
* **\+** One console instead of two: no shared presentational component to keep working against two
  auth transports, and no second set of E2E specs. `AdminConsole.svelte` now has exactly one caller.
* **\+** The bearer-session credential no longer needs to live outside an HTTP-only cookie, which
  retires ADR-0016's first stated downside.
* **−** Token management is no longer possible from a device. The operator needs a browser — on a
  phone that means the mobile web console rather than the installed app.
* **−** The `/api/admin/*` endpoints now have no in-product consumer; their only exercise is the
  smoke tests and this repo's own tooling. That is a real risk of rot, and the reason the API smoke
  test stays in CI rather than being treated as optional.
* **−** The build-time exclusion is a Vite `load` hook keyed on path segments, so a future rename of
  `routes/admin/` silently stops excluding it. The postbuild guard is what catches that, which is
  why its sentinels are derived rather than hard-coded.
* **−** `/admin` remains reachable by URL with no discovery path, so an operator who forgets the
  address has only the docs. Accepted: discoverability is exactly what must not exist here.

## Amendment (2026-08): guard path

The postbuild guard described above as `scripts/check-native-bundle.mjs` now lives at
`tools/mobile/check-static-bundle.mjs` (moved by the mobile tooling consolidation in commit
661ee3153bd8aff6753cb3923199dad9cd4f2328). Its behavior — derived sentinels, fail on console copy in
built output — is unchanged.
