# perf-rig

Frame-timing capture and scoring for web apps on real devices, with input and measurement on
separate channels.

`perf-rig` drives a page on a desktop browser, an Android phone or emulator, or an iPad or
simulator, through the platform's own trusted input, records per-frame and per-event rows inside the
page, carries them off the device over a channel the input cannot corrupt, and scores them in Node
from the raw rows. Every number a capture reports is re-derivable offline from what it saved, and
every capture carries a trust ledger naming which guards ran and what they found.

The package holds no knowledge of any particular app. Selectors, hooks, mark names, package ids,
thresholds and the target table all arrive through one declared contract, and the in-page recorders
are rendered from that contract so there is no second copy to drift.

## What you get

| Concern                     | The package owns                                                                                                                                                                   | You declare                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Getting input onto the page | Playwright, Appium XCUITest and UiAutomator2, WebDriverAgent over `iproxy`, `adb shell input`, CDP touch, and a human-in-the-loop transport, behind one driver interface           | Which transport draws and which acts on each target; a gesture plan as W3C pointer actions                               |
| Getting rows off the page   | Same-process, CDP, WebKit Inspector Protocol, Appium script channel, an HTTP probe host that proxies your preview, and a native-preferences mailbox pulled from the app container  | Which hooks the page exposes for hydration, committed mode, history depth, and the mailbox                               |
| Recording                   | Three probe templates: frames, discrete actions, and an input recorder; positional row schemas; the "probe records, Node computes" rule                                            | The surface, output surfaces, resting state, and measure namespace the probes read                                       |
| Proving the setup           | Twenty-two named guards from served-build identity to painted output, each recorded in the artifact; a preflight that reuses foreign listeners rather than stopping them           | Build command, output directory, entry-module pattern; port table; which guards a diagnostic capture may tolerate        |
| Scoring                     | Dominant-interval beat, pair-credited lost frame time, refresh-regime classification, per-runtime fidelity with a tri-state check vocabulary, scheduled-versus-actual frame clocks | Fidelity expectations per runtime, calibrated from a hand capture; gate thresholds, exceptions and allowances with basis |
| Keeping evidence            | Versioned artifact envelope, provenance from the build stamp, whole-artifact evidence promotion with tier-based selection and identifier redaction, offline re-scoring             | Where evidence lives; the cell key                                                                                       |
| Driving a campaign          | Resumable runner, append-only ledger, retry budget, instrument fingerprinting, start/middle/end reference drift, the single artifact inspector, a domain-free matrix renderer      | Modes, items, artifact paths, acceptance rules beyond the standard eight                                                 |
| Releasing the rig           | Process-ownership classification, session draining before signalling, device reset                                                                                                 | Worktree containers and owned-script patterns                                                                            |

## First capture

```sh
npx perf-rig doctor            # what is on PATH, what is cabled in, which transports are usable
npx perf-rig init              # writes perf-rig.config.mjs with every required contract field marked
npx perf-rig capture --target local-chromium --scenario frames-pen --dry-run
npx perf-rig capture --target local-chromium --scenario frames-pen
```

`doctor` evaluates every contract hook against your served page before anything is measured, so a
missing hydration handle or a resting-state expression that is never true is reported as a contract
gap rather than discovered as a capture that "measured" a page that did nothing.

`init` cannot write the contract for you. It writes the questions. Each required field carries the
failure it exists to prevent, and `doctor` refuses to report ready while one is unanswered.

## Reading a result

```
perf-profiles/2026-09-09T14-02-11-local-chromium-frames-pen/
  capture.json        the artifact: provenance, trust ledger, raw tables, derived summaries
  report.md           the human-readable table
```

Read the trust ledger before the number. A capture with a `failed` guard outside the list you
tolerated exits 2 and its number is not a measurement of the product. A capture whose fidelity
verdict failed exits 1 after writing, so the artifact is kept for inspection and never banked. A
capture whose verdict is `uncalibrated` is a gap in your expectations table, not a pass: recapturing
it changes nothing until a hand capture on that runtime sets the bounds.

Then compare against the previous run of the same cell. Three separate corrections to one metric
were each individually plausible; a number from any gate is provisional until it has been compared.

## Lifecycle

```
declare   defineApp, defineTargets, defineScenario, defineGates, defineRig
prove     doctor, preflight, planCapture
capture   capture, serve, serveProbeHost, renderProbe
score     summariseFrames, summariseActions, inputFidelity, refreshRegimeVerdict, evaluate*
keep      writeArtifact, keepEvidence, rescore, instrumentFingerprint
drive     runCampaign, campaignStatus, inspectCell, renderMatrix, stalenessOutcome
release   planRelease, release
```

The typed surface is in `types/`; the walk-through of every capture endpoint, with its
prerequisites, the guards it runs, the validations left to you, and its known traps, is
[`docs/endpoints.md`](docs/endpoints.md). [`docs/gotchas.md`](docs/gotchas.md) is the catalogue of
ways a capture completes cleanly and reports a plausible wrong number, and where each is caught.

## Rules the package will not bend

* **Input and measurement are separate channels.** A capture names both; unproved pairings are
  refused at plan time.
* **The probe records; Node computes.** No percentile is computed in the page. A re-score reads
  `report`, never `summaries`.
* **A guard failure is evidence, not an exception.** The artifact is written with the ledger, then
  the process exits non-zero.
* **Nothing device-identifying is written into an artifact.** Serials and UDIDs are redacted on
  promotion and refused by the tracked-tree scanner.
* **A threshold set from the automation is not calibrated.** Fidelity bounds carry a basis; a check
  that cannot separate a hand from a robot is a witness, never a gate.
* **A valid artifact is never re-captured by a resume.** Recapturing a first valid result would
  replace it with a different number, and a snapshot campaign must not do that.
* **Host identity travels as flags.** Device ids, ports and URLs are never read from the environment
  or committed.
