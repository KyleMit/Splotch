# Landscape Settings dismissal controls

The proposed Settings compositor-retirement experiment was not applied. Fresh canonical physical
iPad web controls at e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 did not reproduce the dismissal
failure in either landscape mode. These controls record variability; they do not establish a fix,
replace the earlier reds, or update the authoritative matrix.

## Question and outcome

The [complete four-mode control](2026-09-05-ipad-web-e514-control.md) recorded dismissal P95 21 ms
in both landscape modes, against the unchanged 20 ms gate. The proposed mechanism was that hiding
Settings descendants during dismissal might cause repaint work that the existing transient
`retirement: 'compositor'` option could avoid. That option hides the dialog surface before removing
it from the top layer; it is distinct from the rejected persistent Settings compositor hint.

One fresh full canonical control ran in landscape/light, followed by one in landscape/dark for its
independently observed red. Both passed dismissal before any edit. There was no candidate build,
treatment capture, visual change, or causal attribution. The mechanism remains untested. No mode was
retried until green, and the earlier first valid reds remain committed in their original corpus.

| Mode            | Capture                     | Three dismissal maxima (ms) | Scored P95 (ms) | Readiness P50 / P95 (ms) | Verdict |
| --------------- | --------------------------- | --------------------------- | --------------- | ------------------------ | ------- |
| landscape/light | Earlier complete control    | 22 / 22 / 21                | 21              | 137 / 139                | RED     |
| landscape/light | Fresh pre-treatment control | 21 / 22 / 21                | 20              | 36 / 140                 | PASS    |
| landscape/dark  | Earlier complete control    | 22 / 22 / 23                | 21              | 133 / 134                | RED     |
| landscape/dark  | Fresh pre-treatment control | 23 / 23 / 23                | 20              | 35 / 135                 | PASS    |

Each triple is calculated separately from the three non-warmup samples using
`scoredActionFrameGaps`. Scored P95 uses the existing pooled scored-frame distribution; it is not
one of the three repeat maxima. All four activations per group were valid. The difference in
readiness P50 is an observation from unchanged code, not a latency improvement attributed to a
product treatment. The Appium polling path and readiness predicate are unchanged.

## Complete control results

Both suites contain 49 scoreable groups: landscape/light passes 48, landscape/dark passes 47. No
single-repeat maximum warnings were recorded. The three surviving reds are retained:

| Mode            | Action               | Three scored maxima (ms) | Scored P95 (ms) | Readiness P50 / P95 (ms) |
| --------------- | -------------------- | ------------------------ | --------------- | ------------------------ |
| landscape/light | select coloring page | 26 / 28 / 28             | 28              | 127 / 127                |
| landscape/dark  | open Settings        | 27 / 28 / 27             | 27              | 326 / 334                |
| landscape/dark  | select coloring page | 30 / 27 / 29             | 29              | 127 / 133                |

Landscape/light Open Settings passes with maxima 27 / 29 / 28 ms, scored P95 25 ms, and readiness
332 / 334 ms. The existing tablet Open Settings allowance remains P95 26 ms and maximum 56 ms; other
actions retain the base P95 20 ms and maximum 33.5 ms, with maximum breaches requiring confirmation
in two scored repeats. No threshold, allowance, scorer, action plan, or product code changed.

## Provenance and retention

The clean instrumented build served `/_app/immutable/entry/start.DvQTVCP7.js`, with
application-chunk digest `ce9061b0ae81007d8e03a83eb04830a465297dd0ed44ef0f1b0688d4d239d853`. The
preview retained that clean build while the checkout advanced through evidence-only commits. Product
sources, build inputs, and capture/scoring code were identical between that measured commit and the
experiment branch's base, 9cd455c032eb43ee36ccf31a54a4a64f9fcad4af. Both controls used the same
physical iPad, Appium/XCUITest connection, runner, preview, and explicit tablet classification. Each
full canonical plan ran four repeats: one warmup and three scored.

The raw corpus is `perf-profiles/epic-1567-landscape-retirement/`. Both entire payloads were
promoted through `keep-capture-evidence.mjs --target=ipad-device-web --keep-all`, with a study
rationale, to `perf-profiles/evidence/2026-09-05-epic-1567-landscape-retirement-controls/`.

| Raw source                             | Original SHA-256                                                   | Kept file                |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| `control-landscape-light/actions.json` | `041adf10a5783901564dd3271155ed48c3fa610247f7dac525a39b871ad746fb` | `actions--14063514.json` |
| `control-landscape-dark/actions.json`  | `3e38381697f59a7a90ecabcfd59e967de138e909cc1012c0eaa54ba7ebd97f68` | `actions--afbdde35.json` |

Every original hash is unchanged after promotion. Deep comparison of each kept payload with the
identifier-redacted original preserves every measurement and scored result. The copies contain no
observed iPad identifier or Apple device-identifier pattern. The index's null drawing-fidelity field
is not an action failure: every action group independently reports four valid activations and three
scored repeats.

The earlier landscape reds remain in
`perf-profiles/evidence/2026-09-05-epic-1567-ipad-e514-control/`. These fresh passing dismissal
controls are not substituted into that complete control or the authoritative four-row matrix. Issues
#1567, #1563, and #1569 remain open. Final physical recapture, surviving product findings, and the
remaining campaign children still require work.
