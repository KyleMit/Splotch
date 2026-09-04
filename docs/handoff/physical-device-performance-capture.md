# Handoff — physical-device performance capture

> 2026-08-21 · branch `codex/performance-matrix-2026-08-20` · PR
> [#1191](https://github.com/KyleMit/Splotch/pull/1191) · Both physical-iPad rows are measured and
> the matrix is complete: every device target is measured. What remains is the performance work it
> surfaced, filed as issues, and one stacked PR already open.

## Objective & non-goals

The physical-iPad hole is closed: 38 of its 40 cells landed, the calibrated Safari release gate
exists for the first time, and every one of the 44 mode cells now carries drawing and undo. What is
left is small and specific — see *Risks & next 3 steps*.

**Non-goals:** do not recapture the 30 pinned modes (settled below — measured, not assumed), do not
rerun a valid red gate to turn it green, do not treat the native WebView row as the release gate (it
is `physical-native-advisory`; Safari is `physical-safari-gated`), and do not fix
[#1195](https://github.com/KyleMit/Splotch/issues/1195) by widening the allowance to any physical
iOS session — that breaks a deliberate iPhone exclusion.

## State

| Item             | Value                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Branch           | `codex/performance-matrix-2026-08-20` (pushed)                                     |
| PR               | [#1191](https://github.com/KyleMit/Splotch/pull/1191) (draft)                      |
| Product measured | `ce88c8e587ac45847c419e05ef7a79d282bc747a` for today's cells; the rest stay pinned |
| Coverage         | drawing 44/44 modes, undo 44/44, actions 40/44                                     |
| Release gate     | **exists and is red** — Safari fails all 16 drawing cells on render starvation     |

### Commits this session

| SHA          | What                                                        |
| ------------ | ----------------------------------------------------------- |
| c2bc13552a2d | Native iOS capture opened Safari, not the app bundle        |
| 2c5c61fa3965 | Campaign accepts only the transport a cell asked for        |
| a91406968311 | `perf:campaign:sources` folds a campaign into the manifest  |
| 897f2bc4d8b6 | Booted-simulator host load in the pre-flight                |
| ddbc49ee024e | `stayon usb` misses an AC-charging phone                    |
| 0c08b539c57e | First (wrong) CacheStorage fix — superseded                 |
| 76e6404c7a16 | Both physical iPad rows measured into the matrix            |
| 5b2f5f7c2d67 | CacheStorage: read registrations first, skip when no worker |
| 0abea743397a | Check a phone is unlocked before queueing landscape cells   |
| cd92b9c4d6fc | Settle whether the pinned rows need recapturing             |

Raw captures live in gitignored `perf-profiles/2026-08-21-physical-devices/`, **and were copied to
`/Users/kylemit/Code/Splotch/perf-profiles/`** so they survive this worktree. `sources.json` names
those paths, so the report cannot be regenerated without them.

## Decisions made

* **The 30 pinned modes stay pinned.** A fresh `mac-safari landscape-light` sweep at the newer
  commit matched the pinned result on all 50 labels within 5 ms, the three blank-rotation labels
  included. Measured, not reasoned about. The 100–106 ms those labels cost on the iPad is a
  device-size effect — `resizeCanvas()` over 4.7 Mpx versus a 1512×982 viewport.
* **The two blocked native landscape modes are recorded as partial**, not unavailable: they carry
  four scored brushes and an undo probe, and only the action sweep is missing.
* **Captured red gates were kept.** `open Settings` measured 22 ms against a 20 ms base gate and is
  recorded as failing; it would have passed the 26 ms allowance that
  [#1195](https://github.com/KyleMit/Splotch/issues/1195) makes unreachable. Re-running it to be
  re-scored is exactly what the campaign refuses to do.
* **Reverted:** widening `actionGateAllowances` to any physical iOS browser session. It breaks the
  tested `physical iPhone web` exclusion. Classifying by screen size also fails — an iPad mini is
  744 px wide, below the usual tablet breakpoints. Filed instead.
* **Reverted:** bounding CacheStorage with an in-page `setTimeout`. In that WebView a pending
  CacheStorage call stops async-script callbacks being delivered at all, timers included, so the
  deadline is the thing being wedged.
* The booted iPad Simulator was left running for the whole session rather than shut down mid-target,
  and cadence held at 114–118 moves/sec across all 32 physical drawing cells, which is the evidence
  that host load stayed out of the measurement.

## Unverified assumptions

* That the Safari starvation result is a product characteristic rather than something about the LAN
  preview transport. It reproduced across 16 cells and 4 modes, but never against a differently
  served build.
* That `screencap` returning a constant black frame on the Samsung is only a secure-window
  restriction. It was never seen to return a real frame, even unlocked.
* That the concurrent-campaign slip did not affect the kept `android-device-web landscape-light`
  cell. It was captured before the overlap; the overlapping native attempt was discarded.

## Done & verified

* `ipad-device-web` 20/20 cells, every one on attempt 1. Full input fidelity **PASS** — all five
  checks including `coalescing`, which the native WebView cannot satisfy.
* `ipad-device-native` 18/20; the 2 gaps are
  [#1194](https://github.com/KyleMit/Splotch/issues/1194).
* All 44 undo probes pass, including 8 new physical ones.
* The iOS RemoteXPC tunnel works, and the way to answer its password prompt without a terminal is in
  `docs/PROFILING-IPAD.md`.
* Green: perf tests (339), `npm run lint`, `npm run format:check`, `npm run ruler:check`, `npm run
  scrapbook:check`.
* Full tools tier on a quiet host: **2,312 pass**. The single mid-session failure under
  device-capture load does not reproduce. `npm run lint`, `format:check`, `ruler:check`,
  `check:skill-refs`, `scrapbook:check` all green.

## Risks & next 3 steps

1. **Continue the stack.** [#1200](https://github.com/KyleMit/Splotch/pull/1200) is open on
   [#1195](https://github.com/KyleMit/Splotch/issues/1195), stacked on this PR because it edits a
   file this PR rewrites. The product issues —
   [#1196](https://github.com/KyleMit/Splotch/issues/1196),
   [#1197](https://github.com/KyleMit/Splotch/issues/1197),
   [#1198](https://github.com/KyleMit/Splotch/issues/1198),
   [#1199](https://github.com/KyleMit/Splotch/issues/1199) — branch from `main`, so they are not
   held behind an unmerged matrix PR.
2. **Decide what the red release gate means.** Safari fails all 16 drawing cells on render
   starvation alone (2.4–5.4% of in-contact frame time against a 1% budget) while every paint gate
   passes; the native WebView loses under 1% on pen, magic and eraser. Crayon is worst on both and
   the only native failure. This is the ADR-0090 decision the matrix existed to enable, and it is a
   product question, not a harness one.
3. **[#1194](https://github.com/KyleMit/Splotch/issues/1194) has a lead, not a fix.** Synthetic
   input restores correctly; only trusted input fails. The suspect is the `activePointers.size === 0
   && !penStreamAdopter.hasCanvasExit()` gate in `undo()`, which silently skips the paper restore.
   `hasCanvasExit()` is pen-only and these sweeps are touch, so instrument `activePointers.size` at
   the top of `undo()` and rerun one landscape sweep — two lines, and it confirms or kills the
   hypothesis. Do not guess past that.

## Reread first

* `.agents/skills/capture-performance-matrix/SKILL.md` and `references/platforms.md` — six host
  conditions were added today; the locked-phone and CacheStorage ones are the expensive ones
* `docs/PROFILING-IPAD.md` — the RemoteXPC tunnel section
* [#1194](https://github.com/KyleMit/Splotch/issues/1194),
  [#1195](https://github.com/KyleMit/Splotch/issues/1195)
* `tools/perf/campaign-sources.mjs`, `tools/perf/run-campaign.mjs`
* `scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json`
