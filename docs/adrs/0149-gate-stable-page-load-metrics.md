# ADR-0149: Gate Stable Page-Load Metrics and Report the Noisy Ones

**Status:** Active **Date:** 2026-08

## Context

Splotch gated interaction performance and production bundle bytes, but neither catches a newly
render-blocking resource, request waterfall, or parse change that delays first paint while staying
inside the byte budget. The manual `lighthouse-audit` skill measured that surface, but a regression
could merge without running it.

An absolute Lighthouse gate on a shared runner can create a different failure: Total Blocking Time
and the derived performance score move with host scheduling and can include Lighthouse's own
`_lighthouse-eval.js` long tasks. The audit runbook records identical-production-run swings of 360
to 560 ms TBT and 84 to 91 performance score. A check that fails on that noise will be bypassed.

The alternatives were:

* **Report every metric without a gate.** Rejected because it preserves history but still relies on
  someone noticing drift, leaving the original no-failure condition intact.
* **Gate every Lighthouse metric or the performance score.** Rejected because TBT and score inherit
  shared-runner and self-attribution variance; a wide score floor also hides which load phase moved.
* **Gate one run per profile.** Rejected because one host interruption can decide the PR.
* **Audit production or a Netlify preview directly.** Rejected for the CI gate because it introduces
  deploy availability, CDN state, and a second revision-identity problem. It remains the authority
  for public scores; CI needs a same-harness production-bundle comparison.

## Decision

The `Page-load performance` CI job runs pinned Lighthouse 13 against a freshly built production web
bundle served by an owned local preview. It uses the manual audit's simulated Slow 4G plus 4× CPU
profile at phone portrait (412×915, DPR 2.625) and tablet landscape (1133×744, DPR 2), for both a
new-profile first visit and the immediately following warm-cache repeat visit.

Both viewports retain Lighthouse's mobile form factor and Lantern model to mirror the manual audit
matrix exactly. The tablet is not a second scoring curve: it preserves a responsive viewport that
can select a different LCP candidate or introduce a different render delay even when network-derived
metrics currently match the phone.

Each cell runs three samples. The median First Contentful Paint and Largest Contentful Paint values
gate against the wide limits in `tools/page-load/baseline.json`; Total Blocking Time and performance
score appear in the logs, GitHub job summary, and uploaded raw reports but never decide the result.
The median means one runner outlier cannot fail a PR. JSON reports are replaced per run and retained
as a seven-day CI artifact. A failed Lighthouse invocation gets one retry; each attempt is capped at
120 seconds, and a cold first-visit profile is recreated before retrying. More retries were rejected
because they conceal persistent failures and cannot fit reliably inside the 15-minute job budget.

The baseline is empirical. Two initial three-sample campaigns produced combined medians of 705–1,599
ms FCP and 822–3,022 ms LCP. Campaign medians moved by up to 151 ms FCP and 1,107 ms LCP, so the
committed limits sit 33–143% above the worst campaign median, per cell. These are deliberate
large-regression tripwires, not public performance targets. The first Linux CI report extends the
calibration evidence; any adjustment must cite its per-sample spread rather than a failed headline.
Reviewer campaigns also repeatedly observed a roughly 4,130 ms first-visit LCP mode on both
viewports. The candidate stayed `.paper-sheet`, while its observed element render delay grew from
roughly 10 ms to 120 ms. Both first-visit LCP limits therefore use 5,500 ms rather than assigning
the tablet less headroom from one unusually fast campaign.

Before running Lighthouse, `tools/page-load/run-lighthouse-ci.mjs` hashes the shipped source, static
assets, build configuration, lockfile, and production dependency declarations. A digest mismatch
emits a visible console and GitHub warning and is recorded in `summary.json`; it does not bypass the
absolute limits or prevent the fresh measurements needed for recalibration. A hard stale gate was
rejected because every shipping change would fail before measuring, while removing the digest was
rejected because it would lose provenance. Tests lock the profiles, visit matrix, gated/reported
split, median behavior, retry budget, and threshold boundaries. `tools/page-load/README.md` owns
recalibration and reversal guidance.

The local preview's HTTP/1.1 layer is intentionally not presented as Netlify CDN performance. The
manual audit against production or a branch preview remains the authority for public Lighthouse
scores and opportunity analysis; the CI gate answers only whether the same production-build harness
crossed a large committed regression boundary.

## Consequences

\+ A parse, paint, or request-shape regression can now fail before merge even when bundle bytes stay
inside budget.

\+ FCP/LCP failures identify the stable load phase that moved, while raw TBT and score remain
available for diagnosis without becoming flaky gates.

\+ A changed production surface cannot silently present old medians as current; the warning and
fresh artifact make recalibration a reviewable JSON and documentation diff.

− Every gated run pays for one production build and twelve Lighthouse invocations. It is isolated in
its own parallel job so it does not extend the browser-shard setup path.

− The limits intentionally miss small regressions. Tightening them requires repeated Linux-runner
evidence, not preference or a single unusually fast run.

− Any shipping-source or resolved-dependency change leaves a visible stale-provenance warning,
including changes unlikely to affect initial load. It remains until repeated measurements refresh
the baseline, but does not make ordinary product pull requests fail before measuring.

− Reversal is mechanical: remove the standalone workflow job and `test:lighthouse:ci` entry, then
remove `tools/page-load/` and the pinned Lighthouse development dependency. Keep the manual
`lighthouse-audit` workflow; it answers the production-CDN question this CI gate deliberately does
not.
