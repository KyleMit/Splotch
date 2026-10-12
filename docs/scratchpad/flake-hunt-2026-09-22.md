# Flake hunt — 2026-09-22

Overnight, unattended, in a Claude Code cloud container: the Vitest tiers and the Playwright E2E
suite run many times with retries off, every intermittent failure classified, every survivor filed.
Follows the flake-hunting protocol in `docs/TESTING.md` and the shape of
`e2e-flake-hunt-2026-09-02.md`.

## Method

Cloud container, 4 logical CPUs (`availableParallelism()` = 4, so 4 workers is the supported CI
contention level, ADR-0078), 15 GB RAM. Every full-suite E2E rep ran through the sweep driver, which
builds once, unsets the CI variables (retries off), and boots a fresh preview server per rep:

```bash
npm run test:e2e:sweep -- --workers=4 --reps=12 --out=<dir>/sweep1          # discovery
npm run test:e2e:sweep -- --workers=4 --reps=12 --out=<dir>/sweep2          # discovery
npm run test:e2e -- <spec> -g "<title>" --workers=8 --retries=0 --repeat-each=10 \
  --trace retain-on-failure                                                 # amplification
```

The Vitest tiers (`test:unit`, `test:tools`, `test:asset-gen`, `test:store-drawings`) ran 20
iterations each under `timeout 600`, plus one `--sequence.shuffle` pass per tier; `test:api:smoke`
ran 5 iterations on an explicit port.

The suite is 905 tests in 97 files at `d8a8102` (581 on 2026-09-02).

### Seed list from CI

`npm run gen:flaky-digest` cannot reach Actions from this container: the token is rejected with a
401 through the proxy. The `Flaky digest` workflow's own history artifact (run 35671284884,
2026-09-22T00:17Z) was downloaded through the GitHub MCP artifact link instead. Its 7-day ranking
(window 2026-09-15 → 2026-09-22; 1,201 trunk samples, 2,891 branch samples, 136 masked events):

| Events | trunk | branch | Last seen | Test                                                                                                                   |
| -----: | ----: | -----: | --------- | ---------------------------------------------------------------------------------------------------------------------- |
|     83 |    25 |     58 | 09-21     | `flows-parent-center-warning.spec.ts` › the standing warning survives a relaunch and asks nothing of the mode it is on |
|     28 |     4 |     24 | 09-21     | `flows-parental-gate.spec.ts` › Parent Center is gated before its controls appear and persists every feature policy    |
|     10 |     4 |      6 | 09-21     | `actions-panel-layout.spec.ts` › AI-only drawer paints its count before the grant arrives                              |
|      9 |     2 |      7 | 09-16     | `flows-palette-brush.spec.ts` › the eraser bubble tracks the pointer and hides on leave or brush switch                |
|      3 |     0 |      3 | 09-19     | `bare-toolbar.spec.ts` › Bare hides stale pane geometry until rotation layout settles                                  |
|      2 |     1 |      1 | 09-19     | `flows-parent-center-warning.spec.ts` › cancelling the warning leaves the Parent Center check as it was                |
|      1 |     1 |      0 | 09-21     | `coloring-pack-download.spec.ts` › a fresh install opens the Farm pages directly before packs arrive                   |

Every one of these shipped green under `retries: 2`.

## Container baseline

(Re-measured below from the discovery sweeps; the 2026-09-02 floor was `pwa-registration` precache
bytes and `store-drawing-replay` replay parity at 13/13, and the privacy-page provider-terms gate at
4/13.)

## Discovery, 4 workers, retries off

### Sweep 1 — 12 reps, 10,860 executions, 553–563 s per rep

Every rep ran all 905 tests (the driver's zero-execution guard never tripped). The two
container-baseline specs took every rep; the rest is the hunt:

| Reps failed | Spec › test                                                                                                            | Failing state                                                                                                                   |
| ----------: | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
|       12/12 | `pwa-registration.spec.ts` › serves canonical precache bytes for offline DPR 1 and DPR 3 page previews                 | container baseline, unchanged                                                                                                   |
|       12/12 | `store-drawing-replay.spec.ts` › pointer and engine replay render the same compiled scene                              | container baseline, unchanged (30 s timeout every rep)                                                                          |
|        7/12 | `flows-parent-center-warning.spec.ts` › the standing warning survives a relaunch and asks nothing of the mode it is on | `page.reload: net::ERR_ABORTED; maybe frame was detached?` in 6 reps; the CI shape, a 30 s hang waiting for `load`, in 1        |
|        5/12 | `actions-panel-layout.spec.ts` › AI-only drawer paints its count before the grant arrives                              | `expect(settled.badgeCount).toBe('7')` received `"10"`                                                                          |
|        4/12 | `privacy-parent-center.spec.ts` › Parent Center reached from privacy hydrates its persisted settings                   | 3 × 30 s timeout inside `settleSettingsPane` (pane never reports `aria-busy=false`); 1 × gate keypad gone before `Check answer` |
|        2/12 | `flows-parental-gate.spec.ts` › Parent Center is gated before its controls appear and persists every feature policy    | `page.reload: net::ERR_ABORTED` after closing Settings                                                                          |
|        1/12 | `flows-parental-gate.spec.ts` › the bundled privacy page gates its provider terms link                                 | gate dialog gone mid-solve: `Check answer` never found (15 s)                                                                   |
|        1/12 | `reduce-motion.spec.ts` › a visible AI downloadButton cue does not replay when Reduce Motion turns off                 | `page.evaluate` invoking `__aiGenerate` never returned; 30 s test timeout                                                       |
|        1/12 | `web-back.spec.ts` › Back closes nested dialogs from the top down                                                      | second `page.goBack()` left `#settingsModal` open                                                                               |

Per rep: 4, 4, 5, 3, 4, 3, 5, 4, 4, 3, 3, 3 failures, every rep red on the baseline pair alone. The
three ranked CI flakes all reproduced; the CI digest's `flows-palette-brush` eraser bubble,
`bare-toolbar` rotation, `coloring-pack-download` fresh install, and the `cancelling the warning`
sibling did not (0 of 12 each).

### Sweep 2 — 12 reps on the fix branch, 10,860 executions, 608–636 s per rep

Run on `claude/flake-fixes-2026-09-22` at e19690a (main at d8a8102 plus the three spec fixes),
`--prebuilt` against the same bundle, with a niced (`nice -n 19`, one worker) Vitest loop sharing
the box, so the contention was higher than sweep 1's. It is both the post-fix validation and the
second discovery pass.

| Reps failed | Spec › test                                                                                                  | Failing state                                                                                         |
| ----------: | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
|       12/12 | `pwa-registration.spec.ts` › serves canonical precache bytes                                                 | container baseline                                                                                    |
|       12/12 | `store-drawing-replay.spec.ts` › pointer and engine replay render the same compiled scene                    | container baseline                                                                                    |
|        0/12 | `flows-parent-center-warning.spec.ts` › the standing warning survives a relaunch                             | fixed (was 7/12)                                                                                      |
|        0/12 | `flows-parental-gate.spec.ts` › Parent Center is gated before its controls appear and persists …             | fixed (was 2/12)                                                                                      |
|        0/12 | `actions-panel-layout.spec.ts` › AI-only drawer paints its count before the grant arrives                    | fixed (was 5/12)                                                                                      |
|        0/12 | `web-back.spec.ts` › Back closes nested dialogs from the top down                                            | fixed (was 1/12)                                                                                      |
|        4/12 | `privacy-parent-center.spec.ts` › Parent Center reached from privacy hydrates its persisted settings         | `settleSettingsPane` timeout, as in sweep 1                                                           |
|        4/12 | `privacy-parent-center.spec.ts` › closing Parent Center with its close button returns focus …                | same `settleSettingsPane` timeout inside `openPrivacyParentCenter` (0/12 in sweep 1)                  |
|        3/12 | `privacy-parent-center.spec.ts` › closing Parent Center with a backdrop tap returns focus …                  | same (0/12 in sweep 1)                                                                                |
|        3/12 | `flows-parental-gate.spec.ts` › the bundled privacy page gates its provider terms link                       | gate gone mid-solve, as in sweep 1 (1/12 there)                                                       |
|        1/12 | `changelog.spec.ts` › phone landscape › the open contents panel scrolls inside itself, bottom edge on screen | panel bottom 98 px past the viewport for the whole 5 s poll after `pinContentsRow`'s `scrollIntoView` |
|        1/12 | `design.spec.ts` › the disclosure chevron rotates open                                                       | `summary.click()` never gave the `<details>` its `open` attribute (5 s poll)                          |

Per rep: 2, 2, 4, 3, 2, 4, 7, 2, 3, 4, 5, 2 failures. Reps 7 and 11 lost all three privacy-route
specs together. The /privacy hangs and the mid-solve gate loss both rose with the extra load, which
fits a contention mechanism and is recorded on issues \#2148 and \#2149; the two singles join the
`reduce-motion` one from sweep 1 as seen-once failures with no second event across 24 reps.

## The reload race after a dialog closes

`flows-parent-center-warning.spec.ts` › the standing warning survives a relaunch (7/12) and
`flows-parental-gate.spec.ts` › Parent Center is gated before its controls appear and persists every
feature policy (2/12). The CI digest's top two, 83 and 28 masked events in 7 days.

Both specs confirm the unprotected-Parent-Center dialog, close Settings, and call `page.reload()`
within about 100 ms. ADR-0168 pushes one shallow SvelteKit history entry per open dialog and retires
it with `history.back()` as the dialog closes; two dialogs closed back to back leave two traversals
in flight. A reload issued while one is pending is cancelled by it, in either of two shapes:

* **Aborted** (6 of the 7 reps, 3 of 4 amplifier failures):
  `page.reload: net::ERR_ABORTED; maybe frame was detached?`. The reload's document request starts
  and is torn down.
* **Dropped** (1 rep here, 1 amplifier failure, and every CI trace read):
  `waiting for navigation until "load"` for the whole 30 s budget. The trace shows the Close click's
  navigations "finished", then the reload call, then nothing — no document request leaves the page,
  and the page snapshot at timeout is the un-reloaded page with Settings closed. CI run 35647052273
  shard 5 (retry 1 trace, `flows-parent-center-warnin-36a31…-retry1/trace.zip`) and the local
  `amp/pre-reload-results/…-repeat9/trace.zip` agree: 87 ms from Close to reload, zero network
  entries after it.

Ruled out: `beforeunload` (none in `web/src`); the app.html pre-hydration unwind (it runs
`history.go(-n)` only when a reload lands on a still-shallow entry, which is the same pending
traversal seen from the other side, and `web-back.spec.ts` › refreshing with a dialog open does that
deliberately and passes 12/12); the confirm dialog's fly-in (both clicks landed, the dialogs
closed). The `cancelling the warning` sibling does the same close-then-reload but spends three
assertions between them, and went 0/12 here and 2 events in CI.

Pre-fix amplifier (both specs, `--workers=8 --retries=0 --repeat-each=10`, main at d8a8102): 4 of 20
failed, all on the persistence spec (3 aborted, 1 dropped).

Classification: **spec race**. A user who reloads within tens of milliseconds of closing a dialog
loses one reload and lands on the same page; nothing else is reachable. Fix (PR \#2143):
`reloadAfterDialogClose` in `tests/helpers.ts` polls `history.state` until the back-navigation
marker reports zero dialog layers, then reloads. Post-fix amplifier: 0 of 20.

## The AI-only badge count

`actions-panel-layout.spec.ts` › AI-only drawer paints its count before the grant arrives (5/12; 10
masked CI events). The spec releases the mocked grant, waits for `.free-count` to be visible, and
reads the badge, expecting `7`; it reads `10`. The badge is painted from the cached count before
hydration (commit 61f57da), so it is visible long before the grant response is applied, and the read
races the fulfilment. In isolation the fulfilment always wins (amplifier 0/10 at 8 workers); under
the full suite it lost 5 reps in 12.

Classification: **spec race**. Fix (PR \#2143): poll `startupPanelGeometry(page).badgeCount` for the
granted number before reading the settled geometry. Post-fix amplifier: 0 of 10.

## Back through nested dialogs

`web-back.spec.ts` › Back closes nested dialogs from the top down (1/12; not in the CI digest). The
first `page.goBack()` closes the gate; the spec polls `dialog.open === false`, checks Settings, and
presses Back again, which left `#settingsModal` open. A dialog stays on the modal stack until its
`close` event, a queued task after `dialog.open` flips (`modalDialog.svelte.ts`, `onClose` →
`forgetOpenModal`), and `requestDismiss` on a dialog whose `open` option is already false returns
`refused` by design, so the back handler re-pushes the entry (`restoreRefusedDialog`) and Settings
stays. Under contention the second Back landed inside that window. Isolated amplifier: 0/10.

Classification: **spec race** (the refusal is the documented guard against a Back racing a
retirement; a human cannot press twice inside one task). Fix (PR \#2143): install a `close` listener
on the gate before the first Back and await it before the second. The first version attached the
listener from an un-awaited `evaluate` and lost to the event 10 of 10 times; the committed version
installs and awaits it first.

## The privacy-route Parent Center

`privacy-parent-center.spec.ts` › Parent Center reached from privacy hydrates its persisted settings
(4/12; not in the CI digest, 0 events in 7 days). Bimodal: 3.8 s when it passes, 30 s when it fails.
Three of the four timed out inside `settleSettingsPane` — 300 animation frames never elapsed and the
pane never reported `aria-busy="false"`, with every section, including Parent Center's policy
pickers and the "Add your own OpenAI API key" copy the spec was about to assert, already in the
snapshot. The fourth failed the way the provider-terms gate below does. Isolated amplifier (with the
provider-terms spec, 20 executions at 8 workers): 0 failures.

Classification: **container-only**, provisionally. It needs the full suite's contention, it never
retried in CI over 3,000 samples, and the mechanism — frames that stop arriving for a modal that is,
by every DOM measure, done filling — has no product reading yet. Not fixed in PR \#2143; filed so
the next hunt can instrument `WideShell`'s `stagedContentSettled` on this route.

## Container baseline, re-measured

* `pwa-registration.spec.ts` › serves canonical precache bytes: 12/12, unchanged since 2026-09-02.
* `store-drawing-replay.spec.ts` › pointer and engine replay render the same compiled scene: 12/12
  (30 s timeout every rep), unchanged.
* `flows-parental-gate.spec.ts` › the bundled privacy page gates its provider terms link: 1/12 (was
  4/13). Same shape as before: `solveParentalGate` types the digits, then `Check answer` is never
  found for 15 s, and the failure snapshot has no dialog on the page at all — the gate closed
  mid-solve. Isolated amplifier 0/20. Still not chased; it shares the /privacy route with the
  hydration hang above.

## Seen once

`reduce-motion.spec.ts` › a visible AI downloadButton cue does not replay when Reduce Motion turns
off: 1/12, 35.6 s. The whole budget went inside `invokeAiGeneration`'s `page.evaluate`, i.e. the
synchronous prelude of `generateAiImage` (modal launch, canvas export start) held the page's main
thread for 30 s. Isolated amplifier 0/10, absent from CI.

Sweep 2 added two more singles: `changelog.spec.ts` › phone landscape › the open contents panel
scrolls inside itself (1/12; the pre-hydration `scrollIntoView` pin did not hold and the panel sat
98 px past the fold for the whole poll) and `design.spec.ts` › the disclosure chevron rotates open
(1/12; the `summary.click()` produced no `open` attribute). Each is one event in 21,720 executions
with no second sighting and no capture; they are filed together as issue \#2151 so a later sweep has
somewhere to add a second event, not as three flakes with a shape.

## The fix PR and its review

PR \#2143 (`claude/flake-fixes-2026-09-22`, three commits on d8a8102) carries the three spec fixes.
CI was green on every push, with no retried pass on the shards that carry the fixed specs. The Codex
rival (`run-rival-agent`, round 1, thread 01a0c771…) read the five-file diff, ran `npm run check` in
its sandbox and the five changed scenarios through the broker at 2 workers (5 passed), and returned
no findings: it judged the history-state poll to observe the committed traversal, the drawing guard
harmless to it (`dialogs: 0`), the marker duplication justified by the source module's
`$app/navigation` import, the gate listener correctly ordered, and the badge poll the right outcome;
its one caution — that a targeted pass is not proof under contention — is what sweep 2 below
answers. Two cloud-session wrinkles for the next handler: the launcher's `--base main` resolves
against the *local* `main`, which was 10 commits stale here, so the packet diff spanned 348 files
until the rival's first broker request (a `gh pr view` the VM cannot run) was declined with the PR's
real range; `git branch -f main origin/main` before launching avoids it. And the posted review
carries the marker with the launcher's base, not the PR's, because the relay keeps the rival's own
scope honest.

## Vitest and smoke tiers

Two passes, because the first one measured my own contention. The plan's 20 iterations per tier ran
as a loop at `nice -n 19` with one worker underneath sweep 2, so the box held 4 Playwright workers
plus this; an iteration of all four tiers took about 14 minutes there instead of 4, and the loop
reached 8 complete iterations (9 for `unit`) before sweep 2 ended and it was stopped.

| Tier                  | Contended (nice 19, under sweep 2) | Uncontended, default workers                  | Shuffled (`--sequence.shuffle`)                                                                                                            |
| --------------------- | ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `test:unit`           | 9/9 clean (3,305 + 12 tests)       | 3/3 clean                                     | **18 failed** in 5 files, seed 1790060363551 (issue \#2152); the SSR config did not run in that pass because the two are chained with `&&` |
| `test:tools`          | 1/8 clean                          | 3/3 clean                                     | clean                                                                                                                                      |
| `test:asset-gen`      | 4/8 clean                          | 3/3 clean                                     | clean                                                                                                                                      |
| `test:store-drawings` | 8/8 clean                          | 3/3 clean                                     | clean                                                                                                                                      |
| `test:api:smoke`      | —                                  | 5/5 clean (40 checks each, `SMOKE_PORT=4517`) | —                                                                                                                                          |

Every contended miss was a timeout, never an assertion: `tools` lost
`svelte-browser-globals-lint.test.mjs › rejects a browser-global read at the top level of a rune module`
(an in-process ESLint run, 9.8–12.7 s against its 5 s budget) in 7 of 8 iterations, and `asset-gen`
lost `outline-analysis.test.mjs › preserves every scorer result while accepting raw buffers` (10 s
budget) in 4 and
`composite-eye.test.mjs › separates the two classes with margin on both sides of the threshold` (5
s) in 1. Uncontended, all of them pass three times in a row at their normal speed, so those are a
measurement of a niced process under a full E2E sweep, not of the tiers, and are not filed. CI runs
these tiers alone in the Browserless job.

The shuffle pass is the one Vitest finding: the web unit tier carries order dependence across
`app.html.test.ts` (13 tests: the boot-script fixture's DOM node is null when they run first),
`storage.test.ts` (a once-per-class warning latch already tripped), `tiledRenderer.test.ts` and
`tiledRendererBlankUndo.test.ts` (undo history carried between tests), and `saveOnDelete.test.ts` (a
memoized module load already satisfied). Reported as a hidden flake source in issue \#2152, not as a
proposal to shuffle in CI.

## Issue index

| Issue  | Spec › test                                                                                                       | Rate (4 workers, retries off)                                                            | Classification                         |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| \#2145 | `flows-parent-center-warning` › survives a relaunch; `flows-parental-gate` › persists every feature policy        | 7/12 and 2/12; amplifier 4/20; post-fix 0/12 and 0/12, amplifier 0/20                    | spec race, fixed in PR \#2143          |
| \#2146 | `actions-panel-layout` › AI-only drawer paints its count before the grant arrives                                 | 5/12; amplifier 0/10; post-fix 0/12                                                      | spec race, fixed in PR \#2143          |
| \#2147 | `web-back` › Back closes nested dialogs from the top down                                                         | 1/12; amplifier 0/10; post-fix 0/12, amplifier 0/10                                      | spec race, fixed in PR \#2143          |
| \#2148 | `privacy-parent-center` › Parent Center reached from privacy hydrates its persisted settings                      | 4/12, then 4/12, 4/12 and 3/12 across the three privacy specs in sweep 2; amplifier 0/20 | container-only (provisional), open     |
| \#2149 | `flows-parental-gate` › the bundled privacy page gates its provider terms link                                    | 1/12, then 3/12 (4/13 in 2026-09); amplifier 0/20                                        | container-only (provisional), open     |
| \#2150 | `pwa-registration` precache bytes; `store-drawing-replay` replay parity                                           | 12/12 each, both hunts                                                                   | container-only, deterministic          |
| \#2151 | `reduce-motion` › downloadButton cue; `changelog` › contents panel bottom edge; `design` › the disclosure chevron | 1/24 each                                                                                | seen once, no capture                  |
| \#2152 | web unit tier under `--sequence.shuffle`: 18 tests in 5 files                                                     | 18/3,305 at seed 1790060363551; 0 in order                                               | order dependence (hidden flake source) |

## Post-run validation

* Container: 4 logical CPUs, 15 GB, Chromium from `/opt/pw-browsers`, `main` at d8a8102 for
  discovery, e19690a for validation. Contention level: 4 workers (ADR-0078's supported CI count) for
  every full-suite rep, 8 workers for every amplifier.
* Sample: 24 full-suite reps, 21,720 test executions, all through `test:e2e:sweep` with a fresh
  preview server per rep (sweep 1 built once; sweep 2 `--prebuilt` on the same bundle), plus 120
  amplifier executions pre-fix and 40 post-fix. Vitest: 8–9 contended and 3 uncontended iterations
  per tier, one shuffle pass per tier, 5 smoke runs.
* Fixed specs after the fix: 0 of 12 full-suite reps each and 0 of 20/10/10 amplifier executions,
  against 7/12, 2/12, 5/12, 1/12 before. That is the protocol's three clean reps four times over,
  and it is validation, not proof: the pre-fix rates put the reload race at roughly one rep in two
  and the badge race at one in 2.4, so twelve clean reps make a surviving rate of either size
  unlikely, and a rate of one in fifty would still hide in this sample.
* Not fixed and still red here: the /privacy route (issues \#2148 and \#2149, which both scaled with
  load — sweep 2 carried the Vitest loop on top), the deterministic pair (\#2150), and the three
  singles (\#2151). `gen:flaky-digest` cannot run from this container (401 through the proxy); the
  digest came from the workflow's own history artifact.
* Timing for the next hunt: a rep of 905 tests takes 553–563 s alone at 4 workers, 608–636 s with a
  niced one-worker Vitest loop beside it; 12 reps is just under two hours either way.
