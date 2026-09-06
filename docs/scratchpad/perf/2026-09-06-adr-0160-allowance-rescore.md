# ADR-0160 allowance rescore over the committed iPad web action evidence

Desk rescore from committed evidence only; no device time. Every `ipad-device-web` action capture
under `perf-profiles/evidence/` was re-summarized twice through the shipped scorer
(`tools/perf/lib/action-stats.mjs`, `summarizeActions`): once under the `gateAllowances` ledger the
artifact recorded, once under the ADR-0160 ledger. Only the five covered actions are listed. Every
figure below is the scorer's own pooled post-action P95 / max over the three scored repeats.

The published matrix could not be regenerated to carry this diff itself: its physical rows are built
from `perf-profiles/epic-1567-final-9af487b3/`, a gitignored raw corpus that no checkout on this
machine holds any more, so `npm run gen:performance-matrix` fails with `ENOENT` on its first source.
The preserved-evidence path deliberately withholds a current verdict, so it cannot stand in. This
note is the record until the next regeneration with raw inputs (the android-device-native fold,
issue 1563), where the eleven e5142fab cells flip in `data.json`.

Sizing rule: each allowance is one whole millisecond above the worst committed single capture of its
cell (ADR-0137's worst-single-capture rule; the scorer's percentile rounds to whole milliseconds).
Result: 85 covered readings, 33 flipped from FAIL to PASS, none still red.

| Action                                   | Allowance | Mode            | Product commit | Corpus                                                                   | P95 / max (ms) | Before | After |
| ---------------------------------------- | --------: | --------------- | -------------- | ------------------------------------------------------------------------ | -------------: | ------ | ----- |
| close Settings                           |        22 | landscape/dark  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--c59c94ce.json                 |        21 / 23 | FAIL   | PASS  |
| close Settings                           |        22 | landscape/light | e5142fab       | …05-epic-1567-ipad-e514-control · actions--45390d94.json                 |        21 / 22 | FAIL   | PASS  |
| close Settings                           |        22 | portrait/light  | 141288da       | …05-epic-1567-ipad-paper-control · actions--9f43bfdf.json                |        21 / 21 | FAIL   | PASS  |
| close Settings                           |        22 | portrait/dark   | e5142fab       | …05-epic-1567-ipad-e514-control · actions--8c8d5bb0.json                 |        20 / 23 | PASS   | PASS  |
| close Settings                           |        22 | portrait/light  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--518e26d0.json                 |        20 / 22 | PASS   | PASS  |
| close Settings                           |        22 | landscape/dark  | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--afbdde35.json     |        20 / 23 | PASS   | PASS  |
| close Settings                           |        22 | landscape/light | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--14063514.json     |        20 / 22 | PASS   | PASS  |
| close Settings                           |        22 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--06d55dd3.json                   |        19 / 21 | PASS   | PASS  |
| close Settings                           |        22 | portrait/dark   | 3c017796       | …04-epic-1567-control-actions · actions--94f6cf20.json                   |        19 / 22 | PASS   | PASS  |
| close Settings                           |        22 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--fbcc976e.json   |        19 / 22 | PASS   | PASS  |
| close Settings                           |        22 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · ipad-device-web-actions.json               |        19 / 23 | PASS   | PASS  |
| close Settings                           |        22 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--ceb1beaf.json                   |        18 / 19 | PASS   | PASS  |
| close Settings                           |        22 | portrait/light  | 3c017796       | …04-epic-1567-control-actions · actions--318f7e00.json                   |        18 / 20 | PASS   | PASS  |
| close Settings                           |        22 | landscape/dark  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--8c895acb.json   |        18 / 24 | PASS   | PASS  |
| close Settings                           |        22 | landscape/light | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--43edce48.json   |        18 / 22 | PASS   | PASS  |
| close Settings                           |        22 | portrait/dark   | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--f0468c07.json   |        18 / 23 | PASS   | PASS  |
| close Settings                           |        22 | portrait/light  | bf4c22ad       | …05-epic-1567-advanced-controls-control · ipad-device-web-actions.json   |        18 / 23 | PASS   | PASS  |
| close Settings                           |        22 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-treatment · ipad-device-web-actions.json |        17 / 23 | PASS   | PASS  |
| open Settings                            |        29 | landscape/dark  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--8c895acb.json   |        28 / 30 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--ceb1beaf.json                   |        27 / 29 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · ipad-device-web-actions.json               |        27 / 31 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/dark  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--c59c94ce.json                 |        27 / 31 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/light | e5142fab       | …05-epic-1567-ipad-e514-control · actions--45390d94.json                 |        27 / 28 | FAIL   | PASS  |
| open Settings                            |        29 | portrait/dark   | e5142fab       | …05-epic-1567-ipad-e514-control · actions--8c8d5bb0.json                 |        27 / 41 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/dark  | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--afbdde35.json     |        27 / 28 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--06d55dd3.json                   |        26 / 29 | PASS   | PASS  |
| open Settings                            |        29 | landscape/light | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--43edce48.json   |        26 / 31 | FAIL   | PASS  |
| open Settings                            |        29 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--fbcc976e.json   |        26 / 31 | FAIL   | PASS  |
| open Settings                            |        29 | portrait/light  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--518e26d0.json                 |        26 / 31 | PASS   | PASS  |
| open Settings                            |        29 | portrait/dark   | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--f0468c07.json   |        25 / 31 | FAIL   | PASS  |
| open Settings                            |        29 | portrait/light  | 141288da       | …05-epic-1567-ipad-paper-control · actions--9f43bfdf.json                |        25 / 35 | FAIL   | PASS  |
| open Settings                            |        29 | landscape/light | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--14063514.json     |        25 / 29 | PASS   | PASS  |
| open Settings                            |        29 | portrait/dark   | 3c017796       | …04-epic-1567-control-actions · actions--94f6cf20.json                   |        24 / 30 | PASS   | PASS  |
| open Settings                            |        29 | portrait/light  | 3c017796       | …04-epic-1567-control-actions · actions--318f7e00.json                   |        24 / 29 | PASS   | PASS  |
| open Settings                            |        29 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-treatment · ipad-device-web-actions.json |        23 / 25 | FAIL   | PASS  |
| open Settings                            |        29 | portrait/light  | bf4c22ad       | …05-epic-1567-advanced-controls-control · ipad-device-web-actions.json   |        20 / 24 | PASS   | PASS  |
| select coloring page                     |        30 | landscape/dark  | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--afbdde35.json     |        29 / 30 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/light | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--43edce48.json   |        28 / 28 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · ipad-device-web-actions.json               |        28 / 29 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/light | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--14063514.json     |        28 / 28 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--06d55dd3.json                   |        27 / 28 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/dark  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--8c895acb.json   |        27 / 29 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/dark  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--c59c94ce.json                 |        27 / 28 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--ceb1beaf.json                   |        26 / 28 | FAIL   | PASS  |
| select coloring page                     |        30 | landscape/light | e5142fab       | …05-epic-1567-ipad-e514-control · actions--45390d94.json                 |        26 / 28 | FAIL   | PASS  |
| select coloring page                     |        30 | portrait/dark   | e5142fab       | …05-epic-1567-ipad-e514-control · actions--8c8d5bb0.json                 |        23 / 24 | FAIL   | PASS  |
| select coloring page                     |        30 | portrait/dark   | 3c017796       | …04-epic-1567-control-actions · actions--94f6cf20.json                   |        22 / 24 | FAIL   | PASS  |
| select coloring page                     |        30 | portrait/light  | 141288da       | …05-epic-1567-ipad-paper-control · actions--9f43bfdf.json                |        19 / 20 | PASS   | PASS  |
| select coloring page                     |        30 | portrait/light  | 3c017796       | …04-epic-1567-control-actions · actions--318f7e00.json                   |        17 / 17 | PASS   | PASS  |
| select coloring page                     |        30 | portrait/dark   | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--f0468c07.json   |        17 / 17 | PASS   | PASS  |
| select coloring page                     |        30 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--fbcc976e.json   |        17 / 17 | PASS   | PASS  |
| select coloring page                     |        30 | portrait/light  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--518e26d0.json                 |        17 / 18 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/light  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--518e26d0.json                 |        22 / 26 | FAIL   | PASS  |
| switch light theme to dark               |        23 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--06d55dd3.json                   |        17 / 21 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--ceb1beaf.json                   |        17 / 21 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/dark   | 3c017796       | …04-epic-1567-control-actions · actions--94f6cf20.json                   |        17 / 21 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/light  | 3c017796       | …04-epic-1567-control-actions · actions--318f7e00.json                   |        17 / 22 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/dark  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--8c895acb.json   |        17 / 22 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/light | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--43edce48.json   |        17 / 23 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/dark   | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--f0468c07.json   |        17 / 24 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--fbcc976e.json   |        17 / 24 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · ipad-device-web-actions.json               |        17 / 22 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/dark  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--c59c94ce.json                 |        17 / 22 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/light | e5142fab       | …05-epic-1567-ipad-e514-control · actions--45390d94.json                 |        17 / 24 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/dark   | e5142fab       | …05-epic-1567-ipad-e514-control · actions--8c8d5bb0.json                 |        17 / 24 | PASS   | PASS  |
| switch light theme to dark               |        23 | portrait/light  | 141288da       | …05-epic-1567-ipad-paper-control · actions--9f43bfdf.json                |        17 / 23 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/dark  | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--afbdde35.json     |        17 / 23 | PASS   | PASS  |
| switch light theme to dark               |        23 | landscape/light | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--14063514.json     |        17 / 23 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/light  | 141288da       | …05-epic-1567-ipad-paper-control · actions--9f43bfdf.json                |        25 / 28 | FAIL   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/light  | 141288da       | …05-epic-1567-ipad-paper-control · actions--5372bd09.json                |        25 / 27 | FAIL   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/light  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--fbcc976e.json   |        24 / 24 | FAIL   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/dark   | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--f0468c07.json   |        23 / 24 | FAIL   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/dark   | e5142fab       | …05-epic-1567-ipad-e514-control · actions--8c8d5bb0.json                 |        22 / 25 | FAIL   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/light  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--518e26d0.json                 |        22 / 23 | FAIL   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/dark   | 3c017796       | …04-epic-1567-control-actions · actions--94f6cf20.json                   |        20 / 20 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | portrait/light  | 3c017796       | …04-epic-1567-control-actions · actions--318f7e00.json                   |        19 / 19 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · ipad-device-web-actions.json               |        18 / 21 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--06d55dd3.json                   |        17 / 19 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--ceb1beaf.json                   |        17 / 22 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/dark  | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--8c895acb.json   |        17 / 22 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/light | ebc7673b       | …05-epic-1567-advanced-controls-certification · actions--43edce48.json   |        17 / 20 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/dark  | e5142fab       | …05-epic-1567-ipad-e514-control · actions--c59c94ce.json                 |        17 / 25 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/light | e5142fab       | …05-epic-1567-ipad-e514-control · actions--45390d94.json                 |        17 / 25 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/dark  | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--afbdde35.json     |        17 / 26 | PASS   | PASS  |
| with ink: PORTRAIT to LANDSCAPE rotation |        26 | landscape/light | e5142fab       | …05-epic-1567-landscape-retirement-controls · actions--14063514.json     |        17 / 25 | PASS   | PASS  |
