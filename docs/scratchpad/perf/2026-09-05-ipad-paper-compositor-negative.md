# Physical iPad paper-compositor rejection

The recovered physical iPad reproduced portrait/light ink rotation jank in a complete canonical
sweep of the current product. Pre-promoting the textured paper sheet did not improve it. The sole
candidate change, `will-change: transform` on `.paper-sheet`, was reverted; no product optimization
is retained from this experiment.

## Canonical control

The instrumented web build was produced cleanly at 141288da477011a82a3c23a880e0f4df236eee32. Its
product sources, build configuration and dependency inputs are unchanged at the experiment base
449ad14871b690bbceecae53bc9dc31f8576aad3. MobileSafari loaded
`/_app/immutable/entry/start.sGsT2PEz.js`; the served-build guard verified the local chunks.
Appium/XCUITest supplied trusted input on the physical iPad. The page was full-screen at 1024 × 1276
in portrait and 1366 × 934 in landscape. Launch, both rotations and Android input/rotation were
re-proved before this capture, reusing the existing WDA connection without restarting it.

All 48 applicable groups retained one warmup and three scored repeats, with valid activation in all
four samples per group. The coloring grid fit without scrolling, so that action was explicitly not
applicable. Forty-five groups passed. Each maximum below comes from that repeat's
`scoredActionFrameGaps`, not the pooled P95/P99/maximum:

| Canonical red                   | Three scored maxima (ms) | Post-action P95 (ms) |
| ------------------------------- | ------------------------ | -------------------- |
| Open Settings                   | 29 / 34 / 35             | 25                   |
| Close Settings                  | 21 / 21 / 21             | 21                   |
| With ink: portrait to landscape | 28 / 22 / 25             | 25                   |

Empty-clear landscape-to-portrait rotation has one unconfirmed maximum warning (35 / 33 / 29 ms),
not a red. Magic selection and disabling Advanced Controls are green at 17 / 17 / 17 ms. These
findings do not replace the authoritative four-row matrix or establish that other modes pass.

The ink-rotation maxima occupy the first fully post-resize frame. The paper-view DOM update comes
about 151–152 ms later; `engine.resize` reports 0 ms at the timer's precision and no canvas backing
mutations occur. This motivated a narrowly scoped compositor hypothesis, not a resize-engine
rewrite. The frame trace does not identify a specific GPU task.

## Bounded paired experiment

The focused control reproduced both ink-direction P95 reds. The candidate changed only the paper
sheet's compositor hint. Paper dimensions, texture, matrix, input mapping, resize debounce, undo and
export code were unchanged. ADR-0050 and ADR-0089's presentation semantics were preserved. The
action runner, in-page probe and scoring source files were byte-identical across arms. Both arms
used the same physical device, runtime, orientation/theme, action sequence and repeat count.

| Action                                            | Control maxima (ms) | Candidate maxima (ms) | Control readiness P50 / P95 (ms) | Candidate readiness P50 / P95 (ms) |
| ------------------------------------------------- | ------------------- | --------------------- | -------------------------------- | ---------------------------------- |
| clear drawing for blank rotation                  | 20 / 17 / 21        | 21 / 31 / 27          | 727 / 738                        | 716 / 731                          |
| empty after clear: PORTRAIT to LANDSCAPE rotation | 26 / 31 / 32        | 26 / 27 / 27          | 2656 / 2674                      | 2566 / 2607                        |
| undo clear after blank rotation                   | 17 / 17 / 17        | 17 / 20 / 18          | 332 / 334                        | 233 / 323                          |
| undo restored stroke after blank rotation         | 17 / 18 / 17        | 17 / 17 / 17          | 324 / 329                        | 325 / 326                          |
| clear restored drawing after blank rotation       | 18 / 24 / 24        | 25 / 17 / 17          | 718 / 720                        | 721 / 722                          |
| empty after clear: LANDSCAPE to PORTRAIT rotation | 20 / 18 / 21        | 22 / 23 / 22          | 2565 / 2662                      | 2656 / 2715                        |
| with ink: PORTRAIT to LANDSCAPE rotation          | 24 / 25 / 27        | 29 / 30 / 29          | 2580 / 2586                      | 2537 / 2627                        |
| with ink: LANDSCAPE to PORTRAIT rotation          | 23 / 23 / 23        | 23 / 26 / 25          | 2726 / 2730                      | 2690 / 2730                        |

Both ink directions remain red: candidate post-action P95 is 29 ms outbound and 25 ms returning,
versus 25 and 23 ms in the control. All eight groups retain valid activation in all four samples.
The remaining six groups pass in both arms. Readiness did not supply a compensating reason to keep
the hint; driver-observed readiness includes the native round trip and polling floor. The candidate
is rejected without a retry for a greener number or a full-mode certification attempt.

The existing three real-route rotation/undo Playwright checks and type checking passed with the
candidate. Control and treatment drawing screenshots were visually inspected and showed the same
paper, stroke and controls. Those checks cannot override the physical timing failure. The possible
persistent graphics-layer memory cost was not measured, and no such cost is accepted without a win.

## Provenance and retention

The candidate was a dirty build of 449ad14871b690bbceecae53bc9dc31f8576aad3 plus this exact patch:

```diff
--- a/web/src/lib/components/DrawingCanvas.svelte
+++ b/web/src/lib/components/DrawingCanvas.svelte
@@
     transform-origin: 0 0;
+    will-change: transform;
     z-index: 0;
```

Its entry was `/_app/immutable/entry/start.C_xXFV3O.js`, with served application-chunk digest
`22ac7b7f29540a7dedabd922133edd85728478cf4eadbc81161eefc1462c267b`. Its build provenance is
explicitly dirty and resolves to no certified product commit. It must not be promoted under the
unchanged base or folded into the final matrix. Its whole original JSON and patch remain in the
gitignored raw corpus `perf-profiles/epic-1567-september-resume/`.

| Raw path relative to that corpus            | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `ipad-recovered-canonical-pl/actions.json`  | `e3a93fe2ab1e58c95ed46cc7be8bb5d393a27799e236ada831fe0bb2074d1c59` |
| `ipad-paper-focused-control/actions.json`   | `0131127025503e98f5c2ed1fe13f4f981cb432a10da5cad873128693e556c8b4` |
| `ipad-paper-focused-treatment/actions.json` | `794482794bf082aef131899943296ed6eb55f55f701b185a28a9be59bb9209bf` |
| `ipad-paper-candidate.patch`                | `1062908bf6a84d079925d13c5b73aafb68bbb6e4ca45e34b1376fa1bac66c691` |

Both clean controls are retained whole through `keep-capture-evidence.mjs` under
`perf-profiles/evidence/2026-09-05-epic-1567-ipad-paper-control/`: `actions--9f43bfdf.json` is
canonical; `actions--5372bd09.json` is focused. The keep-all exception preserves the complete causal
comparison rather than selecting its best repeat. Every raw and staged source hash was unchanged
after promotion. Deep comparison verified whole measurement payloads after identifier redaction, and
the tracked copies contain no device identifiers. The index's null drawing-fidelity field is not the
action activation verdict: the action suites record their own four-of-four activation evidence.

This resolves the formerly unmeasured paper-sheet proposal as a negative result. The canonical
Settings and rotation reds remain open campaign work. No release-gate row, issue closure, or
performance threshold is changed.
