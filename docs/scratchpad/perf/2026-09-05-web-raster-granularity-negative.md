# Rejected web per-move raster batching

The first faithful physical iPad portrait/light pen treatment did not improve its paired control.
Lost-frame share was 1.41% with per-move batching versus 1.36% with the shipping per-frame batching.
Both fail the unchanged 1% gate. The candidate was reverted, with no retry for a better number and
no product change accepted.

## Hypothesis and bounded change

The complete [four-mode iPad web control](2026-09-05-ipad-web-e514-control.md) found ten
lost-frame-share drawing reds while crayon alone passed all four modes. Crayon already uses per-move
web batching under ADR-0146. A possible larger dirty region or tile set for merged pen paths
motivated one bounded test. This correlation did not establish the mechanism, and the measured
result does not justify generalizing crayon's batching choice to other brushes.

The sole candidate change was:

```diff
--- a/web/src/lib/drawing/strokeRasterQueue.ts
+++ b/web/src/lib/drawing/strokeRasterQueue.ts
@@
-      if (ps.crayon && !ps.erase && deps.crayonOpGranularity === 'per-move') {
+      if (deps.crayonOpGranularity === 'per-move') {
```

The existing animation-frame flush, input points, and native per-frame branch were retained. The
temporary candidate deliberately used the existing dependency name; it was not accepted as a generic
API. All eleven focused engine undo/eraser Playwright checks passed, and the real-route screenshot
showed a continuous pen stroke. These checks establish limited correctness, not complete pixel
parity across all brushes or a physical performance win. Broader parity and cross-runtime acceptance
were not claimed after the representative failed.

## Same-session physical pair

Both captures used the same physical iPad, MobileSafari, portrait/light mode, Appium/XCUITest
runner, ten gesture repeats, and ten undo operations. Both passed trusted-touch, cadence, pressure,
and contact-geometry fidelity. No thresholds or input geometry changed. The control and treatment
were consecutive captures after the four-mode sweep; that sweep's first portrait/light pen red
(1.37%) remains preserved separately.

| Measurement                         | Clean control | Dirty candidate |
| ----------------------------------- | ------------- | --------------- |
| Paint P95 / P99 / max (ms)          | 16 / 23 / 39  | 16 / 23 / 41    |
| Lost-frame share                    | 1.36%         | 1.41%           |
| Drawing verdict                     | RED           | RED             |
| Undo count                          | 10            | 10              |
| Undo engine P95 / max (ms, rounded) | 1 / 1         | 1 / 1           |
| Undo next-frame P95 / max (ms)      | 12 / 12       | 12 / 12         |
| Undo verdict                        | PASS          | PASS            |

The difference is not asserted to be a statistically established regression. It is a failure to
demonstrate the required representative improvement, sufficient to reject this bounded candidate. No
other mode or brush was certified under it. The ten control drawing reds remain explicit campaign
work or preserved failures; this experiment does not make them green.

## Provenance

The control is the clean e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 web build, entry
`/_app/immutable/entry/start.DvQTVCP7.js`, application-chunk digest
`ce9061b0ae81007d8e03a83eb04830a465297dd0ed44ef0f1b0688d4d239d853`.

The candidate was an instrumented dirty build at the same base with the exact patch above. Entry
`/_app/immutable/entry/start.CMuzHJCj.js`, application-chunk digest
`e72285f7ab6eb8dae83c88141cc2374eb09c34d8c7d803630d7efcd0a1e21797`. The served-build guard resolved
no certified product commit for that dirty build. It is not promoted under the clean base or folded
into the authoritative matrix. Reverting the source does not retroactively change those served bytes
or their provenance.

The original raw captures remain under `perf-profiles/epic-1567-raster-granularity/` in their
respective control and isolated candidate worktrees. The full 843-byte patch is retained locally at
`/tmp/splotch-1567-raster-granularity-candidate.patch`; the experiment receipt is
`/tmp/splotch-1567-raster-granularity-study.json`. The patch's SHA-256 covers the default-context
output of `git diff -- web/src/lib/drawing/strokeRasterQueue.ts` after applying the one-line edit
above to the clean base, including the Git/index headers, numbered hunk header, and context. It is
not the hash of the abbreviated display block. Reapplying that exact edit at
e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 and hashing that default diff reproduces the table's patch
hash after the temporary files are gone.

| Raw artifact                     | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `control/pen-real-screen.json`   | `9486546e3747fe521b1e96db6d3503392b3bfe911ed2f83bb985d526509119a6` |
| `treatment/pen-real-screen.json` | `e58da4c80d16ba1a3c8ced53631ce78a00e4cda6b767c59be38810593a23c0ae` |
| Candidate patch                  | `acaad17224041a223c716aa87903bb51a876572447141db8b49defc275102b35` |

The whole clean control was promoted through
`keep-capture-evidence.mjs --target=ipad-device-web --keep-all` into
`perf-profiles/evidence/2026-09-05-epic-1567-raster-control/`; its index identifies the raw source.
The keeper's passing-capture count refers to fidelity, not the failed drawing gate. Source hashes
remain unchanged, and deep comparison verifies that the kept copy differs only by device-identifier
redaction. The candidate remains raw local negative evidence with its dirty build binding and patch
hash. No release-gate row, issue closure, or threshold changed.
