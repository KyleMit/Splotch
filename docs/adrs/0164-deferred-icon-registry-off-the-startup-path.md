# ADR-0164: Deferred Icon Registry Keeps Lazily Rendered Icons Off the Startup Path

**Status:** Active **Date:** 2026-09

## Context

`Icon.svelte` inlines every icon in `web/src/lib/icons/` through one eager `import.meta.glob`
(ADR-0044 describes why the SVG text is inlined at all). The glob is on the drawing page's static
import path, so every icon ships in a modulepreloaded chunk before hydration — including the ones
only the settings sections, the release notes, the parental gate, the install banner, the AI cards,
and the `/design` styleguide ever render. On 2026-09-11 that chunk was 110,822 bytes of the
525,442-byte startup set measured by `tools/check-bundle-budgets.mjs`, and the startup set had just
crossed the 525,000-byte release budget on `main`.

The budget was set on 2026-08-19 with a 470,860-byte reviewed baseline and 54,140 bytes of headroom.
Feature work consumed that headroom in 23 days (issue #1776 has the day-by-day readings; the
steepest steps were 2026-09-07 to 2026-09-09, +28 kB across the drawing-screen motion, styleguide,
and inventory work). The budget had become a fixed cost every PR touching startup code paid, and the
choice was between raising the number and moving something off the path.

Sourcemap attribution of the startup set showed exactly one slice that was both large and separable:
49 of the 88 `<Icon>` names are referenced only by modules outside the startup chunk graph, and
their SVG files total 51,026 bytes. Everything else on the path is the framework (Svelte, Kit,
`devalue`), the drawing engine, the toolbar, and 136,771 bytes of inlined CSS — roughly 85 kB of
which belongs to lazily imported components, because SvelteKit collects the stylesheets of a route
node's *dynamic* imports into its inline set (`find_deps(…, true)` in `@sveltejs/kit`'s Vite
plugin). That CSS is a framework behaviour with no per-chunk opt-out and is deliberately left alone
here.

Alternatives weighed:

* **Raise the budget.** Cheap, but the number was chosen to catch a new eager dependency, and a
  raise with no trim behind it is a ratchet that only moves up. Kept as the fallback for when no
  lever like this one is left; ADR-0032's headroom amendment records the rule.
* **Lazy-load each icon from `Icon.svelte`** with a non-eager glob and `{#await}`. Simplest code,
  but a deferred icon paints a frame late on first open, and server-rendered routes (`/privacy`,
  `/changelog`, `/design`) would prerender an empty span — the exact `{@html}` hydration caveat in
  `.claude/rules/svelte.md`.
* **Two literal glob lists in `Icon.svelte`.** Vite resolves `import.meta.glob` statically, so
  splitting the set inside one directory means one glob of 39 literal file patterns and another of
  40 negations, plus a drift guard between them. The filesystem can hold the split instead.
* **Directory split plus a registry** — chosen below.

## Decision

The icon set is split by directory, and the deferred half reaches `<Icon>` through a registry that
its consumers fill by importing a module.

* `web/src/lib/icons/*.svg` is the **startup set**: every icon some module on the drawing page's
  static import path renders. `Icon.svelte`'s eager glob is unchanged and deliberately
  non-recursive.
* `web/src/lib/icons/deferred/*.svg` is the **deferred set**.
  `web/src/lib/components/deferredIcons.ts` eagerly globs it and, as a side effect of being
  evaluated, registers the markup into `iconRegistry.svelte.ts`, a module-level `$state.raw` map
  that `Icon.svelte` reads after its own map: `icons[name] ?? deferredIconMarkup(name)`.
* **Every source file that names a deferred icon imports the registry module** —
  `import '$lib/components/deferredIcons';` — so the markup is registered before the consumer's
  module body runs, on the server as well as the client, and the icon renders synchronously with no
  late frame. `deferredIcons.test.ts` enforces the rule over every non-test source file by the same
  quoted-literal scan `icon-orphans.test.ts` uses; `lib/design/iconTokens.ts` is the one exemption,
  because it keys CSS custom properties by icon name and renders nothing. The test also fails a
  stale side-effect import that names no deferred icon.
* **`Icon.svelte` still resolves a name that arrived unregistered**: an `$effect` calls
  `ensureDeferredIcons()`, a memoized dynamic import of the registry module that resets on failure
  (the `web/src/lib/idb.ts` pattern), and the `$state` registry re-renders the icon when it lands.
  This covers a name reaching `<Icon>` through untyped data; it is a safety net, not the mechanism.
* **`web/tests/startup-bundle.spec.ts` pins the split from the build output**: no modulepreloaded
  chunk may contain path data from a deferred icon. A startup module that names a deferred icon must
  import the registry to satisfy the unit test, and that import is exactly what puts the deferred
  chunk back on the critical path — so the regression has one shape and one guard.
* The tools that walk the directory recurse (`gen-icon-names.mjs`, which also fails on a basename
  present in both directories, since the union, the registry and `data-icon` all key on the bare
  name; `rebase-icon-viewbox.mjs`), the icon tests glob both directories, and the two direct raw
  imports of moved files (`ErrorScreen.svelte`, `tools/marketing-assets/gen-readme-hero.mjs`) carry
  the new path.

**Which directory a new icon belongs in.** Top level when anything on the drawing page renders it —
the toolbar, the palette, the brush and clear controls, the coachmarks. `deferred/` when only lazily
loaded UI does: a settings section, an overlay from `overlayChunk.ts`, the release notes, a route
other than `/`, the styleguide. When unsure, top level: the only cost is startup bytes the budget
check reports, whereas a startup module rendering a deferred icon is caught by the spec.

Measured on 2026-09-11: the startup set fell from 525,442 to 473,352 bytes (−52,090, 9.9%). The
budget constant stays at 525,000 with 51,648 bytes (9.8%) of headroom, close to the 11.5% it was set
with.

## Consequences

* \+ The startup path no longer pays for the settings, release-note, gate, banner, and styleguide
  artwork; the budget keeps catching a new eager dependency instead of failing on ordinary growth.
* \+ The split is legible from the filesystem, and both directions of drift are guarded — an
  unregistered consumer by the unit test, a re-eagered registry by the build-output spec.
* \+ Deferred icons render synchronously everywhere they are used today, including prerendered
  routes, because the registry is filled by static import rather than awaited.
* − Every consumer of a deferred icon carries a side-effect import (31 files at the split), and a
  contributor adding one has a rule to learn; the test's failure message names the fix.
* − An icon's directory is a per-icon decision that the budget number, not a type, backs up; a
  startup icon filed under `deferred/` costs a chunk fetch on the drawing page's first render of it
  (the fallback path), which the spec does not detect.
* − The remaining large startup slice — CSS of dynamically imported components that SvelteKit
  inlines with the route — stays; addressing it means either a framework change or dropping
  `inlineStyleThreshold: Infinity`, which the drawing page's first-paint styling depends on.
