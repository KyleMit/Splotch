# Handoff — coloring vector campaign

> 2026-08-19 · branch `codex/vectorize-coloring-runtime` · PR
> [#1167](https://github.com/KyleMit/Splotch/pull/1167) · after the runtime slice merges, close its
> deployment and physical-iPad gates before authorizing the pen-first catalog campaign

## Objective & non-goals

Resume only after PR [#1167](https://github.com/KyleMit/Splotch/pull/1167) merges. Verify the
deployed SVG transport and the real physical-iPad web/native coloring-pack path, then use one
dense-wide production trace to decide whether the remaining pen campaign is safe.

Do **not** start the 94-trace pen remainder merely because the PR merged. Do not batch chalk with
pen, forge a Cache Storage installed marker to make Creatures appear installed, vectorize covers or
picker thumbnails, replace raster authoring sources/fills, or remove WebP fallbacks.

## State

* Branch: `codex/vectorize-coloring-runtime`, pushed to origin.
* Draft PR: [#1167](https://github.com/KyleMit/Splotch/pull/1167), open and mergeable at
  318aff00090b37ada450f79005994279ca21724e when this packet was written.
* Base: `main` at 7a680a3c2f01b132dfc905e88835a1d74d61f2fa according to GitHub; the local branch was
  cut from 77ce0900.
* Runtime slice: Circle portrait light SVG plus Owl portrait light/dark SVG. All other page,
  orientation, and theme combinations remain WebP.
* Contract: coloring-pack format 3; compact and full variants carry byte-identical SVG logical
  paths, download paths, byte lengths, and SHA-256 digests.
* The seven pilot/runtime SVGs are normalized by `npm run vectorize:postprocess`; the read-only
  fixed-point check is `npm run vectorize:postprocess:check`.

| Commit                                   | What                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| 75e205993c6729427f2305ff617d2edfc3244d7f | Consume the pilot-era handoff before implementing the runtime slice              |
| 318aff00090b37ada450f79005994279ca21724e | Integrate invariant SVG overlays, format 3, post-processing, tests, and ADR-0129 |

The implementation touches ADR-0129, the vectorizer runbook/post-processor, coloring-pack manifest
generation and validation, PWA routing, the book catalog and resolver, three runtime SVGs, and the
focused unit/E2E coverage. Use `git diff --name-status 77ce0900...318aff00` for the exact inventory.

## Decisions made (and why)

* Roll out vectors explicitly by page, orientation, and resolved theme. This keeps every unproven
  combination on its existing WebP path and makes the campaign reversible.
* Share one canonical SVG across compact and full packs. SVG has no responsive derivative; raster
  fills, thumbnails, and non-selected overlays retain the existing resolution behavior.
* Keep Cache Storage namespaces version-and-resolution scoped. The installed marker fingerprints
  each selected file, including bytes and digest, so vector invariance does not create another cache
  authority or migration.
* Bake white ink into dark SVG derivatives. Runtime still uses ordinary source-over composition;
  there is no full-page CSS recoloring filter.
* Keep raster covers and picker thumbnails. Their actual display assets are smaller than SVG, so
  resolution independence does not create a runtime win.
* Stage pen and chalk separately. The two paid pen keepers support the pen direction, but the
  densest pen sources are wide. Chalk is closer to raw-byte parity on native and needs its own
  dense-wide production gate after the pen stage.
* Treat the physical iPad as the runtime acceptance gate. Desktop Chromium/WebKit compatibility and
  Playwright E2E are necessary evidence, not substitutes for selection-frame responsiveness,
  rotation, real offline installation, and visual overlay/fill registration on the target device.

## Unverified assumptions

* The merge commit and production deployment do not change the three runtime SVG bytes or the
  manifest-3 contract. Resolve the actual merge SHA and deployment before trusting this packet's
  branch-head pointers.
* Netlify serves the SVGs as `image/svg+xml` with Brotli transfer compression near the pilot's
  estimates. This has not been measured on a deployed #1167 build.
* Circle/Owl selection, theme switching, Magic reveal, rotation, overlay/fill registration,
  screenshot export, offline installation, and relaunch remain correct on a physical iPad in both
  deployed web and native Capacitor contexts.
* A local Appium attempt while preparing #1167 did not expose the installed Creatures pack. It is
  unknown whether the cause was the real install state, stale manifest/cache data, the selected
  Appium context, or the build under test. Diagnose that state; do not make the test pass by writing
  the marker used by `gotoAppWithAllColoringBooksInstalled`.
* The last recorded Vectorizer.AI balance was 176.9 credits on 2026-08-19. It funds the 94 remaining
  pen traces at that snapshot, but the live balance and service output must be rechecked before any
  paid call. The full 189-trace pen-plus-chalk remainder was short 12.1 credits at that snapshot.
* A production trace of `creatures/fairy-wide.outline.webp` will preserve the pen keeper's useful
  size/fidelity relationship. The free watermarked rehearsal could validate geometry and tooling,
  not production bytes or fidelity.

## Done & verified

* The production runtime slice is committed and selected only at
  `web/src/lib/state/books.ts:328-353`; raster fallbacks remain for every other combination.
* ADR-0129 records the accepted pack and runtime contract at
  `docs/adrs/0129-invariant-svg-overlays-in-coloring-packs.md:34-76`.
* `npm run vectorize:postprocess:check` — seven committed SVGs byte-stable.
* Focused vectorizer tool tests — 23 passed.
* Focused manifest/state/PWA unit tests — 37 passed.
* `web/tests/flows-vector-overlays.spec.ts` — two Chromium flows passed: intrinsic decode, Magic
  reveal, theme fallback, dark SVG, drawing, and screenshot export.
* `npm run check` — zero errors and zero warnings.
* `npm run lint` — passed.
* `npm run format:check` — passed.
* `npm run check:coloring-assets` — 1,389 assets checked.
* `npm run check:assets:manifest` — 1,600 assets matched.
* `npm run check:adrs -- --base=origin/main` — 125 ADRs valid.
* `npm run build` — PWA precache, release-seam, and bundle-budget checks passed.
* `npm run build:cap` — native static build passed within the package budget.
* Four pilot production traces charged four credits. The dense-wide rehearsal used test mode and
  charged zero credits; no catalog campaign was run on #1167.
* GitHub reported #1167 open, draft, and mergeable at the branch head above. The connector returned
  no combined-status contexts, so this packet does not claim independently observed CI status.

## Risks & next 3 steps

The largest risks are a deployment transfer profile that differs from local Brotli estimates, a
physical-device-only selection/rotation/registration failure, mistaking a forged cache marker for a
real offline installation, and spending a large non-refundable credit batch before the dense-wide
outlier is accepted.

1. **Verify the merged deployment.** Start from updated `main`, record the merge and deploy SHAs,
   fetch the generated manifest, and inspect all three SVG responses for status, `Content-Type`,
   `Content-Encoding`, cache headers, and actual compressed transfer bytes. Compare web transfer
   bytes with Brotli estimates and native/raw bytes with `wc -c`; confirm Circle/Owl routes resolve
   to the expected SVGs while an unselected theme/orientation still resolves to WebP.
2. **Close the physical-iPad gate through the real product path.** Test deployed MobileSafari and
   the native Capacitor build: install Shapes/Creatures through the UI, select Circle and Owl,
   switch light/dark, use Magic and ordinary drawing, inspect edge registration, rotate both ways,
   export a screenshot, go offline, relaunch, and reopen the pages. Diagnose why Appium could not
   see Creatures using the actual manifest/cache/manager state; never seed only the installed
   marker.
3. **Gate the paid campaign.** If steps 1–2 are green, run `npm run vectorize -- --account`, state
   the live balance and exact one-credit action, and obtain spending authorization for the
   `creatures/fairy-wide.outline.webp` production trace. Post-process it, rerun the offline
   size/fidelity/browser checks, and visually inspect registration. Only after that trace passes may
   the remaining pen stage proceed (94 total remaining pen traces before this gate). Finish pen
   before proposing the separate dense-wide chalk gate and its other 94 chalk traces.

## Reread first

* [`docs/adrs/0129-invariant-svg-overlays-in-coloring-packs.md`](../adrs/0129-invariant-svg-overlays-in-coloring-packs.md)
* [`tools/vectorize/pilot/README.md`](../../tools/vectorize/pilot/README.md)
* [`tools/vectorize/README.md`](../../tools/vectorize/README.md)
* [`web/src/lib/state/books.ts`](../../web/src/lib/state/books.ts)
* [`web/src/lib/coloringPacks/manifest.ts`](../../web/src/lib/coloringPacks/manifest.ts)
* [`web/src/lib/coloringPacks/manager.ts`](../../web/src/lib/coloringPacks/manager.ts)
* [`web/tests/flows-vector-overlays.spec.ts`](../../web/tests/flows-vector-overlays.spec.ts)
* [`docs/PROFILING-IPAD.md`](../PROFILING-IPAD.md)
* The `resume-handoff`, `vectorize-image`, `mobile`, `profiling`, and `run-splotch` skills
