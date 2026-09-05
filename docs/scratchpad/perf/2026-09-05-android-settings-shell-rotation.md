# Android rotation: idle prewarming of the closed Settings shell

The complete landscape/light control at product commit 1496e4d72f747ca1c729e916f2aa4c2b3ad2a0c9
passed 34 of 35 action groups. Its previously red compact Night Mode activation passed, with three
scored-repeat maxima of 33.3 / 16.8 / 33.2 ms. Empty-clear landscape-to-portrait rotation failed the
first-frame gate: 38.0 / 12.1 / 11.1 ms, despite subsequent scored frame maxima of 16.8 / 16.8 /
16.7 ms. A single first-frame failure is not the scorer's unconfirmed post-action maximum warning.

## Mechanism and bounded treatment

A separate traced rotation diagnostic identified Settings hub nodes entering layout immediately
after resize. In the first scored inked landscape-to-portrait rotation, a 31.7 ms microtask included
an 18.5 ms style recalculation over 218 elements. The first-frame delay was 37.9 ms. No
engine-resize marks appeared inside that first-frame window. The empty-clear diagnostic first-frame
delays were 26.1 / 22.5 / 15.0 ms; this focused diagnostic does not replace the failed full-plan
control. The control diagnostic also failed `clear drawing for blank rotation` and
`clear restored drawing after blank rotation`, as did the treatment trace.

Settings stays laid out while hidden to prewarm its first presentation (ADR-0049). Its media-query
listeners also rebuilt the hidden responsive shell synchronously when the drawing page rotated. The
treatment schedules those closed-shell changes through the existing idle scheduler. Visible Settings
and the visible button-size preview continue to update immediately. Opening cancels pending
background work and reads the current viewport before presentation.

The provisional treatment was the same product commit plus only the saved
`settings-shell-idle-provisional.patch`; it was not a clean capture of that SHA. Its full
landscape/light plan passed all 35 groups:

| Action                            | Control first frames (ms) | Treatment first frames (ms) | Treatment scored-repeat maxima (ms) |
| --------------------------------- | ------------------------- | --------------------------- | ----------------------------------- |
| Empty-clear landscape to portrait | 38.0 / 12.1 / 11.1        | 14.8 / 3.5 / 4.2            | 16.8 / 16.7 / 16.8                  |
| Empty-clear portrait to landscape | 0.9 / 12.2 / 10.6         | 16.1 / 5.9 / 15.2           | 16.8 / 16.7 / 16.8                  |
| Inked landscape to portrait       | 7.4 / 6.6 / 15.9          | 10.8 / 15.0 / 15.0          | 16.8 / 16.8 / 16.8                  |
| Inked portrait to landscape       | 14.1 / 10.6 / 3.5         | 10.2 / 2.4 / 11.5           | 16.8 / 16.8 / 16.7                  |

The treatment's Settings-open maxima were 16.8 / 16.9 / 16.8 ms; no action had an unconfirmed
maximum warning. These are individual maxima from each sample's `scoredActionFrameGaps`, not pooled
percentiles relabeled as repeats.

A matching treatment trace confirms scheduling, not elimination of work: immediate post-resize
microtasks were about 0.04–0.09 ms; shell construction moved into idle callbacks. One traced
callback took 48.9 ms and the corresponding scored rotation maximum was 33.3 ms. The trace still
failed its clear-action groups. Both diagnostic captures remain distinct from untraced
certification; this is not a claim that every hidden mount is cheap or that all platforms pass.

## Provenance and validation

Raw study root: `perf-profiles/epic-1567-september-resume/`. The control and its diagnostic were
promoted through `keep-capture-evidence.mjs` to
`perf-profiles/evidence/2026-09-05-epic-1567-android-rotation-control/`. Its index maps both
retained captures to their original paths. Both captures used clean commit
1496e4d72f747ca1c729e916f2aa4c2b3ad2a0c9.

| Raw source beneath study root                                                           | SHA-256                                                          |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `reviewed-control/android-device-web/landscape-light/actions/actions.json`              | 0086657e3f0622becda58f7feef04c2cc73bd4452f638edf18995b523385da48 |
| `reviewed-control/android-landscape-light-rotation-trace/actions.json`                  | b0482142a19722752f97c7685c220439ffd54b41084dd2d3e90fe719eb2fe553 |
| `reviewed-control/android-landscape-light-rotation-trace/trace.json`                    | 4dd0f7aabe3ccc5beb318b5644133ba7123b1abe956bc9a8aaad80c78bb28842 |
| `settings-shell-idle-treatment/android-device-web/landscape-light/actions/actions.json` | 8f8a8dd032450f2931ced319ec2c1f270ae4eea5dbce02c2b47e1fe51934d3ed |
| `settings-shell-idle-treatment/rotation-trace/actions.json`                             | c5a50a314e4db147e4aebed68cb333144623fbb9ea5ee5005236971d2565eaf6 |
| `settings-shell-idle-treatment/rotation-trace/trace.json`                               | 654d63e663e90b26fbc39d2b79fb2fc099d9f3315a0194d71bfcc6c1242edede |
| `settings-shell-idle-provisional.patch`                                                 | 9589c5a7715bd193ffa5b51469ace06338c82eb66fedd826fcc4f89097e98d8b |

All seven source hashes were verified unchanged after promotion; retained copies passed scans for
physical device identifiers. Type checking and the performance build passed. All 28 targeted
Chromium Settings-flow and Settings-mount tests passed. The new test withholds idle callbacks,
verifies the closed shell waits, then proves opening and visible rotation bypass that wait.

## Clean reviewed treatment

Product commit d92ba50b9440938d84e82d9f13cb2423963fc71c also coalesces both breakpoint values into
one update and clears the button-size preview when its slider unmounts. Its first full
landscape/light certification passed 34 of 35 groups, with no unconfirmed maximum warnings. Every
group had three scored repeats after one warmup and valid activation in all four samples.

| Action                            | First frames (ms)  | Scored-repeat maxima (ms) |
| --------------------------------- | ------------------ | ------------------------- |
| Empty-clear landscape to portrait | 4.5 / 0.1 / 14.8   | 16.8 / 16.8 / 16.8        |
| Empty-clear portrait to landscape | 9.4 / 13.8 / 14.3  | 16.8 / 16.8 / 16.8        |
| Inked landscape to portrait       | 5.5 / 13.5 / 9.3   | 16.8 / 16.7 / 16.7        |
| Inked portrait to landscape       | 10.6 / 1.9 / 9.8   | 16.7 / 16.8 / 16.7        |
| Open Settings                     | 12.5 / 12.8 / 12.1 | 16.8 / 16.8 / 16.7        |
| Enable compact Night Mode         | 0.8 / 1.4 / 5.3    | 33.3 / 33.3 / 33.3        |

All four rotations passed. Compact Night Mode activation remained red (scored P95 33.3 ms), despite
passing in the earlier full control and provisional treatment. This is a preserved campaign red, not
a fully green treatment sweep or proof that shell scheduling caused the Night Mode failure. Idle
control maxima were 16.8 / 16.8 / 16.8 ms. No capture was retried to obtain a passing result.

The raw source is
`settings-shell-reviewed-treatment/android-device-web/landscape-light/actions/actions.json` beneath
the study root, SHA-256 `dea91f7eb88ff1f4473300377cdfa92377a2cc25af8affb03b11110703a33e3e`. The
keeper retained it whole in `perf-profiles/evidence/2026-09-05-epic-1567-settings-shell-reviewed/`
with the measured product commit. All eight study source hashes remained unchanged after promotion;
the retained capture and index passed identifier scans. The clean performance build recorded that
same commit with `dirty: false` before capture.

Four focused browser tests passed: foreground demand, eventual closed-shell prewarming without a
transient wide pane, slider unmount during rotation, and Escape during a still-live slider drag.
Removing the slider cleanup or restoring independent breakpoint callbacks made the corresponding
regression fail; the committed files were restored. Type checking, lint, formatting, and CI passed
at the product commit. All four findings in rival round one were addressed; round two remains
required before the next branch.

The authoritative four-row matrix remains on its older product commit; none of these focused results
substitutes for the final physical recapture.
