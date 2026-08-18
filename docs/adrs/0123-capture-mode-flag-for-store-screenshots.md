# ADR-0123: A Capture-Mode Flag Hides Per-Install Chrome in Store Screenshots

**Status:** Active **Date:** 2026-08 **Amends:**
[0109](0109-dev-gated-production-invoke-handles-for-e2e.md)

## Context

`gen:store-assets` drives the real app to produce every store capture (ADR-0122), and it mocks
`/api/free-generation-grant` so the drawer shows the app as a configured install sees it — without a
grant the AI wand button is hidden entirely, and a listing that omits the feature undersells it. The
mock's side effect is the button's free-generation count: a "10" pill that reads as noise beside the
marketing headline and is wrong for every reader whose own install shows a different number.

The 2026-08-17 landscape design handoff arrived with the pill retouched out of two committed
tablet10 captures — pill removed, paper texture and button corner rebuilt in the design tool. That
retouch survives exactly until the next `npm run gen:store-assets`, which rewrites the capture from
the live app and silently restores the badge. A committed artifact the generator overwrites is worse
than no fix at all: the repo looks correct until someone reruns the pipeline.

Alternatives considered:

* **Keep retouching after each run.** Rejected because it makes the committed captures
  unreproducible from source, which is the property the harness exists to have. It is also
  unannounced work — nothing in the repo tells the next person that two of twenty captures need a
  raster edit, or which pixels.
* **Drop the grant mock so the badge never appears.** Rejected because the wand button disappears
  with it. The screenshot would then advertise fewer features than the app ships.
* **Add a user-facing setting that hides the count.** Rejected as speculative surface: no child or
  parent has asked to hide it, and a real setting would have to be designed, persisted, and
  supported forever to serve one screenshot run.
* **Inject CSS from Playwright (`addStyleTag` on the capture page).** Rejected because it puts a
  component's internal class name in the generator, where a rename fails silently — the selector
  matches nothing, the run succeeds, and the badge is back in the shipped screenshot.
* **A URL query parameter.** Rejected because it is reachable by typing in any shipped build unless
  gated anyway, while a pre-boot global cannot be typed into an address bar.

## Decision

`web/src/lib/storeCapture.ts` exports `storeCaptureMode()`. It returns `false` unless the code is
running in a browser under `dev || __DEV_HARNESS__` **and** `window.__storeCapture === true`;
`tools/marketing-assets/gen-store-assets.mjs` sets that flag in `enableCaptureMode()` via
`page.addInitScript` before navigation, so it is true by the app's first paint. Every scene goes
through `prepareCapture()`, which pairs it with the grant mock. `ActionsPanel.svelte` reads it once
at component init and drops the `.free-count` span from the wand button.

The seam is an **input**, which inspection seams are not, so it carries its own rule: capture mode
may only change what a capture *renders*, never what the app *does*. It must not touch engine state,
settings, persistence, or network behavior — a screenshot showing behavior the app does not have
misrepresents the product in a store listing, which is a worse failure than the badge it removes.

This narrows rather than reopens ADR-0109. Inspection seams stay read-only, invoke handles stay
bound to that ADR's four conditions, and this third category is admissible for a different reason
than either: no test asserts through it. The hazard ADRs 0080 and 0109 guard against is a spec
passing against a configuration no child can reach; capture mode has no spec, and its only output is
reviewed by eye before it ships. `web/tests/flows-ai.spec.ts` still asserts the badge on the
ordinary path, where the flag is false.

`web/src/lib/storeCapture.ts` is listed in `RELEASE_SEAM_SOURCE_FILES`
(`tools/check-release-seams.mjs`), so `__storeCapture` joins the post-build release scan from the
same source-derived token list as every other seam, and `postbuild` fails if the name survives into
a release client.

## Consequences

* \+ The committed captures are reproducible from source again — a rerun no longer reintroduces the
  badge, and no one has to know that a manual retouch was ever part of the pipeline.
* \+ Future capture-only presentation problems have a declared home and a stated limit, instead of
  each one arguing itself out from ADR-0109's read-only rule.
* \+ Release retention is guarded by the existing scanner, with no second token list to maintain.
* − The store screenshots show a wand button no user sees exactly: one with free generations
  available and no count. The listing copy promises optional AI art, not a specific number of free
  images, so the gap is presentational — but it is a gap.
* − The "presentation only, never behavior" limit is enforced by review alone. Nothing mechanical
  stops a later flag reader from changing what the app does under capture mode.
* − `ActionsPanel.svelte` — a startup-path component — now imports a module that exists for the
  marketing pipeline. It compiles out of release bundles, and `web/tests/startup-bundle.spec.ts`
  still pins the chunk boundary, but app code is carrying the seam.
