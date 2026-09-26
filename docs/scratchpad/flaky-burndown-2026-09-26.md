# Flaky test burndown — 2026-09-26

This is the first hand run behind issue \#2324. The prior art is
[`tools/flaky-digest/README.md`](../../tools/flaky-digest/README.md), the flake-hunting protocol in
[`docs/TESTING.md`](../TESTING.md), and the [2026-09-22 hunt](flake-hunt-2026-09-22.md), whose PR
\#2143 fixed several signatures that remain in the rolling digest.

## Baseline and coverage

`npm run gen:flaky-digest` read the scheduled history artifact 10905149417 at 2026-09-26T12:28:48Z.
Its seven-day window held 169 trunk runs with 1,691 report-job samples, 157,941 test executions, and
**44 masked retry events**. It held 402 branch runs with 3,878 samples, 360,630 executions, and
**113 events**. The 15 ranked test signatures account for all 157 events. There were 143
cancelled-job gaps, four replaced artifacts, and one missing artifact; none counts as a clean
sample.

The history includes tests and branch heads from *before* their fixes. A current run cannot make the
seven-day count drop immediately; the old events age out of the window. Compare new samples on the
fixed head at the same worker load, then record the next full seven-day count once its window no
longer includes the pre-fix events.

## Ranked triage

| Seven-day events (trunk / branch) | Signature                                                         | Finding and disposition                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------: | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|                      52 (12 / 40) | `flows-parent-center-warning`: standing warning survives relaunch | Historical dialog-history reload race. PR \#2143 added `reloadAfterDialogClose`; last event was on the old head, 2026-09-22.                                                                                                                                                                                                                                                                                               |
|                       31 (9 / 22) | `design-foundations`: dark dialog header contrast                 | Live spec race. [CI run 36212685522](https://github.com/KyleMit/Splotch/actions/runs/36212685522) sampled contrast 2.12 during the icon-fill theme transition, then passed on retry. Wait for descendant transitions to finish before one contrast sample at the existing 3:1 threshold. The CI trace is pre-fix evidence; targeted passes at ten workers only check for regression.                                       |
|                       29 (5 / 24) | `flows-parental-gate`: Parent Center policies persist             | Same historical reload race as the standing-warning test, fixed in PR \#2143.                                                                                                                                                                                                                                                                                                                                              |
|                        16 (8 / 8) | `actions-panel-layout`: AI-only drawer count                      | Historical cached-count-versus-grant race, fixed in PR \#2143 by polling the granted count.                                                                                                                                                                                                                                                                                                                                |
|                        13 (6 / 7) | `bare-toolbar`: stale pane geometry                               | Live spec clock race. [CI run 36206404902](https://github.com/KyleMit/Splotch/actions/runs/36206404902) failed when `pauseAt(new Date())` followed `clock.install()` and asked to fast-forward into the past. Let `pauseAt` install the clock; 30 targeted passes at ten workers.                                                                                                                                          |
|                         4 (1 / 3) | `drawing-motion`: lifting halo cancelled                          | Branch head lacked the later animation-signal fix 6d15148ff; no event on `main` after that fix.                                                                                                                                                                                                                                                                                                                            |
|                         3 (1 / 2) | `privacy`: contents row scrolls to pin                            | Shared spec helper race. [CI run 36107112648](https://github.com/KyleMit/Splotch/actions/runs/36107112648) left the last link outside the viewport after the panel bottom reached the fold. The helper retried the wheel only until the panel reached the fold, then checked the last link once. Its retry now includes last-link visibility; one trunk event was on 2026-09-23 and the latest branch event on 2026-09-25. |
|                         2 (0 / 2) | `privacy-parent-center`: close restores focus                     | Still open. Both branch events on 2026-09-22 observed the link inactive after modal close. The 2026-09-22 hunt recorded other privacy-route settling problems under container load; these two are not yet explained by that mechanism.                                                                                                                                                                                     |
|                         1 (1 / 0) | `coloring-pack-download`: Farm page before packs                  | Spec race. [CI run 35637931087](https://github.com/KyleMit/Splotch/actions/runs/35637931087) clicked a page while the dialog fly-in could still be inside its launch guard. Wait for `settleFlyIn` before the page click; 30 targeted passes at ten workers.                                                                                                                                                               |
|                         1 (1 / 0) | `flows-parent-center-warning`: cancelling warning                 | Same historical reload race, using `reloadAfterDialogClose` on current `main`.                                                                                                                                                                                                                                                                                                                                             |
|                         1 (0 / 1) | `ai-result`: fresh stage after retry                              | Branch head lacked the later error-heading locator fix f72a55152; current `main` has it.                                                                                                                                                                                                                                                                                                                                   |
|                         1 (0 / 1) | `design`: scroll-cue caption state                                | One branch event on 2026-09-24; the second cue remained opaque after scrolling the first specimen into view. The cause has not been captured.                                                                                                                                                                                                                                                                              |
|                         1 (0 / 1) | `paper-texture-boot`: flat before grain                           | Historical test on a branch; this spec no longer exists on `main`.                                                                                                                                                                                                                                                                                                                                                         |
|                         1 (0 / 1) | `picker-trim`: honeycomb width ladder                             | Spec retry bug. [CI run 36155390568](https://github.com/KyleMit/Splotch/actions/runs/36155390568) opened the picker, timed out before observing it, then re-clicked a swatch behind the open dialog. Retry observes the dialog first; 30 targeted passes at ten workers.                                                                                                                                                   |
|                         1 (0 / 1) | `web-back`: nested dialogs                                        | Branch head lacked PR \#2143's close-event listener ordering fix; current `main` has it.                                                                                                                                                                                                                                                                                                                                   |

The five changes in this run are **test races**. No confirmed product or infrastructure defect was
found in their failure logs. The Parent Center focus and scroll-cue signatures remain unexplained
and active after the full-suite sweep and 30 targeted repetitions each. There is no basis for a
quarantine. No assertion or protection was weakened to obtain a green run.

## Judgment calls and surprises

* A static skip scan was not a useful seed: the repo's test lint rejects unconditional skip/fixme.
  The ten current `test.skip` calls in `web/tests` all depend on `DEV_SERVER`; there are no `.fixme`
  or `.todo` calls. The digest is the real intake.
* CI retry history is not a list of current defects. Three of the four highest-ranked signatures (97
  of 157 events) were already fixed by the 2026-09-22 hunt. The halo's trunk event and later branch
  events for the AI result and Back specs used heads that predated their fixes. Compare event SHAs
  with the fix commit before reopening them.
* The generator needs Actions read access. The sandbox lacked a token, while the authenticated host
  could run it through its existing `gh` login. A prior cloud hunt had to read the scheduled digest
  artifact through the GitHub connector when its token was rejected.
* Playwright deletes `test-results/` at startup, including the digest's default output. After the
  first targeted test erased it, the digest was regenerated with
  `--out /private/tmp/splotch-flaky-2324`.
* A local preview-server bind returned `EPERM` in the sandbox. Targeted runs used a recorded free
  port through the host boundary; this was not a test failure.
* Thirty isolated repetitions of the original dark-header test passed at four workers despite 31
  masked CI events. That run and the ten-worker post-fix amplifier are at different loads and cannot
  be compared as failure rates. The CI trace establishes the transition mechanism; clean local
  amplifiers show no regression, not a measured reduction in its failure rate.
* Independent review found that retrying contrast could pass on the light palette before the dark
  transition settled. A minimal Chromium reproduction read 15.52:1 immediately after the flip and
  1.21:1 after settling with a deliberately broken dark token. The spec now waits for descendant
  animations to finish before a single contrast assertion. A temporary token regression made that
  spec fail at 1.21:1 against its 3:1 floor; the token file was restored and left clean.
* The privacy contents-row failure was initially left as a low-frequency lead after 30 clean local
  repetitions. Review identified a shared helper exit condition that checked the panel bottom but
  not its last link inside the retry. The helper now keeps scrolling until the last link is visible.

## Verification and remaining measurement

`npm run check` passed. Each changed spec passed 30 targeted repetitions at ten workers with retries
disabled.
`SPLOTCH_E2E_PORT=5196 npm run test:e2e:sweep -- --workers=10 --reps=3 --out=/private/tmp/splotch-flaky-sweep-2324`
then ran three fresh-server full-suite repetitions with retries disabled. All three passed 979 tests
with zero failures or skips: **2,937 executions, zero failures**. The median wall time was 155.8
seconds. This is a fixed-branch local result, not a new seven-day CI digest count; subsequent CI
samples and an aged-out window are separate measures.

The three low-frequency signatures were amplified together at the same ten-worker load, on port
5197, with retries disabled and 30 repetitions each. The landscape privacy panel, both Parent Center
dismissals, and the scroll-cue specimen passed **120/120 executions**. That clean local sample did
not rule out the privacy helper race found in review; the other two remain leads for the next
digest.

After review, both header themes and both users of the shared contents helper (privacy and
changelog) passed 30 repetitions each at ten workers with retries disabled: **120/120** on port
5198. The final
`SPLOTCH_E2E_PORT=5200 npm run test:e2e:sweep -- --workers=10 --reps=3 --out=/private/tmp/splotch-flaky-sweep-2367-r2`
then passed another three fresh-server repetitions: **2,937/2,937 executions**, zero failures and
zero skips. Its median wall time was 155.6 seconds. The final sweep measured the review fixes;
neither local sweep is a seven-day CI retry count.
