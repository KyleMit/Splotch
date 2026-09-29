# Physical iPhone campaign checkpoint

Product: 704edcdb1092420e204b684b80378149bbd890cd. Follow-up to PR #2478.

**36/40 accepted cells and 6/6 drift references.** Web has 16 drawing cells; native has all 20
drawing/action cells. The four web action sweeps remain pending in portrait light/dark and landscape
light/dark. This checkpoint is incomplete and the PR remains draft before merge.

`index.json` maps every whole capture to its source, cell, acceptance time, source SHA-256,
published SHA-256, and original instrument fingerprint. Its two calibration entries are separate
from the accepted queue. `checkpoint.json` records coverage, red budgets, calibration and drift.
Hardware identifiers and capture-host addresses are redacted only in published copies. The legacy
iOS driver writes `device.name: iPad` for both form factors; that label is not device identity. This
campaign used the physical iPhone 16 Pro Max (iPhone17,2), running iOS 26.6.2. Raw captures,
ledgers, saved builds and the live session remain in `perf-profiles/campaign/2026-09-29-iphone`.

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

## Build and instrument provenance

`controls/build-provenance.json` records the clean product build, installed native index binding and
restored web preview binding. The native bundle uses `capacitor://localhost`; its index matches the
saved native build. HTTP and HTTPS previews both match the saved web index and entry fingerprint.

`controls/instrument-provenance.json` records the captured source commit and module hashes. Extract
the `patch` field from `controls/banked-actions.patch.json` and apply that text to the action driver
at the recorded source commit to reproduce its captured bytes. Publication extracts tap placement,
names its constants, restricts the inset to iPhone handsets, and formats the driver. These edits do
not rewrite accepted fingerprints or ledgers. The saved pre-publication driver also remains in the
local session for reproducing those captures.

## Before merge

A person must verify that the restricted HTTPS leaf loads on the phone and that the separate
constraint probe is refused on iOS 26.6.2. Screen Time was dismissed; certificate trust has not been
verified. Record the actual observation, update the constrained-origin version guard with that
evidence, and complete all four Safari action sweeps over HTTPS using the saved web build. HTTP
cannot exercise the AI finish action because its crypto API needs a secure context.

Resume the accepted queue; retain its original instrument fingerprints, record the actual driver
fingerprint for new actions, and republish the completed checkpoint before making the PR ready.
