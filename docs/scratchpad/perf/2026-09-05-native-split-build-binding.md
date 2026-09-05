# Native split-capture build binding

The native pen/undo capture requested a native export, but the shared freshness guard rejected that
export before measurement. PR #1683 passes the requested runtime from both split-capture entry
points into the guard. Web captures still reject native output; native captures reject web output.
Both retain the served application-chunk byte checks and build-time commit attribution.

## Product and instrument

The native static bundle was built from clean commit 8d0e1b4c1971b6240df3053c4da4ef2ae2494077 in an
isolated checkout. `perf:build:cap` and `write-build-provenance.mjs` ran in one build operation,
with the clean commit checked before and after. The build's fingerprint is
`c8269bd348d0e2b2addc2518f51f6829fea9559f104902c46cc91723c93c5d18`. The capture instrument is
bb93dfd858f2e696f1fdf865a9ae6264d2759a58. The intervening changes do not alter product files.
Captures report the build commit rather than the later capture-time HEAD.

The native static export was served with `CAPACITOR=true PUBLIC_ENABLE_DEV_HARNESS=true` through
`tools/run-web-tool.mjs vite preview` on an explicitly free port, then through the probe host.
`perf:serve` intentionally rejects native output. The Android debug app was copied and installed
with a temporary probe-host `server.url` and Android cleartext permission; the tracked Capacitor
configuration was restored. Capture delivery is `remote-probe-host`, not the packaged offline
origin. The report identifies Android 16 and WebView 151.0.7922.199.

Native split capture records `pageIdentity: unprovable`: its configured `server.url` carries no
per-cell URL nonce. The existing live probe protocol gates the report and the build guard checks the
served bytes, but this does not establish the stronger browser URL identity guarantee. This
limitation is preserved in every whole artifact and is not relabeled by the keeper.

## Invalid setup retained

The first attempt at the corrected instrument failed fidelity or setup. Two reference captures
recorded trusted touch events entirely outside the canvas; other cells rejected a landscape page
when portrait was requested. The native Settings UI showed a retained landscape lock. Unlocking
through that product control restored portrait geometry and valid touch delivery. No preference was
mutated through a test seam.

Before resuming the two-attempt campaign, the complete failed target directory was copied byte for
byte and hashed. This matters because a campaign retry reuses its output paths. The retained failure
snapshot, rather than those later-overwritten paths, is the source of the invalid evidence. No valid
performance red was retried for a greener number. A short two-gesture/two-undo diagnostic passed
fidelity after the unlock; it is setup evidence, not the canonical ten-repeat control.

## Verification and scope

All 103 campaign-plan tests pass, including mismatched build variants and mismatched native
application-chunk bytes. Replacing the guard with its parent version makes the new cases fail. Type
checking and formatting pass. This change does not alter product behavior, fidelity gates, frame
thresholds, or the authoritative matrix. Issue #1630 still requires the complete final web/native
undo set; issues #1563 and #1567 remain open.

## Physical control

The portrait/light pen cell completed the canonical ten gesture repeats and ten undo actions.
Trusted-touch and cadence fidelity pass. Paint P95/P99/max are 7.9 / 8.1 / 9.6 ms, with 0.01%
lost-frame share. Undo engine P95/max are 1.6 / 1.6 ms; next-frame P95/max are 6.0 / 6.0 ms. All ten
undo steps changed the canvas digest. These are one capture's distributions, not three independent
action repeats.

All three scheduled crayon references completed with valid input. The start reference failed the
paint-maximum gate and is preserved without a retry. Reference drift in lost-frame share was 0.23
percentage points, below the 0.5-point warning threshold. That drift result does not override the
start reference's paint failure.

| Capture       | Paint P95/P99/max (ms) | Lost-frame share | Timing verdict      |
| ------------- | ---------------------- | ---------------- | ------------------- |
| Crayon start  | 7.9 / 8.1 / 90.8       | 0.24%            | FAIL: paint maximum |
| Crayon middle | 7.8 / 8.0 / 13.5       | 0.01%            | PASS                |
| Crayon end    | 7.8 / 8.0 / 11.8       | 0.01%            | PASS                |

The start failure is a retained lead for the product campaign, not evidence that this build-binding
correction improves painting. It has no same-session product treatment or causal trace attribution.
The full four-mode/four-brush native row and final common-product matrix remain outstanding.

## Whole-artifact retention

`keep-capture-evidence.mjs --keep-all --allow-failed` promoted all seven captures into
`perf-profiles/evidence/2026-09-05-epic-1567-native-split-binding/`: two invalid pre-unlock
references, the short diagnostic, and the full pen cell plus all three references. The keeper's
index identifies each source and retains the invalid fidelity results. No artifact was trimmed. All
thirteen source/copy files, including local campaign bookkeeping, retained their SHA-256 hashes
after promotion. Retained files passed exact resolved-device and iPad-identifier-pattern scans. The
following hashes identify the raw inputs before the keeper's identifier redaction.

| Source beneath study corpus                                                        | Raw SHA-256                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `full-control/android-device-native/portrait-light/pen-real-screen.json`           | `71acab4c670b35c282e382475b62560b6e2f93d2c78e57eb0bd4f01b7855244b` |
| `full-control/android-device-native/references/portrait-light/end.json`            | `1a1faf2f909390821a55ac552013e3df5a244236ac097e3ccc792740a868855f` |
| `full-control/android-device-native/references/portrait-light/middle.json`         | `b8fabeb36a5c2dc4d00c2443a9d96d4faec8471b0a384c64e4f599e645ba9d4c` |
| `full-control/android-device-native/references/portrait-light/start.json`          | `c7ba65bb76218ed1f63060e508be3d316e87879e82a2c081764db1c4381a08a1` |
| `invalid-before-unlock/android-device-native/references/portrait-light/end.json`   | `47414f351cdbe7ca090037fb473f3f6541470a62e3bd63fdd949fbf0d60207e5` |
| `invalid-before-unlock/android-device-native/references/portrait-light/start.json` | `046ae6f83372b2153d3e2a5dcb4992d6e9316d70b303ac6b6849cbcada36a21d` |
| `short-diagnostic/pen-real-screen.json`                                            | `ac187b565e99b22d1248450638b195cb3488567ab792807556215c7fdc833746` |
