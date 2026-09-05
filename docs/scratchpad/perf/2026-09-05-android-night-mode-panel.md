# Android Night Mode: background Action Panel transitions

The complete Android-web landscape/light control at product d92ba50b9440938d84e82d9f13cb2423963fc71c
passed 34 of 35 groups. Compact Night Mode activation was red again after an earlier passing
control: its scored-repeat maxima were 33.3 / 33.3 / 33.3 ms and its scored P95 was 33.3 ms. This
control is retained in `perf-profiles/evidence/2026-09-05-epic-1567-settings-shell-reviewed/`.

## Bounded treatment and result

The Action Panel inherits a zero base transition duration while Settings is open, except during its
visible button-size preview. This removes theme crossfades from the inactive background panel; it
preserves the visible Settings controls' animations, ordinary panel interactions, and the size
preview. The accepted drawer-motion treatment remains in place.

The provisional treatment was a9438fc73fbe80dd7afc734d9924d8611671fe14 plus the saved
`night-mode-panel-transitions.patch`, not a clean capture of that SHA. There are no product or
capture-code differences between d92ba50b9440938d84e82d9f13cb2423963fc71c and that base; the
intervening commits contain evidence, documentation, and tests. The full action plan, repeat count,
orientation, theme, transport, and refresh pin were unchanged.

The first full treatment sweep passed 35 of 35 groups, with no unconfirmed maximum warnings. Every
group had three scored repeats after one warmup and valid activation in all four samples.

| Action                     | Control scored-repeat maxima (ms) | Provisional treatment maxima (ms) |
| -------------------------- | --------------------------------- | --------------------------------- |
| Enable compact Night Mode  | 33.3 / 33.3 / 33.3                | 16.8 / 33.3 / 16.8                |
| Disable compact Night Mode | 16.7 / 16.7 / 16.7                | 16.8 / 16.8 / 33.4                |
| Open Settings              | 16.8 / 16.8 / 16.7                | 33.3 / 16.8 / 17.0                |
| Idle control               | 16.8 / 16.8 / 16.8                | 16.8 / 16.7 / 16.8                |

Night Mode activation's scored P95 was 16.8 ms. All four rotation groups passed. These maxima come
from each repeat's `scoredActionFrameGaps`; pooled percentiles are not treated as repeats. The
passing result does not erase the borderline control history or certify the final matrix.

## Matched attribution diagnostics and limits

Separate `idle,theme` traces used four repeats in the same landscape/light mode. Each scored Night
Mode activation recorded 51 transition-start events in control and 20 with the treatment. The trace
supports removal of transition work, not a claim that initial theme recalculation vanished: its
largest immediate style recalculations covered 278 elements in both arms and took 21.035 / 16.429 /
14.660 ms in control versus 19.371 / 17.167 / 14.766 ms in treatment. Nested trace events are not
additive wall time.

The control diagnostic failed Settings opening, Night Mode enabling, and Night Mode disabling. The
treatment diagnostic still failed Night Mode's first-frame gate: 42.0 / 36.9 / 26.6 ms, versus
control 42.5 / 22.0 / 37.4 ms. Its scored post-action maxima were 16.7 / 16.7 / 16.8 ms; that does
not make the first-frame failure pass. Other treatment diagnostic groups passed. Both diagnostics
remain separate from the full untraced certification plan.

## Provenance and verification

Raw root: `perf-profiles/epic-1567-september-resume/`. The clean attribution control at
a9438fc73fbe80dd7afc734d9924d8611671fe14 was promoted through the keeper to
`perf-profiles/evidence/2026-09-05-epic-1567-night-mode-control-trace/`. Its index identifies the
source. Provisional treatment artifacts remain local until clean committed certification.

| Raw source beneath study root                                                               | SHA-256                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `settings-shell-reviewed-treatment/android-device-web/landscape-light/actions/actions.json` | `dea91f7eb88ff1f4473300377cdfa92377a2cc25af8affb03b11110703a33e3e` |
| `night-mode-control-trace/actions.json`                                                     | `64b6e11e57761e4de594ea878331f009f7c44fbe8b5696b4049f739e0d55787b` |
| `night-mode-control-trace/trace.json`                                                       | `276d43e69b1c3b8113285cb34776a1cb61eef66e650ac3ba0dcd52d1e2cb57c0` |
| `night-mode-panel-treatment/android-device-web/landscape-light/actions/actions.json`        | `c4d3fbbbde82307f3629e27f6f922a3acc0a9dda6d70a69b34048bce34fe6d4a` |
| `night-mode-panel-treatment/trace/actions.json`                                             | `b985a3b54716bed3fa2bcde834529e27476bd39e2c4654748dcec52bf9373ca7` |
| `night-mode-panel-treatment/trace/trace.json`                                               | `a44c33bdfd8f0c804603a880ee366e2d41ae3730a7ea670aba7f2ce7ef4f8415` |
| `night-mode-panel-transitions.patch`                                                        | `1f868bb3fd3221c4dce7e6032aaefc5c263e83ce4541de48a892ede7cf2549fa` |

All seven source hashes were unchanged after promotion; retained files passed identifier scans. Six
focused browser tests, type checking, and targeted lint passed. The new tests observe real
transition events during Night Mode activation and preserve transition timing during the live size
preview and after Settings closes. Clean committed certification follows below. Two rival review
rounds and green CI remain required. The authoritative four-row matrix is unchanged.

## Clean committed certification

Product 141288da477011a82a3c23a880e0f4df236eee32 passed all 35 action groups on its first complete
landscape/light certification, with three scored repeats after one warmup, valid activation in every
sample, and no unconfirmed maximum warnings. Night Mode enable maxima were 16.7 / 33.3 / 16.8 ms
(scored P95 16.9 ms); disable and Settings-open maxima were each 16.8 / 16.8 / 16.8 ms. Idle control
was 16.8 / 16.8 / 16.8 ms.

| Rotation                          | First frames (ms) | Scored-repeat maxima (ms) |
| --------------------------------- | ----------------- | ------------------------- |
| Empty-clear landscape to portrait | 2.2 / 3.2 / 2.1   | 16.8 / 16.7 / 16.8        |
| Empty-clear portrait to landscape | 12.7 / 13.1 / 3.1 | 16.8 / 16.8 / 16.8        |
| Inked landscape to portrait       | 8.3 / 8.9 / 8.7   | 16.8 / 16.8 / 16.8        |
| Inked portrait to landscape       | 14.4 / 4.9 / 3.9  | 16.7 / 16.8 / 16.7        |

The control and this capture have identical action groups, repeats, mode, transport, activation
configuration, refresh pin, and complete action-plan metadata. The clean build provenance recorded
this product commit with `dirty: false`. The keeper retained the whole capture in
`perf-profiles/evidence/2026-09-05-epic-1567-night-mode-committed/`; its index maps the source
`night-mode-committed-treatment/android-device-web/landscape-light/actions/actions.json` beneath the
raw root. Its SHA-256 is `29847e4483d3a78add3ed9e87e5d68d55ffb0eb9246c9ccf6f38be23914fa012`. All
eight study source hashes were unchanged after promotion, and retained files passed identifier
scans. This focused mode does not replace the final four-row physical matrix. Rival reviews and CI
remain required before the next branch.
