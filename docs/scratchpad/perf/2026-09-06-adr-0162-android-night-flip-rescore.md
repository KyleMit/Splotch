# ADR-0162 allowance rescore over the committed Android web action evidence

Desk rescore from committed evidence only; no device time. Every `android-device-web` action capture
under `perf-profiles/evidence/` whose `index.json` files it as such was re-summarized twice through
the shipped scorer (`tools/perf/lib/action-stats.mjs`, `summarizeActions`): once on the base gates
the Android CDP runner records, once under the ADR-0162 ledger. Only the two compact-shell Night
Mode actions are listed — the covered `disable` direction and, for contrast, the uncovered `enable`
direction, which the ledger does not touch. The compact shell is offered in the landscape modes
only, so every reading is landscape. Every figure is the scorer's own pooled post-action P95 / max
over the three scored repeats.

The published matrix could not be regenerated to carry this diff itself, for the reason ADR-0160's
rescore note already recorded: its physical rows are built from
`perf-profiles/epic-1567-final-9af487b3/`, a gitignored raw corpus no checkout holds any more, and
`npm run gen:performance-matrix` fails with `ENOENT` on its first source. The published
landscape/dark cell already reads PASS at 9af487b3 (its row capture is the `final-control` reading
below), so the regeneration at the android-device-native fold (issue 1563) will add this allowance's
provenance to the two landscape cells rather than flip a verdict; the e5142fab red flips there. This
note is the record until then.

Sizing rule: one 0.1 ms clock quantum above the worst committed single capture of the cell (the
Chrome probe's rAF resolution; ADR-0137's worst-single-capture rule as ADR-0160 applied it), which
is the 33.5 ms max gate itself. Result for the covered action: 13 readings, 3 flipped from FAIL to
PASS, none still red. The `enable` direction's two base-gate failures are unchanged by design: the
d92ba50b reading is a two-beat P95 and the a9438fc7 reading is a first-frame P95 of 42.5 ms under
tracing overhead (its post-action P95 is 16.8).

| Action                                  | Allowance | Mode            | Product commit | Corpus                                                          | P95 / max (ms) | Before | After |
| --------------------------------------- | --------: | --------------- | -------------- | --------------------------------------------------------------- | -------------: | ------ | ----- |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--40783bc1.json    |    33.4 / 33.4 | FAIL   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/light | a9438fc7       | …05-epic-1567-night-mode-control-trace · actions--765c6c3e.json |    33.3 / 33.4 | FAIL   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | e5142fab       | …06-epic-1567-android-device-web-e514 · actions--fc8962c0.json  |    33.3 / 33.3 | FAIL   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--fc8962c0.json          |    17.1 / 33.4 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--adaa37e7.json    |    16.8 / 33.4 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--5a6b4df3.json    |    16.8 / 16.9 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/light | e5142fab       | …06-epic-1567-android-device-web-e514 · actions--8ec8a1aa.json  |    16.8 / 16.8 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--171cb4ba.json    |    16.8 / 16.8 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--8ec8a1aa.json          |    16.8 / 16.8 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/light | 141288da       | …05-epic-1567-night-mode-committed · actions--8ec8a1aa.json     |    16.8 / 16.8 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/light | 1496e4d7       | …05-epic-1567-android-rotation-control · actions--8ec8a1aa.json |    16.7 / 33.3 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · android-device-web-actions.json   |    16.7 / 33.3 | PASS   | PASS  |
| disable Night Mode in the compact shell |      33.5 | landscape/light | d92ba50b       | …05-epic-1567-settings-shell-reviewed · actions--8ec8a1aa.json  |    16.7 / 16.7 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/light | d92ba50b       | …05-epic-1567-settings-shell-reviewed · actions--8ec8a1aa.json  |    33.3 / 33.3 | FAIL   | FAIL  |
| enable Night Mode in the compact shell  |        20 | landscape/light | 141288da       | …05-epic-1567-night-mode-committed · actions--8ec8a1aa.json     |    16.9 / 33.3 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/light | e5142fab       | …06-epic-1567-android-device-web-e514 · actions--8ec8a1aa.json  |    16.8 / 33.7 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--40783bc1.json    |    16.8 / 33.4 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--171cb4ba.json    |    16.8 / 33.4 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/light | 1496e4d7       | …05-epic-1567-android-rotation-control · actions--8ec8a1aa.json |    16.8 / 33.3 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/light | a9438fc7       | …05-epic-1567-night-mode-control-trace · actions--765c6c3e.json |    16.8 / 33.3 | FAIL   | FAIL  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--5a6b4df3.json    |    16.8 / 16.9 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | 3c017796       | …04-epic-1567-control-actions · actions--fc8962c0.json          |    16.8 / 16.8 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | e5142fab       | …06-epic-1567-android-device-web-e514 · actions--fc8962c0.json  |    16.8 / 16.8 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/light | 3c017796       | …04-epic-1567-control-actions · actions--8ec8a1aa.json          |    16.7 / 33.4 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | 9af487b3       | …05-epic-1567-final-control · android-device-web-actions.json   |    16.7 / 16.8 | PASS   | PASS  |
| enable Night Mode in the compact shell  |        20 | landscape/dark  | f42d0994       | …06-issue-1696-android-night-toggle · actions--adaa37e7.json    |    16.7 / 16.8 | PASS   | PASS  |
