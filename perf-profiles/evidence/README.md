# `perf-profiles/evidence/` — tracked capture evidence

Everything else under `perf-profiles/` is gitignored scratch. This subtree is **tracked on purpose**
([ADR-0138](../../docs/adrs/0138-preserve-a-capture-evidence-subset.md)).

Raw captures not surviving a checkout is what left ten of eleven performance-matrix targets
publishing numbers from a superseded estimator: when the metric was corrected (ADR-0134, ADR-0136),
re-scoring needed the raw frames and the raw frames were gone, so the only route back was device
time. A curated subset makes that a script instead.

## Using it

```sh
npm run perf:evidence:keep -- --corpus=perf-profiles/campaign --campaign=2026-08-android
npm run perf:rescore -- --corpus=perf-profiles/evidence/2026-08-android
```

Promotion is deliberate and belongs to the end of a campaign — see the closing steps in
[`docs/PROFILING-CAMPAIGNS.md`](../../docs/PROFILING-CAMPAIGNS.md).

## What is here and what is not

One capture per **target × brush** per campaign, stored **whole** (minified, nothing dropped), with
an `index.json` naming the cell each sample came from and its fidelity verdict.

Whole rather than trimmed is the part worth not undoing. `events` is 71% of a capture and looks like
free savings; dropping it leaves the headline lost-frame number unchanged and still plausible while
losing paint max entirely and turning the fidelity verdict *false* at 0 moves/s. The measurements
are in the ADR. A preserved capture that cannot prove its own input fidelity is worse than no
preserved capture, because it will be believed.
