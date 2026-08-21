# Performance tooling

`tools/perf/` captures, analyzes, and reports Splotch interaction performance across desktop web,
Android, and iOS. The root `package.json` is the public command catalog; run `npm run info` for the
complete flag and output descriptions.

## Entry points

* Root analyzers consume existing evidence: `perf:analyze:chrome`, `perf:analyze:web-inspector`, and
  `perf:analyze:frames`.
* `perf:campaign` drives one deployment-target capture campaign to completion and is resumable:
  rerunning the same command skips cells whose artifacts already parse, retries failed ones, and
  records exhausted ones as P1s while the queue continues. `lib/campaign-plan.mjs` owns which cells
  exist and where each writes; `lib/campaign-ledger.mjs` owns what the ledger rows mean. Host
  identity — device ids, capability files, preview URLs — stays a flag, so nothing device-specific
  is committed.
* `gen:performance-matrix` rebuilds the committed deployment-target report from its source manifest.
* `perf:build` and `perf:serve` prepare and serve the instrumented production bundle.
* Platform capture commands live under [`web/`](web/README.md), [`android/`](android/README.md), and
  [`ios/`](ios/README.md).

Captures write beneath `perf-profiles/`. Matrix generation writes the paths selected by its source
manifest. The committed fixture in `fixtures/` seeds the rolling WebKit undo history used in CI.

## Ownership and maintenance

`lib/` owns performance statistics, thresholds, capture/session plumbing, and artifact formats.
`probes/` contains browser-console payloads injected into a page or pasted into Web Inspector; they
cannot import Node modules. Tests remain in `tests/` and cover entry points, probes, gates, and
artifact contracts.

The exact issue #975 manifest preserves two established cross-platform owners instead of extracting
new modules during this behavior-preserving move: `ios/capture-xcuitest-actions.mjs` owns the action
plan consumed by the web and Android runners, and `ios/capture-webkit-frames.mjs` owns the probe
configuration reused by local web capture.

Most captures build or connect to external software and fail non-zero when prerequisites, fidelity
checks, or performance gates are missing. Analyzers fail on unreadable or unsupported evidence. Read
[`docs/PROFILING.md`](../../docs/PROFILING.md) before changing metrics or thresholds, and
[`docs/PROFILING-IPAD.md`](../../docs/PROFILING-IPAD.md) before an on-device iOS run.
