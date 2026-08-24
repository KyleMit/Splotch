# Performance tooling

`tools/perf/` captures, analyzes, and reports Splotch interaction performance across desktop web,
Android, and iOS. The root `package.json` is the public command catalog; run `npm run info` for the
complete flag and output descriptions.

## Entry points

* `perf:preflight` (`prepare-capture.mjs`) is the first command of any physical-device campaign. It
  confirms both devices are reachable and awake, reports the iPad's hardware UDID rather than the
  CoreDevice UUID `devicectl` prints, reuses an already-running RemoteXPC tunnel instead of asking
  for its password again, and resolves every capture port around whatever else holds it — never
  stopping a listener another session owns. `lib/capture-readiness.mjs` holds the decisions as pure
  functions so they are testable without a device. The failures it exists to prevent are catalogued
  in [`docs/PROFILING-CAMPAIGNS.md`](../../docs/PROFILING-CAMPAIGNS.md).
* Root analyzers consume existing evidence: `perf:analyze:chrome`, `perf:analyze:web-inspector`, and
  `perf:analyze:frames`.
* `perf:rescore` (`rescore-captures.mjs`) re-derives a whole corpus of captures from their raw frame
  tables, offline. It is the tool that turns "the gate is wrong" from an assertion into a table —
  the campaign found three independent defects in its own metric, and each time the first question
  was what the correction does to every number already taken. It reads `report` and never the
  `summaries` a capture was written with, because those were computed by whichever estimator the
  branch had at capture time, and it imports the scoring maths from the shipped modules so the
  answer is what the gate says rather than what a private copy says. Trialling a *new* charge is the
  same operation: change the shipped charge on a branch and re-run.
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

## What was left in scratch

The 2026-08 campaign accumulated a dozen one-off scripts in gitignored `perf-profiles/` scratch.
`perf:rescore` replaces four of them — `rescore.mjs`, `score-appium.mjs`, `credit-score.mjs` and
`summarize.mjs` — which between them carried five copies of a `beatOf`/`percentile`/charge
implementation that now ships in `lib/`. Promoting them as they stood would have committed those
copies, and a re-scorer that disagrees with the gate answers the wrong question.

The rest were deliberately not promoted: the candidate runners (`run-ipad-frames.mjs`,
`run-boost-ab.mjs`, `run-device-frames.mjs`, `control-host.mjs`, `probe-host.mjs`) are superseded by
`perf:device:frames`, `perf:device:serve` and `perf:device:floor`; `read-trace.mjs` became
`lib/instruments-trace.mjs`; `rank.mjs` is thin against the table `perf:rescore` prints. The test is
whether a future campaign would reach for it, not whether it was useful in this one.

The one genuinely load-bearing piece of `measure-candidate.sh` was its proof that the served HTML
and the chunks it names came from the same build. That now lives in `lib/profile-preview.mjs` and
runs on every capture that starts its own preview — see below.

## Ownership and maintenance

`lib/` owns performance statistics, thresholds, capture/session plumbing, and artifact formats.
`probes/` contains browser-console payloads injected into a page or pasted into Web Inspector; they
cannot import Node modules. Tests remain in `tests/` and cover entry points, probes, gates, and
artifact contracts.

`tests/fixtures/` holds real captures kept so a gate is exercised against what the app actually
emits. `undo-scenarios-webkit-fast.json` is the `draw` block of a real `perf:web:undo:webkit:fast`
run, and it exists because the commit gate's normalization silently rescaled by three orders of
magnitude when `engine.draw` marking changed granularity, against a unit test whose hand-written
fixture could not notice (ADR-0140). Regenerate it from a fresh run's `undo-scenarios.json` rather
than editing it by hand.

The exact issue #975 manifest preserves two established cross-platform owners instead of extracting
new modules during this behavior-preserving move: `ios/capture-xcuitest-actions.mjs` owns the action
plan consumed by the web and Android runners, and `ios/capture-webkit-frames.mjs` owns the probe
configuration reused by local web capture.

`buildAndPreview` asserts the served build is fresh before returning. A preview server left from an
earlier build keeps the port and keeps serving the manifest it loaded at startup, and the resulting
failure is invisible: the HTML names chunks that 404, the route never hydrates, and because the
drawing route is server-rendered every selector still resolves. The capture then measures dead
markup and reports a plausible number.

Most captures build or connect to external software and fail non-zero when prerequisites, fidelity
checks, or performance gates are missing. Analyzers fail on unreadable or unsupported evidence. Read
[`docs/PROFILING.md`](../../docs/PROFILING.md) before changing metrics or thresholds, and
[`docs/PROFILING-IPAD.md`](../../docs/PROFILING-IPAD.md) before an on-device iOS run.
