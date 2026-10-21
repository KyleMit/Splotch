# RN bug-hunt checkpoint

Candidate b236d639160459eecd60900926c759af5d4ae080. Phase 4 reached, with partial Android
public-flow coverage and blocked host-browser admission. Work remains uncommitted for the
orchestrator. Product source, dependencies and protected lanes are unchanged.

The source-backed plan contains **63 cases**. Execution counts below refer to bounded subchecks;
many plan cases still have unrun subcases. `results/case-ledger.json` defines the 62 Android
subchecks and their evidence. `results/supplemental-web-ledger.json` lists the 14 supplemental web
checks. `evidence-manifest.json` records file sizes and SHA-256 digests, excluding itself.

| Surface                                      | Completed evidence                                                                                                                                                                                                          | Blocked or incomplete                                                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host Chromium                                | RN export, startup and precache checks passed                                                                                                                                                                               | Browser aborts at Mach-port registration before page creation; requested phone/tablet/desktop UI cells unrun                                                                                       |
| Host WebKit                                  | Launch attempted                                                                                                                                                                                                            | Playwright runner abort trap 6; all three UI profiles unrun                                                                                                                                        |
| Host Firefox                                 | Launch attempted                                                                                                                                                                                                            | Headless process SIGABRT; all three UI profiles unrun                                                                                                                                              |
| Android API 36 emulator                      | **62 public-flow subchecks passed**: drawing/tools/history, Settings/gates/preferences, actual saves and cooldown, offline library/cold launch, font/theme/rotation, trim/resume/restart, and 60-second five-contact stress | Detailed unrun scope below; synthetic input and screenshots do not establish physical or speech acceptance                                                                                         |
| Android Chrome 133 supplemental              | **14 checks passed** through CDP: five core checks plus AI prompt, fixture result, confirmed fixture report, IndexedDB originals and five error/refusal/retry scenarios                                                     | Android Chrome rejects new browser contexts and ignores the requested device metrics; actual viewport varies with browser chrome/fullscreen, so this cannot fill the requested host-profile matrix |
| Mounted native RSD + targeted tool contracts | **219 passing tests**: 131 existing RSD tests, 13 slider tests including four additions, and 75 targeted tools tests                                                                                                        | Platform seams do not establish browser/device parity                                                                                                                                              |

**Three new product defects met the two-reproduction threshold:** RN-ANDROID-001 (S2), AI Art's
lower settings cannot be scrolled into view at normal phone font size; and RN-ANDROID-002 (S3), a
focused unselected Theme segment ignores Enter, Space and D-pad center; RN-ANDROID-003 (S1), API 28
exports omit all drawn ink. Each has two fresh-process reproductions and a passing positive control.
See `findings.jsonl` and `results/android-second-run.md`. The early Magic fragmentation is closed as
a **test-script artifact**: the original first input batch combines a 1.5 s timestamp gap with an
approximately 870 px jump. The production contact recovery policy deliberately splits a contact
after both a >100 ms gap and a jump above 10% of the paper's short edge (`contactResponder.ts`,
shared `strokeMath.ts`). Three corrected trials flush a synchronization event before the
registration wait and follow a spatially continuous curve. Their first-move gaps are
14.26/13.35/16.53 ms, maximum gaps 28.70/26.21/24.28 ms, and maximum jumps 48.01 px. Each produces
exactly one connected ink component and one Undo restores the exact blank paper digest. See
`evidence/android-run2-magic-corrected-verdict.json`, traced inputs, PNGs and
`repro/android-run2-magic-analyze.mjs`. This observation is not a finding.

The first two added tests in `tools/migration/tests/rsd-native-settings-sliders.test.mjs` exercise
responder termination through the real Settings owners. Two continuation additions reject foreign
contact moves through those same owners; all 13 slider tests pass. Their separate transform-only
negative control makes exactly the foreign-contact additions fail (11 pass, 2 fail). The first
termination control below describes the earlier 11-test checkpoint. They stop Volume/audio and
Button Size/drawer previews, preserve the last saved value, reject stale moves, and allow a new
Volume drag. All eleven slider tests pass. A temporary compile-time transform replacing termination
with a no-op makes exactly both additions fail (9 pass, 2 fail, exit 1). Product files are untouched
by this negative control. See `results/mounted-regressions.md` and
`repro/slider-negative-control.mjs`.

Type checking, full formatting and documentation-reference checks passed. Full lint passed with two
existing unused-variable warnings; edited-file lint is clean. RN export/startup/precache checks
passed. No full Playwright suite, commits, pushes, GitHub writes, real AI generation, key or access
code was used. The brief's APK appeared after the initial missing-file check and installed
successfully; the source binding is supplied by the orchestrator, with the artifact digest recorded
locally.

## First-run remaining coverage (updated by Android continuation)

The requested nine host-browser/profile combinations are blocked before UI admission. Shipping web
was therefore not built for an interactive comparison. Android AI generation/report/retry flows
cannot safely use browser `/api` fixtures through the installed app's hosted transport; those device
flows remain blocked. The mounted AI tests and the supplemental web success/report/error/retry
checks did run with fixtures.

iOS is skipped as instructed. Screen-reader speech, physical contact/coalescing/palm behavior,
audio/haptics, real OS installation and permission behavior are not established by this run.

Other manual subcases were not reached in this first run. Execution prioritized public drawing,
lifecycle, settings, gates, actual file publication and safe AI fixtures. Unrun subcases include
Crayon/Magic widths, brush/contact combinations outside the ledger, brush-specific dots beyond Pen,
edge crossings, picker drag/recall, precise motion, remaining Settings mutations and slider extrema,
Parent Center policy modes and confirmation, uncached download/Data Saver/retry, actual auto-save
and save failures, text-field shortcut isolation and segmented-choice arrows, AI polling/timeout,
throttling/offline, AI download/minimize and full retention lifecycle, PWA runtime offline/update
and directory-picker behavior. Font coverage is limited to the inspected hub, Accessibility and
dark-mode states and does not close known issue 2985.

The existing known-fixed issues are not re-filed. No final parity inventory rows are promoted by
this diagnostic campaign.

## Harness corrections preserved

UIAutomation can fail during the gate countdown while leaving an old XML file. The driver now
removes old XML and validates dump completion. Timed gate states use direct frames. Earlier timer
logs are explicitly invalidated in the Android results. Rotation uses the emulator sensor;
user_rotation alone did not turn it. Settings gestures wait for the dialog to land, and tap centers
outside scroll bounds are refused. Browser Settings lookups are scoped to the dialog to avoid the
root Coloring books button. `repro/README.md` records starting screens and restoration duties. The
follow-up corrected two wrong harness expectations: Tool Drawer master leaves Camera/Coloring
independent, and removed stroke/point caps leave the shared 20-action Undo depth intact. Invalid
takes are retained and explicitly labeled; corrected full runs passed. Supplemental AI error tests
also wait for source-owned engine/control readiness stamps and a settled root and use independent
origins. Earlier input and pre-upload failures remain unconfirmed; later admitted
error/refusal/retry sequences passed.

The emulator OS settings were restored after their tests. Final process/server/forward cleanup is
recorded in `status.md`. The pre-existing untracked Android `.kotlin/` directory was left untouched.

## Android continuation — final counts

Android-only continuation completed through final verification at 08:18Z. Host-browser work belongs
to the separate worker; the host table above is historical first-run evidence. Counts are bounded
native subchecks, including repeat stress trials, not a claim that every axis of the 63-case plan
was covered. `results/android-device-ledger.json` carries each row and its evidence.

| Device                       | Pass | Fail | Blocked | Unique reproduced defects            |
| ---------------------------- | ---: | ---: | ------: | ------------------------------------ |
| emulator-5680, API 36 phone  |  161 |    3 |       0 | RN-ANDROID-001 S2; RN-ANDROID-002 S3 |
| emulator-5682, API 36 tablet |   34 |    0 |       0 | None                                 |
| emulator-5684, API 28        |   51 |    4 |       2 | RN-ANDROID-003 S1                    |

The phone's requested remaining public-flow coverage is closed: Crayon/Magic widths and brush
combinations, dots and paper edges, picker drag/recall, available Settings mutations and slider
extrema, all five Parent Center policy rows and confirmation lifetime, metered download interruption
and retry, actual auto-save and retained save-failure retry, text-field shortcut isolation and
segmented-choice keyboard behavior. Auto-Save AI's switch remains unreachable at normal phone size
because of RN-ANDROID-001; it was not forced through a private state mutation. No real AI request,
key or access code was used. Live native AI result/report/retention flows remain untested under the
brief's fixture/spend limits.

The early Magic observation is a script artifact: three gap-corrected, spatially continuous trials
produce one ink component and exact Undo. It is not in findings.jsonl.

Phone robustness ends alive throughout the selected scenarios: four lifecycle scenarios twice, 2,000
strokes followed by a same-PID 2,000-stroke repeat, and five recorded Monkey seeds at 3,000 events
each with the requested percentages and throttle. The verified Monkey batch has successful raw
logcat reads, no scoped fatal/Dropbox/error screen, zero connected network time and zero dropped
keys/pointers/trackballs. The first five-run batch is retained with its original logcat gap; the
second closes that gap. Total Monkey input across both batches is 30,000 events from five seeds used
twice. The repo classifier is unchanged; its timestamp argument is corrected only in the
source-guarded in-memory adapter, with a positive/negative log-marker control.

Tablet landscape/portrait layout, two-finger drawing, seven font-2 section checks and two calibrated
rotation trials pass. API 28 adds calibrated one/two/five-contact drawing and erasing, permission
publication, core Settings/gate/coloring flows, eight font-2 Close checks, lifecycle and 2,000
strokes. Its two explicit COMPLETE requests were rejected by Android's existing trim-level guard;
these supplementary older-device checks are blocked, with alive PIDs. Phone COMPLETE requests pass.
The single API28 font-2 hardware-key gate observation did not enter digits; the touch-keypad layout
repeat passes. That keyboard observation is unconfirmed and is not a finding.

### Memory observations — flagged, not leak findings

PSS is whole-process resident memory in KiB. Clear intentionally retains its picture for Undo;
post-eviction samples follow 20 new actions and a further 30-second wait.

| Run                       | Baseline | Stroke 2,000 | Clear + 30 s | Eviction + 30 s | Retained difference |
| ------------------------- | -------: | -----------: | -----------: | --------------: | ------------------: |
| Phone first cycle         |  161,285 |      244,996 |      235,603 |         238,802 |  +77,517 (75.7 MiB) |
| Phone same-PID warm cycle |  246,386 |      266,453 |      253,109 |         255,155 |    +8,769 (8.6 MiB) |
| API 28 first cycle        |  199,569 |      238,225 |      235,388 |         237,602 |  +38,033 (37.1 MiB) |

The warm phone cycle starts and ends with byte-identical 20-dot paper. It does not repeat the first
cycle's growth at the same magnitude. A subsequent background COMPLETE request reduces PSS from
255,111 to 225,558 after 30 seconds; return/input/Undo + 30 seconds measures 240,838. Paper and Undo
remain exact, with the same PID and an alive verdict. These observations do not establish unbounded
growth or a physical-device memory budget. Raw meminfo, timing, inputs and frames remain available.

### Restoration and limitations

All three devices pass final verification: phone 19 checks, tablet 10, API28 12. The installed APK
bytes match the supplied artifact on every device. App processes are stopped, controls collapsed,
font/rotation/sensor/night/network states restored, phone Monkey OS differences restored, and both
storage grants/user flags on API28 restored to denied/zero. Tablet immersive confirmation is
restored to its inferred unconfirmed state; its exact original key value was not captured. Phone and
API28 empty-string immersive values were captured and restored exactly.

The phone's earlier transport failure is resolved. The recovered guest had a recent boot and no
installed Splotch package; the cause is not established. The identical APK was reinstalled. The
owned private adb server and socket were removed, both tagged firewall rules verified absent, and a
serial-only reconnect/registration restored the phone through the shared adb server. The shared
server and user-started emulator processes were never restarted. Original raw errors and corrected
script takes are separated in results and reviewed ledgers.

Type checking, full lint and documentation-reference checks pass; lint has the same two existing
unused-variable warnings. Full formatting and QA-helper lint pass; the final hash manifest is
generated after report edits. Product source and dependencies are untouched. The only tracked edit
is four mounted slider regressions (76 added lines), with 13 passing slider tests and
deliberate-break controls; 219 mounted/targeted tests passed across the campaign. No commit, push,
GitHub write or real AI generation occurred.
