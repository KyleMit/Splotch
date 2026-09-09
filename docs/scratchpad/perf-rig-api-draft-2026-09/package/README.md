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
are rendered from that contract so there is no second copy to drift. The contract's literal types
flow into every definer, so a control the contract does not declare is a type error, not a capture
that spent device time.

## Three entry points

| Import              | What it adds                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `perf-rig`          | Declare an app, targets, scenarios and gates; plan and run one capture; score; read and write artifacts. All a desktop user needs. |
| `perf-rig/campaign` | The resumable grid runner, the ledger, the single artifact inspector, evidence promotion, offline re-scoring.                      |
| `perf-rig/rig`      | The physical-device lifecycle: preflight, operator session, calibration, release, the floor control.                               |

## What you get and what you declare

| Concern                     | The package owns                                                                                                                                                                    | You declare                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Getting input onto the page | Playwright, Appium, WebDriverAgent over `iproxy`, `adb shell input`, CDP touch, and a human-in-the-loop transport, behind one driver interface; multi-pointer W3C plans             | Which transport draws and which acts on each target; a gesture plan                                               |
| Getting rows off the page   | Same-process, CDP, WebKit Inspector, the Appium script channel, a plan-polled HTTP probe host that proxies your preview, and a native-preferences mailbox pulled from the container | The hooks the page exposes: hydration, committed tool, history depth, the mailbox                                 |
| Recording                   | Three probe templates rendered from your contract; positional row schemas; the "probe records, Node computes" rule                                                                  | The surface, output surfaces, resting state, paper element and measure namespace the probes read                  |
| Proving the setup           | Eighteen guards and eleven verdicts, each recorded in the artifact; a preflight that reuses foreign listeners rather than stopping them                                             | Build command, output directory, identity strategy; which guards a diagnostic capture may tolerate                |
| Scoring                     | Dominant-interval beat, pair-credited lost frame time, refresh-regime classification, the fidelity verdict engine and its tri-state, scheduled-versus-actual frame clocks           | Fidelity expectations per runtime with a basis and a negative control; gate thresholds, exceptions and allowances |
| Keeping evidence            | A versioned artifact envelope typed per scenario kind, provenance from the build stamp, whole-artifact promotion with tier-based selection and identifier redaction, re-scoring     | Where evidence lives; the cell key; the upgrader for any pre-package corpus                                       |
| Driving a campaign          | Resumable runner, append-only ledger with a closed status vocabulary, retry budget, instrument fingerprinting, start/middle/end reference drift, the single artifact inspector      | Variants, items, artifact paths, acceptance rules beyond the standard ones                                        |
| Releasing the rig           | Process-ownership classification, session draining before signalling, device reset                                                                                                  | Worktree containers and owned-script patterns                                                                     |

## First capture

```sh
npx perf-rig init                      # writes perf-rig.config.mjs: every required field marked with the failure it prevents
npx perf-rig doctor --serve            # tools on PATH, devices cabled in, every contract hook evaluated on your served page
npx perf-rig capture --target local-chromium --scenario first-actions --dry-run
npx perf-rig capture --target local-chromium --scenario first-actions
```

`init` writes a starter `actions` scenario over one declared control, because that shape needs no
tool concept and no calibration. `doctor` refuses to report ready while a required contract field is
unanswered, and evaluates each hook against the served page so a resting-state expression that is
never true is found before a capture runs. Nothing under `perf-rig/rig` is needed until a device is
involved.

At the nested rung, before the package is published, there is no CLI: an app's own scripts call the
library directly and `doctor` is a library call too.

## Reading a result

```
perf-profiles/2026-09-09T14-02-11-local-chromium-first-actions/
  capture.json        the artifact: provenance, trust ledger, raw tables, typed evidence, derived summaries
  report.md           the human-readable table
```

Read the trust ledger before the number. A `failed` guard outside the list you tolerated exits 2 and
the number is not a measurement of the product. A failed verdict exits 1 after writing, so the
artifact is kept and never banked. An `uncalibrated` fidelity check is a gap in your expectations,
not a pass: recapturing changes nothing until `calibrate` has a hand capture and a known-bad control
for that runtime.

Then compare against the previous run of the same cell. A number from any gate is provisional until
it has been compared.

## Compatibility across the seam

`COMPAT` names everything that can change independently of your code: the artifact schema, the two
probe row schemas, the frame-stamp epoch, the scoring epoch and the probe-host protocol token. The
policy: a schema or row change is a major version and `readArtifact` upgrades or refuses; a new
guard or ledger status is a minor version; any change that can alter a summary on identical rows
bumps `scoringEpoch`, and an app regenerates its golden ledgers in the same change that adopts it.
Pin exact versions. At the nested rung all of this collapses to "same commit".

## Rules the package will not bend

* **Input and measurement are separate channels.** A capture names both; unproved pairings are
  refused at plan time.
* **The probe records; Node computes.** No percentile is computed in the page. A re-score reads
  `report`, never `summaries`.
* **A guard failure is evidence, not an exception.** The artifact is written with the ledger, then
  the process exits non-zero.
* **Nothing device-identifying is written into an artifact.** Serials and UDIDs are redacted on
  promotion and refused by the tracked-tree scanner.
* **A threshold set from the automation is not calibrated.** The package ships no fidelity number;
  `calibrate` refuses to propose one without a negative control.
* **A valid artifact is never re-captured by a resume.** Recapturing a first valid result would
  replace it with a different number.
* **Host identity travels as flags.** Device ids, ports and URLs are never read from the environment
  or committed.
* **Every capture can be cancelled and observed.** `signal`, `onEvent` and named timeouts are on the
  request; every command takes `--json`.

[`docs/endpoints.md`](docs/endpoints.md) walks every endpoint; [`docs/guards.md`](docs/guards.md) is
the ledger vocabulary; [`docs/gotchas.md`](docs/gotchas.md) maps each catalogued trap to where it is
caught.
