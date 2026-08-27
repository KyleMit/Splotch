# Quality

The axes Splotch is held to, and what backs each one today — a gate, a test, a skill, or a
documented decision. Open work lives in GitHub issues, not here.

```
best in class product     — what it's like to use
best in class promise     — what we commit to
best in class practice    — how it's built
```

## Product

* **Usability** — how a toddler's hand meets the app: targets, gestures, forgiveness, flow (ux)
* **Design System** — tokens, primitives, and visual consistency across every surface (design
  language, ui)
* **Accessibility** — WCAG conformance, assistive-tech paths, contrast, motor accessibility
* **Illustration** — quality and breadth of the coloring pages: outlines, fills, catalog (content,
  artwork)
* **Performance** — frame cost while drawing, and how fast the app loads (browser rendering, JS
  performance, network performance, pre-rendering)
* **Resilience** — degrades gracefully: offline, crashes, quota, outages still return usable state
  (offline usability, crash tolerance, graceful degradation, progressive enhancement)
* **Storefront** — the pre-install surface: listing, screenshots, icon, description, discovery
  (distribution)

## Promise

* **Privacy** — what leaves the device, what's kept, and for how long
* **Content Safety** — AI output stays appropriate for a two-year-old, every time
* **Security** — credentials, endpoints, and supply chain resist misuse and attack (dependency
  vulnerabilities)
* **Compliance** — store guidelines, COPPA, and kids-policy obligations, provably met
* **Child Wellbeing** — whether the app is genuinely good for a developing child

## Practice

* **Architecture** — where code lives, how it's layered, and why
* **Code Quality** — readable, conventional, well-named code with no dead weight
* **Testing** — coverage, and whether the suite's signal can be trusted (test integrity, flake
  resistance)
* **Compatibility** — native matches web; every supported browser and OS version runs (platform
  parity, portability)
* **Documentation** — ADRs, guides, and docs that stay true as code moves
* **Developer Experience** — tooling, CI, agent instructions, and dependency upkeep that keep
  velocity (ci/cd, dependency management)

---

## Usability

A two-year-old can draw without adult help. Every control is reachable one-handed, forgiving of
imprecise contact, and wordless.

**Backed by.** The `flows-*` Playwright specs, `multitouch.spec.ts`, and
`engine-pointer-recovery.spec.ts` cover the interaction paths; `dialogTabletScaling.test.ts` covers
reach on tablet. The `run-splotch` skill drives the real app when a change needs eyes on it rather
than an assertion, and `critique-page-inventory` reviews the captured surface inventory.

## Design System

Every surface draws from one token vocabulary. No ad-hoc color, size, radius, shadow, or easing in
component styles.

**Backed by.** `lint:tokens` and `gen:tokens:check` in the quality gate; `design.spec.ts`,
`chipInk.test.ts`, and `scrollbar-chrome.spec.ts`; the public `/design` styleguide as the rendered
reference. The `design` skill carries the token vocabulary, primitives, and voice rules.

## Accessibility

Adult-facing surfaces hold WCAG 2.1 AA. The toddler canvas chrome is deliberately out of scope —
giant wordless buttons and no reading order are not WCAG's model.

**Backed by.** `a11y.spec.ts` runs axe-core, and hand-computes contrast for the cases axe reports as
`incomplete` and therefore never fails on: short text nodes, `::placeholder` pseudo-elements,
`aria-hidden` digits, and dialogs whose background it cannot resolve.

## Illustration

Every coloring page ships clean outlines, theme-correct fills, and no shapes the generator invented
that are absent from the source.

**Backed by.** The `check:coloring-*` family — outline quality, invented shapes, night halo, fill
eyes, fill drift, and golden scores. `check:assets:manifest` turns silent binary churn into a
reviewable text diff. The pipeline keeps its own decision records in `tools/asset-gen/docs/`, and
the `vectorize-image` skill covers raster-to-vector tracing.

## Performance

Drawing holds its frame budget on the supported device floor, and startup stays inside a reviewed
byte budget.

**Backed by.** The `perf:*` harness across web, Android, and iOS. The committed matrix with
`check:matrix-staleness`, which compares the content digest of `web/src` against the commit a cell
claims to measure and refuses to call a stale cell current. The WebKit commit gates and the undo
commit-P95 gate. `check-bundle-budgets.mjs` holds the startup, lazy-chunk, and native-export sizes;
`check-pwa-precache.mjs` holds precache integrity. Skills: `profiling`, `run-performance-matrix`,
`start-capture-session` before physical-device work, and `lighthouse-audit` for page load.

## Resilience

Every degraded path returns usable app state rather than a dead end — offline, provider outage,
exhausted quota, denied storage, a crash mid-stroke. The child's work survives.

**Backed by.** `early-boot.spec.ts` and `paper-texture-boot.spec.ts` on the startup path,
`pwa-registration.spec.ts` on the service worker, `engine-pointer-recovery.spec.ts` on interrupted
input. `idb.ts` requests persistent storage and resets its memoized promise on rejection;
`storage.ts` handles `QuotaExceededError`.

## Storefront

The listing represents the app accurately and earns the install.

**Backed by.** `gen:store-assets` and `gen:store-assets:frames` produce the screenshots;
`store-assets/STORE-LISTING-ANDROID.md` and `STORE-LISTING-IOS.md` hold the pre-committed metadata
answers. The `mobile` skill carries the store release checklists.

## Privacy

No accounts, no analytics SDKs, no advertising identifiers, no child name, email, or location.
Everything that leaves the device is disclosed in `/privacy` in parent-readable terms, with
retention stated on both sides — what we keep, and what the provider keeps.

**Backed by.** `requiredNativePageProblems` and `requiredNativePageLinkProblems` in
`tools/mobile/check-static-bundle.mjs` fail `build:cap` if the privacy page is missing from the
static export or if nothing in the bundle links to it (ADR-0120). Retention windows are imported
into the page as constants rather than restated in prose, so the disclosure cannot drift from the
cleanup that enforces it. ADR-0105 records the app-purpose pseudonym; ADR-0114 records provider
retention.

## Content Safety

A generated picture is appropriate for a two-year-old, or it is refused with a message the child can
act on. The prompt surface is closed — a child cannot type free text into a generator.

**Backed by.** `openaiSafety.ts` classifies a response as image, safety refusal, or empty failure,
with unit coverage beside it. ADR-0023 records why the Responses API is used instead of
`/v1/images/edits`: the latter cannot express that distinction, and on this repo's red-team corpus
it returned a finished image for a drawn gun. The report flow requires a gated confirmation naming
the evidence being sent (ADR-0104).

## Security

Credentials are never guessable, never logged, and never longer-lived than they need to be. Every
endpoint resists brute force and abuse.

**Backed by.** `securityPolicy.ts` hashes the exact inline script bodies and fails on template
drift. `securityHeaders.ts` pins HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame
denial; `csp.spec.ts` checks the delivered policy. Admin secrets compare in constant time.
Credential endpoints carry sliding-window limits that peek before the check, so a legitimate caller
never spends budget on someone else's guessing. `pnpm audit` runs in the quality gate, and the
`security-review` skill reviews a branch before it ships.

## Compliance

Every store guideline and children's-privacy obligation that shaped this codebase is quoted
verbatim, answered with the decision that satisfies it, and traceable to the commit where it landed.

**Backed by.** [`MOBILE/compliance.md`](MOBILE/compliance.md) holds the ledger.
`check-static-bundle.mjs` enforces the privacy-page assertions at build time. The manifest ships no
identifier from the Play Families prohibited list, requests no location permission, and sets
`android:allowBackup="false"`. The `mobile` skill carries the kids-compliance checklists.

## Child Wellbeing

The app asks whether a two-year-old is better off for having used it — not whether they stayed
longer. No streaks, no notifications pulling a child back, no engagement loop, and creative tools
that build on what the child made rather than replacing it.

**Backed by.** Nothing yet.

## Architecture

Every decision that chose an approach over real alternatives is recorded before the code depending
on it lands.

**Backed by.** The records in `docs/adrs/`, `check:adrs`, and the `adr-integrity` workflow. Skills:
`architecture` for the source map and route table, `adrs` for the index, `create-adr` and
`update-adrs` for writing and reconciling them.

## Code Quality

New code reads like the code around it. No dead exports, no unformatted files, no type errors, no
duplicate declarations.

**Backed by.** `check:quality` runs the whole set in one pass and reports every failure rather than
the first — format, svelte-check, eslint, ruler drift, token lint, knip, asset manifest, scrapbook
index, and audit. The `format-edited-file.sh` hook routes each edited file through Prettier or
dprint. Skills: `code-audit` and `extract-audit` to find work, `vet-audits` to prune it,
`fix-audits` and `burn-down-audits` to clear it, `simplify` and `code-review` on a working diff.

## Testing

Three tiers — Vitest unit, Playwright end-to-end, and Maestro native smoke on both platforms — and a
suite whose signal can be trusted rather than re-run until green.

**Backed by.** Unit specs sit beside their sources in `web/src`, end-to-end specs in `web/tests`,
tool specs in `tools/tests`, and native flows in `.maestro`. `playwright-flaky-reporter.ts` surfaces
flake; the WebKit commit gates carry a bounded retry leg rather than an open one; ESLint's
vacuous-test rules fail a spec that asserts nothing, under both the vitest and playwright spellings.
The `testing` skill carries the full strategy and commands.

## Compatibility

The native apps behave the same as the web app on every shipped surface, and every browser and OS
version named in [`COMPATIBILITY.md`](COMPATIBILITY.md) runs the current build.

**Backed by.** `browserFloor.test.ts` guards the floor against drift, and `COMPATIBILITY.md` carries
the per-API risk register. `nativeExcludedRoutes.ts` and `check-static-bundle.mjs` keep server
routes and native code out of the static export; `android-config.test.mjs` guards native config;
Maestro smoke runs on both platforms. The `mobile` skill covers the Capacitor build and on-device
testing.

## Documentation

Generated agent instructions never drift from their `.ruler/` sources, and a doc is updated in the
change that invalidates it.

**Backed by.** `ruler:check` reruns the generation pipeline and fails if output changed;
`check:skill-refs` catches the wrong invocation sigil for the tree it appears in; `check:adrs`
guards record integrity; `check:matrix-staleness` guards performance claims; `scrapbook:check`
guards the published index. Skills: `skills-guide` for the catalog, `create-handoff` and
`resume-handoff` for session-to-session transfer.

## Developer Experience

One command per task, discoverable without reading the source, reproducible across macOS and Linux,
and regenerating deterministically.

**Backed by.** ADR-0019 requires a `scripts-info` description per script, and `npm run info` prints
them. `ruler:apply` and `ruler:check` keep both provider trees deterministic.
`package-manager.test.mjs` fails if any CI, hook, or bootstrap file starts installing with npm
instead of pnpm. `check:github-actions` and `workflow-hygiene.test.mjs` guard the workflow set.
Skills: `workflow-audit`, `session-audit`, and `self-heal` for the loop itself;
`dependency-health-audit` and `triage-dependabot-prs` for dependency upkeep;
`fewer-permission-prompts` for friction.
