<!-- Preserved as written during the 2026-09-18 session; only this provenance note is added. -->

> **When each section applied.** The five criteria were written after the one-run harness smoke test
> (a control run, [`raw/smoke/`](raw/smoke/)) and before any result of the initial series was read.
> The initial series ran 2026-09-18 22:37–23:03 UTC. They govern the initial series. The
> **Confirmation series** section was appended after rival round 1
> ([`review/rival-round1.md`](review/rival-round1.md)) and before the confirmation series ran
> (23:30–23:54 UTC). Its two-run exception rule covers only draw, settle, tail, and commit in the
> confirmation series. It is not applied back to the initial series, and it never covered fold
> totals.

# Native validation of PR 2070: acceptance criteria (fixed before reading results)

Sources: #1750 done-when, PR 2070's validation leftover item 3, ADR-0086 undo gates,
`ACTION_FRAME_MAX_GATE_MS` (tools/perf/lib/action-stats.mjs, 33.5 ms).

Arms: control 7a2365631aba (PR 2070's parent), treatment 33a4d43b6ef8 (merged main). The product
diff is `web/src/lib/drawing/inkMotion.ts` only. Both arms are bundled perf builds
(`perf:build:cap`), Debug native shell, installed over the same bundle id, and delivered from
`capacitor://localhost` (no `server.url`).

Validation is **satisfied** when all of these hold:

1. **Correctness.** Every run completes 20 of 20 undos, each with its own `engine.undo` measure and
   a visible ghost. History goes from 20 retained snapshots to 0, and no ghost element survives the
   tail. In the separate pixel-check runs, ghost and tile hashes agree between arms wherever the
   pre-undo tile state matches. Divergence also seen control-vs-control is pre-existing, not the
   fix.
2. **No regression on undo frames.** Treatment's per-run count of undo windows whose worst complete
   rAF interval exceeds 33.5 ms, and its worst undo window, are no worse than control's across the
   interleaved runs.
3. **ADR-0086 undo gates** on the treatment: `engine.undo` P95 ≤ 20 ms, action-to-next-frame P95 ≤
   33 ms, action-to-next-frame max ≤ 50 ms. A control breach is reported as the pre-existing
   residual.
4. **No cost relocation.** Draw, present, settle (fold), and tail phases show no treatment-only
   increase in over-gate frames, worst frame, or late excess beyond control's run-to-run spread. The
   same applies to commit P95 and max and to fold totals.
5. **Memory.** Retained snapshot and raster bytes, base rasters, and live backing bytes are
   identical between arms.

Improvement is not required: a neutral result that preserves correctness satisfies the validation.
"Inconclusive" means the arms overlap so much, or the controls are so unstable, that criterion 2
cannot be judged.

## Confirmation series (pre-registered 2026-09-18 after rival round 1, before running)

Design: four blocks in order C, T, T, C. Each block forces a reinstall, runs one unscored warmup,
then two scored runs, giving 4 scored runs per arm. Same payload, driver, and analyzer. App-tree and
`public/` digests are recorded in `digests.txt`.

Criterion 4 is judged on this series alone: per run, the draw, settle (measured to the first undo's
call, so the first undo's boundary frame is excluded), and tail max-frame. A treatment exception is
a scored-run value above control's maximum over its 4 scored runs plus one 60 Hz beat (17 ms),
counted as an exception only if it occurs in 2 or more treatment runs. Commit max and P95 get the
same test with a 3 ms tolerance. Undo is also rescored per undo on non-overlapping windows running
from one undo call to the next. Pre-existing criteria 1, 2, 3 and 5 are re-checked on this series.
