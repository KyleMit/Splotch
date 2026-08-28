# Performance tooling

`tools/perf/` captures, analyzes, and reports Splotch interaction performance across desktop web,
Android, and iOS. The root `package.json` is the public command catalog; run `npm run info` for the
complete flag and output descriptions.

## Entry points

* `perf:preflight` (`prepare-capture.mjs`) is the first command of any physical-device campaign. It
  confirms both devices are reachable and awake, reports the iPad's hardware UDID rather than the
  CoreDevice UUID `devicectl` prints, reuses an already-running RemoteXPC tunnel instead of asking
  for its password again, distinguishes sandbox USB denial from two detached devices, and resolves
  preview/probe ports around foreign worktrees without stopping their listeners. A probe is reused
  only after its checkout, upstream, build, and run identity agree with the selected preview.
  `lib/capture-readiness.mjs` holds the decisions as pure functions so they are testable without a
  device. The failures it exists to prevent are catalogued in
  [`docs/PROFILING-CAMPAIGNS.md`](../../docs/PROFILING-CAMPAIGNS.md).
* `perf:operator` (`run-operator-session.mjs`) is the guided session for the two capture inputs only
  a human at the devices can give: arming the iPad automation grant (the passcode prompt exists only
  during a WebDriverAgent launch — issue 1299; every attempt is appended to the tracked grant log
  under `perf-profiles/evidence/operator/`) and real-finger calibration captures inside the
  installed Capacitor WebViews (issue 1275). It takes devices and ports from `perf:preflight`'s own
  resolution, launches the iPad app deterministically through `devicectl` rather than trusting the
  foregrounded app, and each capture refuses an artifact whose user agent contradicts the labelled
  runtime.
* Root analyzers consume existing evidence: `perf:analyze:chrome`, `perf:analyze:web-inspector`, and
  `perf:analyze:frames`.
* `perf:rescore` (`rescore-captures.mjs`) re-derives a whole corpus of captures from their raw frame
  tables, offline. It is the tool that turns "the gate is wrong" from an assertion into a table —
  the campaign found three independent defects in its own metric, and each time the first question
  was what the correction does to every number already taken. It reads `report` and never the
  `summaries` a capture was written with, because those were computed by whichever estimator the
  branch had at capture time, and it imports the scoring maths from the shipped modules so the
  answer is what the gate says rather than what a private copy says. Trialling a *new* charge is the
  same operation: change the shipped charge on a branch and re-run. Captures whose corpus index
  marks `cellAttributable: false` (issue 1315) are refused by default; `--include-unattributable`
  re-admits them deliberately, visibly marked, for questions about the instrument rather than the
  cell.
* `perf:campaign` drives one deployment-target capture campaign to completion and is resumable:
  rerunning the same command skips cells whose artifacts already parse, retries failed ones, and
  records exhausted ones as P1s while the queue continues. `lib/campaign-plan.mjs` owns which cells
  exist and where each writes; `lib/campaign-ledger.mjs` owns what the ledger rows mean. Host
  identity — device ids, capability files, preview URLs — stays a flag, so nothing device-specific
  is committed. Physical-device queues also repeat one crayon cell at the start, middle, and end;
  the raw reference captures live under the target's mode-scoped `references/` directory and
  `references.json` beside `instrument.json` records their capture times, capture-session scope,
  lost-frame spread, and warning threshold.
* `report-undo-gate-failures.mjs` reports WHAT the WebKit undo gate failed at, read from the run's
  own `undo-scenarios.json` rather than from its exit code. It has no npm script because CI consumes
  its stdout verbatim: `webkit-commit-gate-fast` publishes the fingerprint as a job output, and the
  fresh-runner retry passes it back through `--first=` to file only the failures that reproduced on
  both VMs (ADR-0158). `lib/undo-gate-failures.mjs` holds the derivation and comparison as pure
  functions.
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
