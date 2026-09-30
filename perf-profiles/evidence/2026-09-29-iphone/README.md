# Physical iPhone performance baseline

Product: 704edcdb1092420e204b684b80378149bbd890cd. Follow-up to PR #2478.

**40/40 accepted cells and 6/6 drift references; no missing cells.** Safari and native each have all
20 planned cells and three references. The 48 whole captures also include two separate calibration
probes. Capture is complete; the PR remains draft pending its review and CI gates.

`index.json` maps every whole capture to its source, cell, acceptance time, source SHA-256,
published SHA-256, and original instrument fingerprint. Its two calibration entries are separate
from the accepted queue. `checkpoint.json` records coverage, red budgets, calibration and drift.
Hardware identifiers and capture-host addresses are redacted only in published copies. The legacy
iOS driver writes `device.name: iPad` for both form factors; that label is not device identity. This
campaign used the physical iPhone 16 Pro Max (iPhone17,2), running iOS 26.6.2. Raw captures,
ledgers, saved builds and the live session remain in `perf-profiles/campaign/2026-09-29-iphone`.

Calibration entries retain their promotion-staging `source` paths for reproducible publication
filenames. Their `originalSource` fields locate the actual raw probes beneath the campaign
directory; the original bytes match the recorded source hashes.

## Calibration and results

Both Safari and the installed native WebView measured 17 ms, establishing the 60 Hz scoring regime.
All accepted drawing captures pass trusted-input fidelity; all native drawing budgets pass. Seven
Safari drawing cells exceed the 1% lost-frame-time budget: all four crayon cells, plus Magic in
portrait dark and both landscape modes. Native action sweeps retain their measured red budgets. This
is the first iPhone baseline, with no matched prior iPhone result to call a regression.

Web reference lost-frame shares are 1.11%, 1.24%, and 1.15% (0.13 percentage-point spread). Native
references are 0.35%, 0.30%, and 0.33% (0.05 percentage-point spread). Both are below the 0.5-point
drift warning. Web spans two capture invocations and cannot establish strictly within-session drift;
native spans one invocation. An accepted capture can have red performance budgets.

Action budget failures are retained in every accepted four-repeat sweep:

| Target | Mode            | Red budgets / applicable actions |
| ------ | --------------- | -------------------------------: |
| Safari | portrait-light  |                            18/56 |
| Safari | portrait-dark   |                            17/56 |
| Safari | landscape-light |                            16/42 |
| Safari | landscape-dark  |                            19/42 |
| Native | portrait-light  |                            11/56 |
| Native | portrait-dark   |                            11/56 |
| Native | landscape-light |                            11/42 |
| Native | landscape-dark  |                            12/42 |

All 16 Safari AI-finish samples report `secureContext: true` and complete without an AI run error.

## Build and instrument provenance

`controls/build-provenance.json` records the clean product build, installed native index binding and
restored web preview binding. The native bundle uses `capacitor://localhost`; its index matches the
saved native build. HTTP and HTTPS previews both match the saved web index and entry fingerprint.

`controls/instrument-provenance.json` records the captured source commit and module hashes. Extract
the `patch` field from `controls/banked-actions.patch.json` and apply that text to the action driver
at the recorded source commit to reproduce its captured bytes. Publication extracts tap placement,
names its constants, restricts the inset to iPhone handsets, and formats the driver. These edits do
not rewrite accepted fingerprints or ledgers. The saved pre-publication driver also remains in the
local session for reproducing those captures. `controls/web-actions-instrument.json` records the
actual driver and helper hashes used by the four completed HTTPS sweeps; their index entries retain
that fingerprint separately from the earlier drawing and native captures.

## HTTPS verification

`controls/https-verification.json` records the actual native Appium/XCUITest observations and hashes
of local screenshots/accessibility evidence. The certificate fingerprint matched the existing CA;
the trusted leaf loaded, the deliberately invalid constraint probe showed Safari's privacy warning
without a bypass, and the leaf loaded again. The user entered the device passcode and confirmed
installation; the agent enabled root trust and inspected the outcomes directly. Native Settings
readback also confirms Web Inspector and Remote Automation are enabled. The operator log records the
refusal on actual iOS 26.6.2. The guard retains the earlier proven 26.5 release and adds 26.6.2,
with a supporting refusal required for each release.

The existing RemoteXPC tunnel and healthy Appium server were reused. Temporary certificate-download
and constraint-probe servers were stopped. The original checkout, session, saved product builds and
accepted raw ledgers remain in place.

## Before merge

The remaining gates are final-head CI and the standard Claude rival review. Its preflight reports a
missing/stale installation; the permitted Codex fallback provides weaker independence. No merge is
authorized by this capture work.
