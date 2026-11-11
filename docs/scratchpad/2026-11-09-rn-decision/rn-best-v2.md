# RN best v2: memory, Undo and sound fixes added

2026-11-11 00:46 → 01:35 EST, Claude (lane rn-best-v2). Branch `claude/best-rn` (worktree
`.claude/worktrees/best-rn`, local only, never pushed), now at
`e703b8b79a08fbb4ff6301de0007e495e2c7f207`. Base: RN best v1
`09f06e86c174555e4c553da018179f488d90b0af` (frozen `427756f14` plus the fixes in
`best-versions.md`). Scripts, logs and key frames are in `rn-best-v2/` in the campaign scratch
folder.

## Commits added

| # | Commit on `claude/best-rn`                 | From                                                                       | What                                                                                                                         |
| - | ------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1 | `cc0485716bdb7c4452ee1ce877cad17d62b3baf0` | `claude/spike-rn-memory-settle` `c904b402606c87392dc736a6113559349b179033` | Ganesh purge of resources unused for 5 s, cache cap 96 MB (Android, Skia patch)                                              |
| 2 | `e1c106844a0ad8ea8f546be8766a0bea9970cdcb` | `3c75b425437a616bd1d220d03ed1d13a603c501b`                                 | Undo draws back per-commit 32 px tile snapshots instead of replaying the picture                                             |
| 3 | `a7de2f1f217401267d3a26f0e5e545a959473279` | `8ac70e17720f35087591c1aac86ed0d89c4bb5b8`                                 | Idle Ganesh purge 2 s after the last presented frame (Android, Skia patch)                                                   |
| 4 | `55e3a8b144c8e60537bb72e43180dddbb716cce3` | `2365845098ce40f389e0a1db9eabc7937a7d9b26`                                 | Allocator purge (`mallopt(M_PURGE_ALL)`) 2 s after the last Clear or Undo (Skia patch JSI global + `nativeHeapPurge.ts`)     |
| 5 | `af76f91d68834edd8888345d5547eee7f20f9fe4` | new                                                                        | Lint caps for the ported Undo (below)                                                                                        |
| 6 | `e703b8b79a08fbb4ff6301de0007e495e2c7f207` | new (`rn-sound.md` § Cause, Price)                                         | Sound ramp fix: `createNativeGain` (`src/platform/drawingAudio.ts`) re-anchors at the running volume and keeps its step time |

Commits 1–4 are the settle run's build (`rn-memory-bones.md` § Settle run): it removed frozen's leak
(post-Clear floors +13.5 → +0.93 MB/min, peak 926 → 527 MB) but failed its own fix gate on a ~200 MB
high-water mark held by the Hermes and native heaps ("bones"). They are in v2 as the best memory
state measured, not as a passed gate. The Undo and sound fixes passed theirs.

Against v1: 12 files, +846/−180. Against `427756f14`: source, patch and lockfile 22 files +923/−184;
tests 22 files +769/−284.

**Left out of `1ef1c80b8`** (the settle branch's instrumentation): its `.dev.mem` install ID, the
Hermes heap line in `perfProbe.native.ts` and the Ganesh `logResourceCache` counter. None of the
purges calls them. The purges' own one-line `SplotchMem` logs (`gpuIdlePurge`, `heapPurge`, once per
idle or per Clear/Undo burst) are part of commits 3 and 4 and stay. v2's Skia patch is the settle
tip's patch minus the counter, byte for byte otherwise.

## Conflicts and how they were resolved

| Where                            | Conflict                                                                                                                                                      | Resolution                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skia patch file, commits 1, 3, 4 | Each settle commit edits a patch that already holds `1ef1c80b8`'s counter, so its hunks do not apply without it                                               | Regenerated per commit (`rn-best-v2/bin/patchgen.zsh`): apply that commit's patch to the pristine package, strip the counter (and, for commit 1, its then-unused `<android/log.h>`), re-diff in the settle lane's `diff -u` format. Lockfile patch hash set to the file's sha256, as pnpm computes it                                                             |
| `pnpm-lock.yaml`, commit 4       | Patch hash lines                                                                                                                                              | Same: hash of the regenerated patch. `pnpm install --frozen-lockfile` accepted it and linked the patched package (`.modules.yaml` carries the new hash), then sat idle with no child process for 5 min (likely a network call the sandbox blocks) and was stopped; `node_modules` matches the RN tree's 729 top-level entries, and both builds compiled the patch |
| `useDrawingScreen.ts`, commit 4  | None in git (v1's hand-merged Clear changed the same function)                                                                                                | Checked by hand: every Clear in v1's merged `clearCurrentPicture` (guardrails and input-loss rules alike) ends in `clearSnapshot`, which now calls the purge. Both behaviours kept                                                                                                                                                                                |
| Undo port, commit 2              | Applied cleanly, but the spike code broke lint: `createInkScene` 165 real lines (cap 125), `native-incremental-ink.test.mjs` 617 (cap 500), 10 `prefer-const` | Commit 5: the checkpoint search, rewind and adopt check move to module scope; rebuild, rewind and Clear share one `settle` step; the 5 Undo tests move to `native-undo-tiles.test.mjs`, the cohort helpers to `native-ink-cohort-fixtures.mjs`. The 16 ink and Undo tests pass unchanged                                                                          |

## Sound ramp fix

Web Audio semantics, as in `drawingAudio.web.ts`: each `setVolume` sets the ramp's start to the
volume it has reached by now (computed from time, not from the last written step), and a pending 16
ms step is never cancelled, so steps keep landing while touch packets arrive every 8.4 ms. New test
in `tools/tests/native-audio-adapter.test.mjs`: `setVolume` every 8 ms for 1.2 s; asserts at least
half the target after one ramp (60 ms), the target at the end, never falling, and silence and no
timers after lift. **Negative control:** against v1's `drawingAudio.ts` the test fails ("expected 0
to be greater than or equal to 0.1"). The other 21 adapter tests and the 20 drawing-audio tests pass
unchanged.

## Sound gate on the Galaxy (rerun of the pre-registered counted set)

`rn-sound/bin/batch.zsh` unchanged, 01:06:52–01:17:11, holding the Galaxy and rig locks; scored with
the lane's unchanged `score.py` and `table.py`. Same counts as `rn-sound.md`: per RN arm 5 cold
launches, each followed by 5 warm strokes (5 cold + 25 warm), plus the four causal runs.
`art.splotch.app.dev.best` is now v2 (on-device APK sha256 = the built APK, uid unchanged at the one
`score.py` reads); `art.splotch.app.dev` is the frozen probe, the same-session control. Media volume
4 of 15 on the speaker, as in the first run; settings and brushes as found. The first run's raw
folder moved to `rn-sound/runs-v1-2026-11-10/` so the rerun could not mix with it.

**Pre-registered expectation** (`rn-sound.md` § Left): "0 of 60 never, latency ~122–282 ms". The
counted set holds 30 strokes per arm, and only one arm carries the fix, so the expectation applies
to v2's 30; the frozen arm's 30 are the control.

| Arm (counted set)                   | Strokes | Gate −70 dB (registered) | Gate −89 dB (declared in `rn-sound.md`)                                | Peak level, median (max) | Native volume writes per stroke (probe `audioVolume` n, median) |
| ----------------------------------- | ------- | ------------------------ | ---------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| **RN best v2**                      | 5 cold  | 5 never                  | **0 never**: 128, 133, 134, 134, 226 ms                                | −78 dB (−77)             | 51                                                              |
|                                     | 25 warm | 25 never                 | **0 never**: 122–186 ms, median 132; 4 at ≥150 ms (173, 175, 186, 186) | −78 dB (−76)             |                                                                 |
| Frozen RN (control)                 | 5 cold  | 5 never                  | 3 never, 2 at 132 and 180 ms                                           | −124 dB (−80)            | 147                                                             |
|                                     | 25 warm | 25 never                 | **25 never**                                                           | −126 dB (−117)           |                                                                 |
| v1 run, RN best v1 (for comparison) | 5 + 25  | 30 never                 | 29 never                                                               | −130 / −132 dB           | (142 per stroke, `rn-sound.md`)                                 |

All 30 v2 strokes: latency 122–226 ms, median 132 ms; 5 of 30 late (≥150 ms). **Gate: pass.** 0 of
30 never against an expected 0, and the range sits inside the expected 122–282 ms. The peak (−78 dB)
matches `rn-sound.md`'s computed full level at this volume (about −79 dB), so the sound now reaches
its level, not just the gate. The registered −70 dB gate still reads "never" for every stroke of
every arm, for the reason `rn-sound.md` gives: at media volume 4 of 15 no correct stroke can reach
−70 dB. The fix also cuts the native volume calls on the JavaScript thread from ~147 to ~51 per 1.2
s stroke, since writes now follow the 16 ms steps rather than every packet.

Causal runs in the same batch (−89 dB gate; one launch each):

| Run                                    | v2 result                                  | First run (`rn-sound.md`)           |
| -------------------------------------- | ------------------------------------------ | ----------------------------------- |
| 20 ms samples (v2)                     | 6 audible: 128–137 ms warm, 183 ms cold    | RN best v1: 122–282 ms              |
| 8 ms with a 150 ms hold at 600 ms (v2) | 6 audible: 130–229 ms, **before the hold** | RN best v1: 666–716 ms, in the hold |
| Strokes 1.5 s apart, output awake (v2) | 131 ms (first); **87, 88, 108 ms**         | RN best v1: 228; 128, 150, 169 ms   |
| 20 ms samples, frozen                  | 6 audible: 126–187 ms                      | 126–230 ms                          |

What remains is the Android output path `rn-sound.md` priced separately (ExoPlayer on Samsung's
deep-buffer output, 3 s standby): with the output already awake v2 sounds 87–108 ms after
touch-down, from standby ~122–135 ms, cold ~130–230 ms. Shipping's figure on this device is still
unmeasured (no witness for its MMAP stream).

## Checks at the v2 tip

`rn-best-v2/bin/rn-checks-locked.zsh` (best-versions' `rn-checks-locked.zsh` with lane log paths):
each npm script under its own `rig.lock` hold, 60 s apart, 01:17–01:23, at
`e703b8b79a08fbb4ff6301de0007e495e2c7f207`.

| Check                                  | v2                                                                                                   | v1 / frozen known state (`best-versions.md`)               | Verdict           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| `npm run check`                        | clean                                                                                                | clean                                                      | pass              |
| `npm run lint`                         | 0 errors, 3 warnings, all in files v2 does not touch                                                 | same 3 warnings                                            | pass              |
| `npm run test:unit`                    | 2,048 pass, 124 files                                                                                | 2,048 pass                                                 | pass              |
| `npm run test:tools`                   | 8,245 pass, 1 fail: the expired node-forge audit exception (GHSA-86w9-cpqp-85rv, expired 2026-11-05) | 8,237 pass, the same 1 fail, which the frozen build shares | pass (known fail) |
| `npm run test:migration:rsd-selection` | 1,051 pass, 84 files                                                                                 | 1,051 pass                                                 | pass              |

Before the full run: ESLint and Prettier clean on every touched file; the touched test files (native
audio adapter and drawing audio, 42; incremental ink and Undo tiles, 19; test placement) pass;
`pnpm install --frozen-lockfile` accepts the regenerated patch hash.

## Builds

Both probe Releases (`EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1`, build tag `e703b8b79`) with best-versions'
recipes (`rn-best-v2/bin/rn-android.zsh`, `rn-ios.zsh`: output folder changed to
`builds/best-rn-v2/`, so v1's artifacts stay in `builds/best-rn/`), each under `rig.lock` after
`disk-ok 30` (191 GB free). The uncommitted ID edits were reverted and the files `pod install`
touches restored; `claude/best-rn` is clean.

| Artifact (campaign scratch folder)                                                     | sha256                                                                        | Notes                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builds/best-rn-v2/app-release.apk`, Android probe Release, `art.splotch.app.dev.best` | `a95722f306a81f46bf8758681a0ded8dcde14c7aaec3d4519f2449b389395ca9`            | 01:00–01:02, 2 m 14 s, arm64, debug key; Gradle cleaned after. `librnskia.so` holds `SplotchPurgeNativeHeap`, `gpuIdlePurge`, `heapPurge` and no `gpuCache` counter; the bundle carries `e703b8b79`           |
| `builds/best-rn-v2/Splotch.app`, iOS probe Release device app, same ID                 | App binary `98d9fc005bea850fed4699d1e6134c8a65b8fc3a001d772092a3998a30ab66a0` | 01:24–01:26, shared derived data `builds/ios-dd-best-rn` (cleaned after), Apple Development signing. Not installed: the iPad is another lane's. The purges are Android-only; on iOS the JSI global is a no-op |

iPad install for the orchestrator:
`xcrun devicectl device install app --device <iPad UDID> $C/builds/best-rn-v2/Splotch.app`, then
launch `art.splotch.app.dev.best`.

## Galaxy install and smoke

Under `dev-galaxy.lock`, 01:03–01:05:47. `adb install -r` replaced `art.splotch.app.dev.best` (v1,
installed 2026-11-10 20:25) with v2, data and uid kept; the on-device `base.apk` hashes to the built
APK. The store app, `.dev`, `.dev.mem` and both shipping builds were not touched. The iPad was not
touched (another lane holds it); the orchestrator installs v2 there.

| Step                                        | Result                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold launch                                 | `am start -S -W` 325 ms, focus on `.dev.best`; blank page; brush as found (Crayon, Purple)                                                                   |
| 5 strokes (`input swipe`, 600 ms each)      | All 5 inked                                                                                                                                                  |
| Undo ×2 (0.6 s apart), then Undo            | 3 strokes, then 2; the right ones went                                                                                                                       |
| Clear (drag the bin), Undo, one more stroke | Page cleared; Undo of the Clear brought both strokes back; the new stroke inked beside them                                                                  |
| Clear                                       | Page left cleared, app force-stopped                                                                                                                         |
| Logs                                        | No crash (`AndroidRuntime`, `DEBUG`, `libc` empty). 5 `heapPurge` lines (1.8–3.1 ms each, off the JS thread) and 7 `gpuIdlePurge` lines (e.g. 13.2 → 8.7 MB) |

No visible regression. Key frames: `rn-best-v2/galaxy/{s-draw-undo,s-clear,s-08-end}.png` in the
campaign scratch folder. The sound batch then cold-launched v2 16 more times with no focus loss.
