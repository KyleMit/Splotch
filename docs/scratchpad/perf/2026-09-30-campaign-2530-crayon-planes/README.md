# Campaign 2530: proposed crayon planes retirement

**Implementation held.** The retirement decision has a handler/rival winner, but the candidate must
not merge: Chromium crayon draw time increased in both candidate arms. These observations do not
identify a cause. No JIT, device speed or improvement claim follows from them.

## Scope and provenance

Baseline commit: 7863e1dd275814b05d40944e218de563ee50ea81. The same installed checkout ran
baseline/candidate/baseline/candidate sequentially. Baseline source bytes were restored from that
commit; the saved candidate patch was applied between arms. `source-hashes.json` pins the exact
sources measured. ADR text changed after measurement and did not affect the executable candidate.
`instrument-hashes.json` pins relevant unchanged harness sources; no instrument change was accepted.
`run-settings.json` contains settings verified equal across the four arms within each engine.

The orchestrator paused other local heavy work. The atomic campaign perf-lock reserved this window;
per-arm start/end host-load samples are retained, with ten CPU cores and the repository threshold of
0.5 load per core. Brackets include builds and are advisory snapshots, not continuous CPU proof.
Each fresh Chromium arm rebuilt the instrumented preview; WebKit reused that arm's build. The
preview freshness gate checked the served build against the current source. Shared origin/main moved
when an unrelated PR merged; the measured checkout HEAD remained fixed.

## Measurements

Each arm ran these commands on its corresponding source bytes:

```sh
npm run perf:web:undo -- --port=5300 --scenarios=crayon-scribbles,multi-finger --no-throttle
npm run perf:web:undo:webkit -- --port=5300 --scenarios=crayon-scribbles,multi-finger --no-build
```

The runner uses the real production drawing engine through the dev-engine harness. It records
headless host compute, with synthetic synchronous gestures; it does not certify presentation,
physical iPad/Android or native milliseconds. The multi-finger scenario is a **pen** control, not
multi-pointer crayon. The crayon scenario has 22 gestures and 1200 operations per gesture. Raw JSON
retains each duration, commit/undo measures, settle samples, raster geometry and harness settings.
All arms had identical stroke counts and history raster/debug counts for each scenario.

| Arm         | Chromium crayon total / median ms | WebKit crayon total / median ms | Chromium pen control total ms | WebKit pen control total ms |
| ----------- | --------------------------------- | ------------------------------- | ----------------------------- | --------------------------- |
| Baseline 1  | 2952.7 / 135.70                   | 1702 / 5.5                      | 117.4                         | 35                          |
| Candidate 1 | 3632.1 / 166.50                   | 1693 / 6.0                      | 126.1                         | 36                          |
| Baseline 2  | 2982.9 / 136.85                   | 1954 / 6.0                      | 108.9                         | 32                          |
| Candidate 2 | 3195.3 / 144.95                   | 1684 / 6.0                      | 114.4                         | 37                          |

Chromium candidate totals exceed the adjacent baselines by approximately 23% and 7%. Two pairs
support a hold, not a causal performance diagnosis. WebKit's large tail measures mean its median
alone cannot summarize total work. These numbers do not justify a native claim or a relaxed gate.

## Release builds and appearance

Uninstrumented `npm run build` and `npm run build:cap` passed on both sources before captures. Web
startup modulepreloads stayed 40; startup JS/CSS was 454115 to 453340 bytes (−775). Native
modulepreloads stayed 28; the complete static export was 6076971 to 6076192 bytes (−779), with 236
files on each source. Native bytes are total export, not startup-only. Raw accounting JSON is here;
full build stdout and trace packages remain with the campaign operator.

`base-pixels.json` and `candidate-pixels.json` match within each engine for a nonblank crayon
fixture, 1788800 RGBA bytes at viewport 1024×1366 and scale 1. The fixture explicitly resizes the
engine, uses width 36, yellow horizontal and blue repeated vertical strokes (41 points each), then a
two-pointer crossing fixture, and reads `(120,80,520,860)`. It asserts both overall nontransparent
pixels and nonzero sampled alpha before hashing. Chromium and WebKit hashes differ from each other;
only within-engine parity is claimed. `rejected-blank-pixels.json` is **invalid and rejected**: the
initial fixture missed explicit canvas resize and returned a zero array. It is retained to make the
validity failure visible and cannot support parity.

## Decision and next step

Retire the unsupported planes mode while preserving restamp, glaze-direct, canvas topology, context
attributes, live registration, coefficients and surface APIs. B5 (remove unused modes), B3 (enforce
the finite supported union) and B2 (maintenance cost) choose it. The delegated Claude rival agreed
after one reconciliation. The decision is locked; this implementation is held.

A next causal experiment should split the deletion into isolated branch/member/bounds-clear changes,
measure each under the same lock and interleaved settings, and add actual multi-pointer crayon.
Preserve assertions and workloads. Restore the saved baseline if retiring the mode requires
unacceptable cost; never change unrelated production behavior to make this cleanup pass.

Reversal: recover the exclusive mode/tests from the baseline commit and amend ADR-0148. Production
restamp/glaze-direct selections and coefficients are outside the retirement decision.
