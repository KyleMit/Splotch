# Physical iPad web control at e514

The complete four-mode physical iPad web control measured e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3.
It preserves ten drawing reds and eleven discrete-action reds. All four pen-undo sections pass. This
is a control for further bounded product experiments, not a completed four-row release
certification. The authoritative matrix remains unchanged.

## Capture and scoring

The clean instrumented web build served `/_app/immutable/entry/start.DvQTVCP7.js`, with
application-chunk digest `ce9061b0ae81007d8e03a83eb04830a465297dd0ed44ef0f1b0688d4d239d853`.
Appium/XCUITest drove the physical iPad through the existing session-owned WDA connection. The
campaign used ten drawing gestures per brush, ten undo operations for pen, and four action
activations per group with the first warmup excluded. Every action invocation explicitly classified
the device as a tablet. Existing Open Settings allowances remain P95 26 ms and maximum 56 ms.

Every first valid capture is retained, including failures. The prebanked portrait/light pen and
canonical actions were adopted at the same clean build; the other cells ran once through
`perf:campaign` with `--max-attempts=1`. All 20 cells and three drift references completed. No
failure was retried for a passing number.

## Drawing and undo

| Mode            | Brush  | Paint P95 / P99 / max (ms) | Lost-frame share | Verdict |
| --------------- | ------ | -------------------------- | ---------------- | ------- |
| landscape-dark  | crayon | 15 / 16 / 33               | 0.30%            | PASS    |
| landscape-dark  | eraser | 16 / 23 / 39               | 1.19%            | RED     |
| landscape-dark  | magic  | 15 / 23 / 38               | 1.04%            | RED     |
| landscape-dark  | pen    | 16 / 24 / 39               | 1.22%            | RED     |
| landscape-light | crayon | 15 / 16 / 26               | 0.29%            | PASS    |
| landscape-light | eraser | 16 / 22 / 40               | 0.99%            | PASS    |
| landscape-light | magic  | 16 / 21 / 38               | 1.02%            | RED     |
| landscape-light | pen    | 16 / 25 / 41               | 1.28%            | RED     |
| portrait-dark   | crayon | 15 / 16 / 26               | 0.22%            | PASS    |
| portrait-dark   | eraser | 15 / 23 / 38               | 1.22%            | RED     |
| portrait-dark   | magic  | 16 / 24 / 38               | 1.15%            | RED     |
| portrait-dark   | pen    | 16 / 22 / 39               | 1.26%            | RED     |
| portrait-light  | crayon | 15 / 17 / 41               | 0.47%            | PASS    |
| portrait-light  | eraser | 16 / 21 / 38               | 1.25%            | RED     |
| portrait-light  | magic  | 16 / 21 / 36               | 1.00%            | PASS    |
| portrait-light  | pen    | 16 / 24 / 42               | 1.37%            | RED     |

The target-aware matrix/rescore budget is 1% for pen, Magic, and eraser, and 1.5% for crayon under
ADR-0137's `ipad-device-web:crayon` exception. The comparison is inclusive (`<=`), so the
portrait/light Magic result at 1.00% passes exactly at the boundary. These original captures stored
the base 1% budget for every brush; crayon measured 0.22–0.47%, so all verdicts also agree with the
target-aware rescorer. No artifact or threshold was changed.

All drawing captures pass trusted-touch fidelity and every paint-time check. The ten drawing
failures are lost-frame-share breaches, not invalid captures. Crayon passes in every mode. These
observations motivate testing raster batching but do not establish a cause. No GPU bottleneck or
host-contention explanation is proved by this control.

| Mode            | Undo count | Engine P95 / max (ms) | Next-frame P95 / max (ms) |
| --------------- | ---------- | --------------------- | ------------------------- |
| landscape-dark  | 10         | 1 / 1                 | 13 / 13                   |
| landscape-light | 10         | 1 / 1                 | 12 / 12                   |
| portrait-dark   | 10         | 1 / 1                 | 12 / 12                   |
| portrait-light  | 10         | 1 / 1                 | 11 / 11                   |

Non-pen captures did not request undo; their zero-count undo fields are not failed undo cells. The
three portrait/light crayon references all pass, with lost-frame shares 0.21%, 0.34%, and 0.28%.
Their 0.13 percentage-point spread is below the 0.5-point warning boundary. That stability does not
erase any measured red.

## Discrete actions

Of 194 scoreable action groups, 183 pass and eleven fail. Each maximum below is calculated
independently from that scored repeat’s `scoredActionFrameGaps`; pooled P95/P99/max are never
represented as three repeats. All groups have four valid activations. Portrait coloring-scroll is
separately not applicable because the grid fits.

| Mode            | Red action                               | Three scored maxima (ms) | Post-action P95 (ms) |
| --------------- | ---------------------------------------- | ------------------------ | -------------------- |
| landscape-dark  | open Settings                            | 27 / 31 / 30             | 27                   |
| landscape-dark  | close Settings                           | 22 / 22 / 23             | 21                   |
| landscape-dark  | select coloring page                     | 27 / 28 / 27             | 27                   |
| landscape-light | open Settings                            | 28 / 28 / 27             | 27                   |
| landscape-light | close Settings                           | 22 / 22 / 21             | 21                   |
| landscape-light | select coloring page                     | 26 / 28 / 19             | 26                   |
| portrait-dark   | open Settings                            | 30 / 31 / 41             | 27                   |
| portrait-dark   | select coloring page                     | 24 / 19 / 23             | 23                   |
| portrait-dark   | with ink: PORTRAIT to LANDSCAPE rotation | 22 / 19 / 25             | 22                   |
| portrait-light  | switch light theme to dark               | 26 / 24 / 23             | 22                   |
| portrait-light  | with ink: PORTRAIT to LANDSCAPE rotation | 22 / 23 / 22             | 22                   |

Single-repeat unconfirmed maximum warnings remain warnings, not red cells. Disabling Advanced
Controls passes in all four modes at 17 / 17 / 17 ms. Landscape/dark Action Drawer expansion is 17 /
17 / 17 ms; collapse is 18 / 17 / 17 ms. Neither result alone closes a child or certifies the other
physical rows.

## Retention and disposition

The raw corpus is `perf-profiles/epic-1567-final-e5142fab/ipad-device-web/`. All 23 whole captures
were promoted with `keep-capture-evidence.mjs --target=ipad-device-web --keep-all` to
`perf-profiles/evidence/2026-09-05-epic-1567-ipad-e514-control/`. Its index maps every kept file to
its raw source. The keep-all exception retains all modes, first failures, and drift references
instead of selecting favorable samples.

SHA-256 verification established that every source was unchanged after promotion. Deep comparison of
every kept payload against the identifier-redacted original preserved the complete measurements. The
kept copies contain no observed device identifiers or Apple device-identifier patterns. Actions
carry activation validity in their own samples; the keeper index’s null drawing-fidelity field is
not an action failure.

The previously focused portrait/light Settings dismissal hypothesis was not applied because its
fresh controls passed. This full control subsequently reproduces dismissal reds in both landscape
modes. The drawing batching experiment and landscape Settings follow-up must retain their own
faithful control/treatment evidence and dispositions. No product treatment, issue closure, or
threshold change is claimed by this report.
