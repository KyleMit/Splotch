# Handoff — iPad findings fixes

> 2026-08-12 · branch `codex/ipad-findings-fix-handoff` · Turn the physical-iPad campaign into
> focused fixes, finish every autonomous fix before requesting human Pencil/audio work, then stage
> the remaining assisted validation.

## Objective & non-goals

Autonomously convert the confirmed device findings into focused GitHub issues and fix them in risk
order. For each fix: claim/file the issue, implement on a dedicated branch, run focused tests, get
an independent review, address it, drive CI green, and run the relevant attached-iPad/Appium
recapture before starting the next fix.

**Do not prompt the user while autonomous work or a fix is in flight.** If a candidate fix is
started, take it to a safe terminal state first: merged/ready with evidence, or fully reverted with
the branch clean and the issue updated. Only after the autonomous queue is drained or genuinely
blocked should the session stage and request the user-driven Pencil/audio actions in one concise
batch.

Non-goals:

* Do not reopen or add fix commits to historical merged PRs; file focused issues and new PRs.
* Do not treat an exploratory `--report-only` miss as actionable until a focused repeat reproduces
  it.
* Do not substitute Appium touch for Apple Pencil, Appium screen video for acoustic output, or
  XCTest's simultaneous cancellation for the exact partial-lift event model.
* Do not refactor the renderer or relax ADR-0090's physical-device gates without a causal isolation.

## State

* Packet base: 3aa1b5622000b9ebf1d0db3043f50c1c3ec55bf0 (`main` at campaign time).
* Handoff branch: `codex/ipad-findings-fix-handoff`; no product PR and no product source edits.
* Physical target: iPad Pro 12.9-inch (5th generation, iPad13,8), iPadOS 26.5; Xcode 26.6, Appium
  3.6.0, XCUITest driver 12.1.3, WDA 16.1.0.
* Device cleanup completed: Windowed Apps restored, Sound restored on in localStorage and Capacitor
  Preferences, current instrumented main reinstalled after the historical A/B, all owned Appium and
  preview servers stopped.
* Main worktree was clean after cleanup. Performance outputs are gitignored; disposable cold-audio
  builds/evidence lived under `/private/tmp` and are not durable. The authoritative numbers are in
  the linked GitHub comments below.

| Commit                                   | What                                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| 3aa1b5622000b9ebf1d0db3043f50c1c3ec55bf0 | Current-main product ref used by the campaign                   |
| 7df72dc51c36468e05b28a30ab878b7dd2c159e9 | Pre-#739 audio A/B base                                         |
| 21a5180effb4059ead777b733285e2e4052ff9da | Local prior-handoff consumption commit; not part of this branch |

Files touched by this packet: only `docs/handoff/ipad-findings-fixes.md`.

### Campaign ledger

| Owner                | Disposition / durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #943              | **Confirmed bug:** trusted Safari second-tap closes Brush/Stroke menu but focus falls to `BODY`; trigger focus retained 0/20. [Evidence](https://github.com/KyleMit/Splotch/pull/943#issuecomment-5265698151)                                                                                                                                                                                                                                   |
| PR #957              | **Confirmed feature, performance failure:** Magic coloring and screenshot work, but page selection measured 22 ms P95 and Magic stroke reached 149 ms first response / 138 ms post max. [Evidence](https://github.com/KyleMit/Splotch/pull/957#issuecomment-5265486180)                                                                                                                                                                         |
| PR #682              | Custom-color gap closed 4/4 web/native. Broader Safari watchpoints: theme dark→light 28/29 ms P95/max, inked rotations 22–25 ms P95, screenshot one 34 ms max. Native paths passed except idle baseline. The full action runner also has invalid branches. [Evidence](https://github.com/KyleMit/Splotch/pull/682#issuecomment-5266644551)                                                                                                      |
| PR #739 / issue #709 | Audio first-ready improved ~4.2× Safari and ~3.1× native. Native sound-off 2/2 zero audio work. Native positive gain appeared in 10/12 valid confirmation strokes; Safari automation never reached a running context on either A/B ref. Speaker output uncaptured. [PR evidence](https://github.com/KyleMit/Splotch/pull/739#issuecomment-5266964021) · [issue evidence](https://github.com/KyleMit/Splotch/issues/709#issuecomment-5266964651) |
| PR #790              | Cleanup passed: follow-up scroll changed 944 CSS px and fresh tap worked. Exact staggered partial lift remains inconclusive because XCTest collapsed both pointers to simultaneous cancellation. [Evidence](https://github.com/KyleMit/Splotch/pull/790#issuecomment-5266256264)                                                                                                                                                                |
| PR #720              | **Human Pencil required.** Appium/WDA cannot originate trusted pen input. [Protocol](https://github.com/KyleMit/Splotch/pull/720#issuecomment-5266854192)                                                                                                                                                                                                                                                                                       |
| PR #788              | **Human Pencil required.** Clear→draw and drag-to-clear stylus protocol is staged. [Protocol](https://github.com/KyleMit/Splotch/pull/788#issuecomment-5266853540)                                                                                                                                                                                                                                                                              |
| PR #964              | Physical safe-area/loading/reveal/report/dismissal geometry passed. [Evidence](https://github.com/KyleMit/Splotch/pull/964#issuecomment-5265338968)                                                                                                                                                                                                                                                                                             |
| Issue #850           | Current iPad orientation-control premise retired; resized-window layout validated and issue closed. [Evidence](https://github.com/KyleMit/Splotch/issues/850#issuecomment-5265863483)                                                                                                                                                                                                                                                           |
| Issue #949           | Native blob fetch and real production report flow passed; test support issue verified/closed and #949 closed. [Evidence](https://github.com/KyleMit/Splotch/issues/949#issuecomment-5265593746)                                                                                                                                                                                                                                                 |
| PR #729              | Superseded/quarantined; current validation belongs to #739/#709. [Pointer](https://github.com/KyleMit/Splotch/pull/729#issuecomment-5266978955)                                                                                                                                                                                                                                                                                                 |

Retired/dormant: #683 and #919 retired; #956/#892 and #698 intentionally dormant; #729 superseded.
Do not create work merely to “test” them again.

## Decisions made (and why)

### Autonomous queue and order

1. **File focused issues first.** Search found no dedicated open issues for the newly measured
   focus, runner, Magic, or watchpoint findings. Use the GitHub connector first and link the
   evidence above. Apply `reviewed` only after each issue is clear/actionable/correctly labelled per
   `docs/ISSUE-WORKFLOW.md`.
2. **Fix Safari flyout focus first.** The failure is deterministic (0/20) and bounded. Relevant
   code: `web/src/lib/components/ActionsPanel.svelte:217-233`,
   `web/src/lib/components/BrushControl.svelte:36-48`, and
   `web/src/lib/actions/scribbleGuard.ts:121-228`. Real trace: option focused → trusted pointerup
   closes and focuses trigger → Safari later focusouts trigger → trusted trailing click (`detail=1`)
   leaves `BODY`; `scribbleTap` correctly ignores that click for activation. Preserve outside-tap
   no-restore behavior and keyboard/AT `detail=0` activation. Acceptance: 10/10 Brush + 10/10 Stroke
   second taps retain exact trigger focus after a 500 ms negative window, plus Escape, option pick,
   mutual exclusion, and outside dismissal remain correct.
3. **Repair the iPad action harness before performance fixes.** Current invalid paths: Parent Center
   opens a parental gate but runner expects sidebar `aria-current`; disabling Advanced hides the
   next target; one installed coloring book skips the book-choice dialog; native Screenshot mapped
   its target to the window edge and timed out. Fix the action plan/state machine and add regression
   tests; do not classify these harness failures as product failures.
4. **Reproduce and isolate Magic/coloring performance.** Use at least one warmup + five scored
   focused physical runs on Safari and native before changing code. Follow ADR-0091's overlay and
   worker-raster isolations and retain correct visible fill/preview. Do not infer from the single
   custom script alone. If reproduced, fix the causal blocking operation; acceptance is ADR-0090's
   first/worst ≤33.5 ms and post P95 ≤20 ms, with correct first Magic stroke.
5. **Re-run the smaller Safari misses with ten repeats each before filing implementation PRs:**
   dark→light theme (ADR-0087), inked rotation both directions (ADR-0089), and Screenshot
   (ADR-0088). Fix only repeatable action-attributed failures. The 34 ms Screenshot sample is only
   0.5 ms over the gate and may remain a watchpoint; do not tune to one sample.
6. **Audio is autonomous diagnosis first, user-assisted proof last.** Add a durable, test-only early
   cold-audio probe/runner only if it can remain out of production bundles, then reproduce the 10/12
   positive-gain result with a controlled input-speed trace. Do not change production audio merely
   because Safari Remote Automation stayed suspended: both A/B refs behaved that way. Native source
   start was 1–2 ms after trusted pointerdown and current readiness was already materially better.
   Defer acoustic assertion until the final user-driven stage.

### Finish-before-prompt rule

The session may discover that user input would be helpful while a fix branch is active. Record that
need, finish the active fix first, and continue any other independent autonomous work. Before asking
the user, require all of:

* no uncommitted product changes;
* no running owned Appium/server process;
* active PR review threads addressed and CI terminal;
* attached iPad restored to observed starting settings;
* issue/PR updated with exact status and evidence;
* next human action staged so the user only supplies the physical gesture/audio observation.

### Approaches rejected

* WebDriver `.click()`, JavaScript-dispatched events, or CDP are not substitutes for trusted Safari
  pointer behavior; they hide the focus bug and do not satisfy `scribbleTap`/autoplay authority.
* Appium `pointerType: pen` is not Pencil: XCUITest driver 12.1.3 rewrites pointer sources to touch
  and WDA 16.1.0 rejects non-touch. Low-level HID has no digitizer coordinates/pressure/transducer.
* Appium screen recording has no audio. `mobile: startAudioRecording` records a host AVFoundation
  input and needs Appium's `xcuitest:audio_record`, ffmpeg, permissions, and the iPad enabled as an
  Audio MIDI input.
* XCTest/WDA's two paths did not preserve staggered partial lift; simultaneous `pointercancel` is an
  inconclusive transport result, not a product failure.
* Do not relax gates or rewrite ADR architecture to make current numbers pass. Physical Safari is
  authoritative per ADR-0090.

## Unverified assumptions

`resume-handoff` must test these before implementation:

* `origin/main` may have advanced beyond 3aa1b562; verify whether any finding was fixed or gained a
  dedicated issue after 2026-08-12. Re-run searches before filing to avoid duplicates.
* The 0/20 Safari focus failure should reproduce on the latest build with the same trusted trace;
  the likely fix location is known, but no product fix was attempted.
* The Magic/coloring numbers came from a custom current-main physical run and need a fixed harness +
  focused repeat before causal claims.
* Theme, rotation, and Screenshot misses may be sample variance. Ten focused repeats are required.
* Native's two zero-positive-gain samples may reflect speed calculation/event cadence rather than
  the #739 lifecycle. Capture speed/requested-gain inputs before changing audio code.
* No Apple Pencil pairing state can be queried. A real first `isTrusted && pointerType === 'pen'`
  event is the availability gate.
* Host audio setup may have changed. At campaign time `ffmpeg`/`ffprobe` were absent and
  `system_profiler SPAudioDataType` listed no input devices.
* Raw `/private/tmp` campaign files may be gone. GitHub comment tables are durable; do not claim raw
  artifacts exist until checked.

## Done & verified

Physical campaign ran against the device/stack listed above. Durable verified outcomes:

* PR #943: standard Brush/Stroke action timings passed; physical second-tap focus failed 0/20 while
  Escape, keyboard pick, mutual exclusion, outside dismissal, and geometry passed.
* PR #682: current custom-color web/native activation passed 4/4 with first P95 7–9 ms and post
  P95/max 17 ms. Native canvas/rotation and Settings/theme passed focused gates. Broader Safari
  watchpoints and runner-invalid branches are recorded in its comment.
* PR #957: Screenshot action passed; Magic/coloring feature visuals passed, with the recorded timing
  failures.
* PR #964 geometry passed in portrait/landscape; #949 flow passed and closed; #850 resized layout
  passed and closed.
* PR #790 cleanup proof passed after the cancelled two-pointer gesture: 944 CSS-px fresh scroll,
  zero zoom drift, fresh trusted theme tap worked.
* Audio A/B: Safari scored ready median 259→61 ms; native 295→96 ms. Native sound-off produced zero
  audio events in 2/2 process-cold launches. Sound/local+durable setting restored true afterward.
* GitHub evidence posted to every owner listed in the ledger.
* Final cleanup: main worktree clean, Windowed Apps restored, Sound on, current build installed,
  owned Appium and preview sessions stopped.

No product fix, focused issue, or fix PR has yet been created from these findings.

## Risks & next 3 steps

1. **Reconcile and file.** Resume the packet, delete it per the skill, fetch current `main`, search
   GitHub for duplicate fixes/issues, then file the focused focus/harness/Magic issues with the
   ledger evidence. Start the deterministic Safari focus issue immediately.
2. **Autonomous fix train.** Complete focus → harness → Magic/coloring → repeatable watchpoints →
   autonomous audio diagnosis, one issue/branch/PR at a time. For every visible change use
   `pr-screenshots`; for every PR use an independent fresh review and address it; run relevant unit,
   Playwright, and physical-iPad checks; do not start the next fix while one is unresolved.
3. **Stage user-driven closeout only after step 2 is terminal.** Prepare Appium sessions and
   recorders before prompting. Then ask once for: (a) Apple Pencil contact/trials for #720/#788, and
   (b) either permission/setup for host iPad audio capture or a human audible cold-stroke
   confirmation. Finish the current autonomous fix before sending that prompt.

## User-driven stage (do not enter early)

When the autonomous queue is finished, make the user's part small and concrete:

1. **Pencil availability gate:** open the prepared current Safari/native target and ask the user to
   touch once with the Pencil. Accept only a trusted `pointerType='pen'` / Safari
   `touchType='stylus'` trace.
2. **PR #788:** Appium prepares/reset/asserts; user performs ten Pencil Clear tap→long-stroke trials
   within 450 ms and five Pencil drag-to-clear controls. Every stroke must be visible/undoable and
   drag clear must work normally.
3. **PR #720:** Appium prepares/reset/asserts; user performs 20 normal/edge swatch taps, 20 rapid
   tap→draw trials, and five slide-off negatives. If no missing-up stream appears after 20–50 tries,
   report normal Pencil path passed and recovery branch not reproduced.
4. **Audio:** first prefer configuring objective capture: enable iPad in Audio MIDI Setup, install
   ffmpeg, grant microphone permission, and restart Appium with
   `--allow-insecure=xcuitest:audio_record`. If the user declines, stage a synchronized current-main
   cold launch and ask for the smallest human audible confirmation. Do not equate page scheduling
   with acoustic proof.

Post results to the existing PRs/issues and close only when their exact hardware done-when is met.

## Reread first

* Skills: `.agents/skills/resume-handoff/SKILL.md`, `.agents/skills/mobile/SKILL.md`,
  `.agents/skills/testing/SKILL.md`, `.agents/skills/profiling/SKILL.md`,
  `.agents/skills/adrs/SKILL.md`, `.agents/skills/architecture/SKILL.md`.
* GitHub workflow: `docs/ISSUE-WORKFLOW.md`; use the native GitHub plugin/app first.
* Focus code: `web/src/lib/components/ActionsPanel.svelte:217`,
  `web/src/lib/components/BrushControl.svelte:36`, `web/src/lib/actions/scribbleGuard.ts:121`.
* Audio code: `web/src/lib/audio/drawingSound.ts:1`, `web/src/lib/drawing/earlyBoot.ts:46`,
  `web/src/lib/drawing/engine.ts:845`.
* Profiling: `docs/PROFILING-IPAD.md`, `docs/PROFILING.md`.
* Architecture/metrics: ADR-0087 (theme), ADR-0088 (Screenshot), ADR-0089 (rotation), ADR-0090
  (physical action gates), ADR-0091 (coloring/Magic), ADR-0076 (Settings pinch), ADR-0084 (trusted
  XCUITest input).
* Durable evidence: the Campaign ledger links above; do not depend on `/private/tmp` survival.
