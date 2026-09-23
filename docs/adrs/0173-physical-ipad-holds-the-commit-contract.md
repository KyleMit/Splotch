# ADR-0173: The Physical iPad Holds the Commit Contract; the Runner Gate Stays Advisory

**Status:** Active — amends [ADR-0093](0093-two-tier-webkit-commit-gate-in-ci.md) and
[ADR-0140](0140-commit-gate-host-control-and-breach-confirmation.md). **Date:** 2026-09

## Context

[ADR-0093](0093-two-tier-webkit-commit-gate-in-ci.md) made a Playwright WebKit run on a shared
`macos-latest` runner the holder of the 25 ms stroke-commit contract (`COMMIT_GATE_MS`, scored as
the raw `engine.commit` P95). [ADR-0140](0140-commit-gate-host-control-and-breach-confirmation.md)
removed its host divisor and required a breach to reproduce before it counted. That gate then failed
on every merge to `main`, and PR 1843 (7fc8ae9f398b) set `COMMIT_GATE_ENFORCED` to `false` in
`tools/perf/lib/undo-commit-gate.mjs` so that it measured and reported without failing the job. No
ADR recorded that switch, and ADR-0140 still read as though the gate enforced. This record documents
the switch and the decision that replaces it.

[The issue 1751 bisect](../investigations/webkit-commit-gate-1751-bisect.md) showed that the browser
build changed, not the app. Measured on the gate's own runner, the product from before the accused
PR fails on Playwright WebKit 26.6, and the accused product passes on 26.5. The move from r2336 to
r2359 came with the `@playwright/test` 1.62.1 → 1.63.0 bump. On the tip of `main` (run 34685863464),
the commit total and the `engine.undoPatchCrop` total agree to within a millisecond or two in both
fast scenarios (1,852 vs 1,845 ms; 765 vs 759 ms). So on 26.6 the gate's commit measure is, to a
rounding error, the undo patch crop.

Four repairs were weighed and rejected:

* **Re-baseline the threshold on 26.6.** This cannot be built. WebKit 26.6 charges the deferred
  raster at one of two boundaries, and which one a runner picks is not a property of the product.
  The same tree measures a crayon commit P95 of ~50–68 ms against a ~120 s draw on a draw-charged
  runner, and ~3,100–3,800 ms against an ~8 s draw on a commit-charged one. A single threshold that
  passes both has to clear about 3,800 ms, roughly 150 times the latency the scenario protects.
* **Pin Playwright WebKit to r2336.** The maintainer declined this (issue 1774, option 4). It
  freezes the instrument on a build Apple has moved past, it hides exactly the class of change the
  bisect found, and it needs a removal date that nobody would own.
* **A differential two-arm runner gate.** This would build the base and the head in one job and
  score the difference. It was **never spiked**. Its premise is that a runner's charging mode stays
  the same for the whole job, and nothing has measured that. The bisect saw the mode change between
  runners, and nothing rules out a change within one. It stays an unexplored alternative, not a
  tried one.
* **Delete the runner job.** That removes the only per-merge record of the WebKit commit
  distribution, and the `PERF_MARKS` refusal below, for no gain over leaving it advisory.

The 2026-09-22 spike tested what the runner can see
([evidence](../scratchpad/perf/2026-09-22-issue-1774-linux-gate-spike.md)). It ran the fast gate on
WebKit 26.6 locally, once on `main` and once with a synchronous 40 ms wait planted on every commit.
That wait is the regression size ADR-0093 designed the budget to catch. Crayon returned the same
verdict both times: a P95 of 2,445 ms for the baseline and 2,500 ms with the plant. Multi-finger
separated the two (3 → 44 ms) only because that Linux host's baseline was clean. The macOS runner's
multi-finger baseline on 26.6 is 57–177 ms, so the same plant would be invisible there. On this
browser build the runner cannot tell a real regression from its own noise.

The device can. The
[2026-09-18 iPad baseline](../scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/README.md) ran
finger-paced crayon sessions on a physical 12.9-inch iPad Pro on iPadOS 26.5 (Safari 26.5). In its
paced pipeline A/B runs (`pacedPipelineAB` in `summary.json`), on both deposition pipelines, commit
P95 was 0–2 ms and the maximum was ≤ 4 ms. One diagnostic ghost variant reached a 6 ms maximum. **No
iPadOS 26.6 device measurement exists yet.**

## Decision

**1. The physical iPad holds the commit-latency contract, and it is checked once per release.** The
contract is the unchanged `COMMIT_GATE_MS` (25 ms), scored as the `engine.commit` P95 of the
finger-paced crayon session. The maintainer runs the check with the capture rig armed (the
`start-capture-session` skill), before the release's signed artifacts are published. It runs the
2026-09-18 baseline payload unchanged, once per deposition arm: `restamp` is the Safari/web pipeline
and `glaze-direct` the native one.

```bash
npm run perf:ios:webkit:commit   # its pre-hook runs perf:build (PERF_MARKS)
```

The script (`tools/perf/ios/capture-commit-contract.mjs`) serves the build on the LAN, loads a fresh
`/dev/engine` for each arm, injects the baseline payload
(`tools/perf/probes/paced-crayon-session.js`, drift-guarded byte for byte against the 2026-09-18
package), and scores each arm with the reduction in `tools/perf/lib/commit-contract.mjs`. It prints
the iPadOS and Safari versions, the build SHA, and each arm's commit P95/max, and it exits non-zero
on a breach or on any arm it could not score. When the preview port is taken, pass `--port=N` (or
`--url=` with `--no-serve` for a server started separately). Issue 2223 promoted the check from the
scratchpad package's `run-session.mjs` and `analyze.mjs`, which stay as the baseline's history.

The runner reaches Safari through `ios_webkit_debug_proxy` (`connectDevice()` in
`tools/perf/lib/profile-device-session.mjs`). That is how the 2026-09-18 baseline reached iPadOS
26.5. The campaign runbook records that this proxy can list the device and still report zero pages
on iOS 17 and newer
([transport section](../PROFILING-CAMPAIGNS.md#ios_webkit_debug_proxy-is-obsolete-on-ios-17-and-newer)).
If the check fails that way, follow that section. Don't read it as a missing device or as a skipped
check.

* **Pass:** P95 ≤ 25 ms on both arms. The baseline to compare against is P95 0–2 ms and max ≤ 4 ms
  on iPadOS 26.5.
* **Breach:** a breach blocks the release in the same way a red release-gate row does
  ([ADR-0156](0156-physical-rows-gate-releases-advisory-rows-never-count.md)). Fix it, or record an
  evidence-backed disposition in an ADR.
* **Record:** add the iPadOS and Safari versions, the build SHA, and the commit P95/max for each arm
  to the tag's GitHub Release notes. This is the same place the manual iOS floor gate is recorded.

The raw `commit-contract.json` the script writes under `perf-profiles/` carries the LAN harness URL.
Keep it out of the repo, and commit only derived figures.

**2. The runner job stays, and stays advisory.** `webkit-commit-gate-fast` on pushes to `main` and
the release-tag full run keep measuring, confirming and reporting exactly as ADR-0140 describes.
`COMMIT_GATE_ENFORCED` stays `false`, so neither can fail its job. The retry and issue filing key on
the job failing, so neither runs. The runner is now a **diagnostics stream**: a per-merge record of
the WebKit commit and crop distributions, with an advisory-breach fingerprint in the fast job's step
summary. It is not a verdict, and it is not temporary. Setting `COMMIT_GATE_ENFORCED` back to `true`
reverses this decision, so it needs a record that supersedes this one.

**3. Two properties survive whatever the runner scores:**

* The harness refuses to score a bundle built without `PERF_MARKS`. It reports
  `NOT EVALUATED: no engine.commit samples` instead of a 0 ms pass. The device check refuses the
  same way: an arm with no `engine.commit` samples has a `null` commit P95, which
  `perf:ios:webkit:commit` reports as NOT EVALUATED and exits non-zero on, never as a pass.
* The WebKit engine smoke (`npm run test:webkit:smoke`) is a separate instrument and this decision
  does not affect it. It asserts boot, hydration parity, and core UI on WebKit, and has no timing
  assertion.

**4. The first per-release check on iPadOS 26.6 is outstanding.** The rig's iPad is still on iPadOS
26.5. The maintainer has to update it to 26.6 before the next check, and that check is the first
on-device reading of whether the 26.6 commit-boundary charge reaches real hardware. If it does, the
contract catches it as a product problem. The runner could not have gated it either way, because of
the bimodal charging mode.

## Consequences

* \+ The contract lives on the hardware and browser build that children use, and on the one host
  where the 2026-09-18 baseline shows a clean 0–2 ms distribution. The budget has more than 10 times
  headroom there, and the check is not a coin flip.
* \+ `main` is not red on every merge, and the runner's distributions keep accumulating from
  ordinary runs. When a later WebKit build stops charging the raster at commit, the advisory stream
  shows it first.
* \+ One decision replaces an undocumented switch. ADR-0140 no longer reads as though its gate
  enforces.
* − **The commit path has no per-merge gate.** A stroke-end regression can merge and stay on `main`
  until the next release check, and only a device run will catch it. The runner's step summary is
  the only per-merge sign, and nobody is required to read it.
* − The check depends on the maintainer and the capture rig. It cannot run in CI, it costs a rig
  session per release, and a release cut in a hurry can skip it. The release checklist item in
  `docs/MOBILE/ios.md` and the `cut-release` skill's reminder are the only enforcement.
* − Only part of the check is tested off the device. `tools/perf/tests/commit-contract.test.mjs`
  covers the reduction, the verdict, the `PERF_MARKS` refusal, and the payload's identity with the
  baseline. The inspector transport in `tools/perf/lib/profile-device-session.mjs` and
  `webkit-inspector.mjs` can still break without a test noticing, and the first sign would be a
  failed release check.
* − Until the iPad runs iPadOS 26.6, the contract is anchored on a 26.5 baseline. The question this
  record inherits from issue 1774, whether the 26.6 commit wait is real on device, has no answer
  yet.
