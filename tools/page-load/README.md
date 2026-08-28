# Page-load performance gate

This capability runs pinned Lighthouse against Splotch's production build on the same simulated Slow
4G, 4× CPU, phone-portrait, and tablet-landscape profiles as the `lighthouse-audit` skill. Each of
the four device/visit cells is measured three times and judged by its median.

Both viewports intentionally keep Lighthouse's mobile form factor and Lantern model. This mirrors
the manual audit matrix exactly instead of inventing a desktop scoring curve for the wider viewport.
Although the current network-derived medians can match, retaining the tablet cell detects responsive
changes to the LCP candidate and its render delay.

## Entry point

`npm run test:lighthouse:ci` builds the production web bundle, starts an owned Vite preview on an
explicit port, and writes JSON reports plus `summary.json` under `lighthouse-reports/ci/`. The CI
job uploads that gitignored directory and also writes the headline table to the GitHub job summary.

FCP and LCP are the only gated metrics. Total Blocking Time and the derived performance score are
reported because they remain useful diagnostics, but the shared-runner and Lighthouse-injected-work
variance documented by the audit skill makes them unsuitable for an absolute gate. The local
preview's HTTP/1.1 serving layer also means these numbers are regression-harness values, not the
production CDN's public score.

Lighthouse is pinned as a CI-only development dependency. Version 12 was evaluated because the
manual skill still invokes that major, but its final dependency tree carries a high-severity
`extract-zip` advisory with no published patched release. The CI gate therefore pins Lighthouse 13,
whose browser downloader no longer reaches that package; the repository's high-severity audit gate
proves the final installed tree instead of allowlisting a dormant downloader path.

## Baseline and staleness

`baseline.json` holds the measured medians and deliberately wide limits. Before a gated run, the
runner hashes the shipping source, static assets, build configuration, resolved dependency tree, and
production dependency declarations. A mismatch emits a visible warning in the console, GitHub job
summary, and `summary.json`, but the run continues because the committed limits are absolute. The
warning prevents stale medians from claiming currency while still producing the measurements needed
to recalibrate after an ordinary product change.

To recalibrate, first run the complete matrix without trusting the old gate:

```bash
node tools/page-load/run-lighthouse-ci.mjs --report-only --port=4197 --samples=3
```

Repeat that command on a quiet host. Review the per-sample spread in
`lighthouse-reports/ci/summary.json`; never copy one run or a noisy TBT/score into a gate. Update
the four FCP/LCP medians and limits in `baseline.json`, replace `sourceDigest` with the report's
exact digest, then rerun `npm run test:lighthouse:ci -- --port=4197`. Limits are a reviewed
performance decision: keep enough space above the worst repeated median to absorb the measured
run-to-run spread, while retaining a useful multi-second-regression tripwire.

The initial 2026-08-27 calibration used two complete three-sample campaigns on the same quiet Mac
and production bundle. The combined six-sample medians and the campaign-median ranges were:

| Profile          | Visit  | FCP median (campaign range) | LCP median (campaign range) | FCP / LCP limits |
| ---------------- | ------ | --------------------------- | --------------------------- | ---------------- |
| Phone portrait   | first  | 1,599 ms (1,524–1,674)      | 3,022 ms (3,021–4,128)      | 2,600 / 5,500 ms |
| Phone portrait   | repeat | 705 ms (705–705)            | 822 ms (821–822)            | 1,200 / 2,000 ms |
| Tablet landscape | first  | 1,599 ms (1,523–1,674)      | 3,022 ms (3,020–3,022)      | 2,600 / 5,500 ms |
| Tablet landscape | repeat | 705 ms (705–705)            | 825 ms (824–825)            | 1,200 / 2,000 ms |

The limits sit above the worst campaign median by 33–143%, depending on the observed spread. That is
intentionally a large-regression gate, not a promise that two Lighthouse runs will agree. The first
Linux CI run is part of calibration evidence too: if its medians fall outside these limits, adjust
from its uploaded per-sample report rather than raising a threshold blindly.

Independent reviewer campaigns repeatedly found a slower first-visit LCP mode around 4,130 ms on
both viewports. The LCP candidate remained `.paper-sheet`; the difference was about 120 ms of
observed element render delay instead of about 10 ms, which Lantern extrapolated into the extra
second. The 5,500 ms first-visit LCP limit therefore gives both viewports equal measured headroom
rather than treating the tablet's initially faster sample as a different performance contract.

## Failure behavior

Missing reports, two consecutive runtime errors for one invocation, an even or single-sample run,
and FCP/LCP medians above their limits exit nonzero. Each invocation gets one retry and each attempt
is capped at 120 seconds so a transient Chrome failure cannot consume the workflow's full budget.
The first-visit profile is recreated before its retry to preserve cold-cache semantics. Reports are
replaced whole on each run so an interrupted audit cannot reuse an older JSON file. The owned
preview server and Chrome profiles are stopped or removed in the failure path. Use `--no-build` only
after an intentionally reused production build; the preview identity guard still proves the server
and local bundle agree.
