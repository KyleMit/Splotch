# shippingVNext progress

Branch `shippingVNext` off `origin/main` @ 30b2968faa7d, draft PR 3227 into `main`. **Never merge**:
the owner merges after the RN decision's last test (the iPad film session). Campaign evidence lives
on `origin/claude/rn-decision-2026-11` under `docs/scratchpad/2026-11-09-rn-decision/`; this branch
only cherry-picks from the campaign's branches and touches no physical device.

Each row records the commit, the gate it passed, and what is still unverified, so a later session
can resume from here.

## Working rules this branch follows

* Heavy host work (Playwright batches, native builds, emulators) runs under the campaign's rig lock
  (`rig.lock` in the campaign scratch folder named by its `RIG.md`), with the 60 s fairness gap.
* The physical Galaxy stays attached over USB during this work. Every adb call names the emulator
  serial, and `ANDROID_SERIAL` is set to it as a second guard.
* Force-pushing this branch is refused by the session's permission mode, so commits are amended only
  before they are pushed. The renderer-gone commit's message paraphrases Chromium's log line; the
  exact line is "Render process (pid) kill (OOM or update) wasn't handed by all associated webviews,
  killing application."

## 1. Shipping fixes from the campaign

| Item                                                    | Commit(s)    | Gate                                                                                                                                                                                                                              | Unverified                                                                                                                                          |
| ------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closing half-chord when a stroke lifts                  | 86f39ba2b342 | `npm run check`, `npm run lint`, drawing + design Vitest (71 files, 851 tests)                                                                                                                                                    | Real fingers on the iPad (campaign gated 0 cuts in 70 lines on the simulator)                                                                       |
| Drop WebKit's repeated pointermove                      | 935c108054e0 | as above                                                                                                                                                                                                                          | Real-finger start hook on the iPad                                                                                                                  |
| UIScene life cycle (iOS 27 SDK)                         | a84518e6e26f | as above                                                                                                                                                                                                                          | iOS 27 simulator build and launch (with the Capacitor step); invite deep links cold and warm, rotation lock, pause/resume, background pack download |
| Hide Choose folder in the native shells                 | dbd5121dac57 | as above                                                                                                                                                                                                                          | none beyond CI                                                                                                                                      |
| Landscape palette keeps the custom swatch on the 12.9"  | 2449a4e9db8a | palette, picker, toolbar and safe-area E2E: 187 passed                                                                                                                                                                            | Real 12.9" iPad look                                                                                                                                |
| Issue 2868: every swatch above the bottom inset (spec)  | 15be9246fd93 | new assertion fails 8 iPad landscape cases on the pre-fix palette (negative control), passes with it                                                                                                                              | none                                                                                                                                                |
| Export replay in a CPU worker (bent strokes after Save) | bbd1c390606d | gate spec at 3×: Chromium byte-identical (3 repeats), WebKit 0.38% / mean 0.34, Firefox (2×) identical; the spike's 2× tile route fails it at 1.36%; 4,454 unit, 7,096 tool, 101 export/engine E2E; both builds and startup gates | Galaxy `stall-ink` S/C rerun; 200-export ANR soak; iPad worker compose on CPU surfaces (frame bound, preview, PNG time, memory)                     |
| Audio context parks when idle or Sound is off           | b4ea86cea381 | new park tests (idle-park case fails without the stop-time park); audio + settings Vitest 109                                                                                                                                     | iPad audio output and Galaxy CPU actually drop; first sound's latency after a resume                                                                |
| Sound after an iPadOS audio-server restart              | 775fa4c689b5 | ambient-declaration and replacement tests fail without their lines                                                                                                                                                                | A real audio-server restart on the iPad                                                                                                             |
| Renderer-gone handler, manifest `configChanges`         | 0a33f9a7e3cb | API 36 emulator: fix keeps the stroke through a background font-size change and the app alive through a renderer kill; `main`'s build loses the page and dies (negative control); drift test                                      | The Galaxy itself (renderer kill needs root; font-size change)                                                                                      |
| Durable in-progress checkpoint (ADR-0178)               | 1cec374771b0 | `drawing-checkpoint.spec.ts` 9/9 over three repeats, 3/3 fail without the install; checkpoint unit tests; native modulepreload count back to the pinned 28                                                                        | Restore after a real kill on both devices; checkpoint write cost on the Galaxy and the iPad                                                         |
| Export ANR (1 in 385), Galaxy running warmer            | n/a          | device checks only, no guessed fix                                                                                                                                                                                                | see below                                                                                                                                           |

Fixes that followed phase 1:

* From the rival review's two rounds: 8ac1bcf16c27, 6c9a9bfc68cd and 3a89050ecc36 (checkpoint
  restore ownership and teardown), and 70dfb0852b3d (the iPad's matched-scale export stays on its
  measured GPU path, so only the Android replay worker uses CPU surfaces).
* 4a407a25661c: strict IndexedDB durability, after the emulator lost the record on `am force-stop`.
* ff63d94d6753: the two CI failures phase 1 introduced.

## 2. Dependabot

All 23 open Dependabot PRs applied here with pnpm at their verified versions, one commit per PR or
group; the PRs themselves are untouched. The per-PR verdict table is in the PR body, and the
reasoning behind each verdict is in the commit message.

* Held: SvelteKit 3.1.0 and the adapter majors from the Svelte group (3187). Svelte 5.57.2 landed;
  Kit 3 breaks the offline path and is left to the optional trial branch.
* `pnpm audit --audit-level=high` passes. The braces exception stays: issue 2648 waits for braces
  3.0.4, and the registry still lists 3.0.3 as latest (checked 2026-11-12).
* Unverified: the Lighthouse medians were not recalibrated for 13.6.0, only the recorded version.

## 3. Open issues

| Issue | Outcome                                                       | Commit       | Gate                                                                                                                                                            | Unverified                                                    |
| ----- | ------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 2868  | Fixed in phase 1                                              | 2449a4e9db8a | 15be9246fd93's spec (fails 8 iPad landscape cases before the fix)                                                                                               | Real 12.9" iPad look                                          |
| 2841  | Fixed: hub rows inherit Quicksand                             | 7fec3abf9f3d | two new `settings-hub.spec.ts` cases; the hub case fails without the CSS                                                                                        | none                                                          |
| 1386  | `overscroll-behavior: none` on the drawing route's `<html>`   | e69955087711 | new `page.spec.ts` case (none on `/`, auto on `/privacy`) fails without the rule                                                                                | No pull indicator on a physical Android phone in Chrome       |
| 3225  | Netlify ignore also diffs the pushed commit's first parent    | 45cc24928a9d | `netlify-deploy-skip.test.mjs` runs the real command on a scratch history; the old command fails its three trap cases; `test:tools` 7,107 passed                | The first production deploy after merge; the multi-commit gap |
| 1583  | One `FreeCharge` settlement module for both generation routes | fe8bcb202ac2 | both route suites pass without changes beyond one id constant; a new route case passes on the old code and fails on the issue's proposed shape; API smoke 42/42 | none                                                          |

Not done, and why:

* 2880 (swatch ring lost after Settings closes, iOS app): desktop WebKit keeps the ring at phone and
  tablet sizes (computed `box-shadow` and pixels unchanged after Settings closes), and the issue's
  evidence folder no longer exists. Reproducing it needs the iOS app in a simulator or on a device.
* 1884 (undo re-arms after the tiled history runs out): a CI-only flake with three retries in one
  week. There is no bounded off-device reproduction, so it was not worth a timebox here.
* 2648: its condition (braces 3.0.4 published) is not met.
* 1451 (entropy floor on managed codes), 1450 (should a drawing survive a crash), 2376 and 1427
  (campaign umbrellas): each needs an owner decision. ADR-0178's checkpoint is relevant to 1450 but
  does not decide it.

## Pending device checks (run after the RN film test)

Run on a build of this branch. The Galaxy's lock and the iPad's lock and the rig lock follow the
campaign's `RIG.md`; never touch the store app `art.splotch.app` or the campaign's `.best` and
`.export` installs.

1. **Galaxy `stall-ink` S/C rerun.** `stall-ink.md`'s method unchanged (uinput two-slot scripts,
   `score.py`, the dense Crayon picture), moments S (Save) and C (auto-saving Clear) at 100 / 300 /
   700 ms, plus control N. Pass: 9/9 on-wave at 100 and 300 ms for S and C, no line late ≥ 100 ms,
   no UI-thread `doFrame` over 50 ms in an atrace of one Save. Also pull one saved picture and
   compare it with the same picture from `main`'s build: under 1% of pixels off by more than 8
   levels.
2. **200-export ANR soak.** `export-soak.md`'s method on this build: 200 exports split across Save
   and auto-saving Clear. Pass: 0 ANRs; report the pooled rate with its 95% bound. Record any GPU
   thread stuck in the driver.
3. **iPad export and memory.** ADR-0088's frame-bound harness on the 12.9" (2× screen, the
   matched-scale worker path whose surfaces are now CPU): first-frame and post-action P95, maximum
   frame, preview-ready and PNG-ready times, and memory over 15 saves. Also one save with a pointer
   held down (the replay worker path). If WebKit regresses past the 33.5 ms gate, gate
   `CPU_SURFACE_SETTINGS` to Android.
4. **Audio.** iPad: with Sound on, draw, wait 10 s; the audio server's session should deactivate (no
   RTAID lines every 10 s); turn Sound off mid-session, same. Galaxy: renderer CPU while idle in
   front and in the background (`battery-heat.md` method) against 3–4 and 1.9 CPU-s/min. Both:
   first-stroke sound latency after a park. If an audio-server crash recurs on the iPad, check the
   sound comes back without a relaunch.
5. **Durability.** `durability.md`'s K1–K5 cells on the Galaxy and the iPad: the page should now
   come back after each kill (minus at most the last 2 s or a stroke in progress), and a font-size
   or bold-text change in the background should keep the page.
6. **Heat.** `battery-heat.md`'s 10-minute drawing run, two runs per build, this branch against
   `main`: chip and skin temperature and thermal status. Only a measurement; no fix is proposed.
