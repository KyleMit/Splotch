# Progress

* Started: reading the brief and beginning Phase 1.

* 01:55Z Phase 1: source-backed regression plan written; RN web production build in progress.

* 01:57Z Phase 1 ended: plan complete; Chromium phone results started, browser admission blocked by
  Mach-port sandbox denial. RN export/startup/precache checks passed.

* 01:57Z Phase 2 ended with blocker: WebKit aborts and Firefox SIGABRT before page creation too; all
  three browser logs preserved. No web UI passes claimed.

* 01:57Z Phase 3: emulator-5680 reachable, API 36; supplied Release APK path missing and probe not
  installed. Requested corrected path; continuing Phase 4 mounted regression work meanwhile.

* 01:59Z Phase 3 resumed: APK appeared and installed; dismissed first-run immersive guidance after
  checking foreground. Phase 4: 131 existing mounted tests passed; 11 slider tests passed including
  2 additions; transform-only no-op termination control fails both additions (exit 1).

* 02:00Z Phase 3: three adb swipes -> exactly three enabled Undo presses; uinput single continuous
  contact -> one Undo. First capture helper refined to wait three identical frames after 1 s; early
  frames retained as diagnostic takes. Full same-path admission follow-up queued.

* 02:03Z Phase 3: native Pen/Crayon/Magic/Eraser strokes captured; seven Settings sections
  navigated; hardware keypad deletion/Enter solves Parent Center; Save publishes owned MediaStore
  PNG. Phase 4: 75 targeted tools tests pass; full check passes; full lint passes with two existing
  warnings.

* 02:05Z Phase 3: inspected font_scale 2.0 Settings hub and Accessibility. Rotation take via
  user_rotation was invalid (sensor remained portrait); follow-up will use emulator sensor, matching
  existing parity driver. No orientation defect inferred.

* 02:11Z Phase 3 harness correction: uiautomator can print "could not get idle state" during a gate
  countdown while leaving an old XML file. Driver now deletes the old XML and checks dump
  completion. Timer takes use direct screenshots; stale XML takes retained and invalidated. No
  product defect inferred.

* 02:13Z Phase 3: fresh lockout test now passes, correct destination opens after 35.5 s; earlier
  timer takes invalidated. Cached eight-book grid and bundled Farm pages open in airplane mode;
  exercising page art/Magic/Clear/Save next.

* 02:17Z Phase 3: android-magic-control completed, exit 0; inspect its evidence before assigning a
  product verdict.

* 02:19Z Phase 3: android-stress completed, exit 0; inspect its evidence before assigning a product
  verdict.

* 02:19Z Phase 3: android-memory-lifecycle completed, exit 0; inspect its evidence before assigning
  a product verdict.

* 02:20Z Phase 2 supplemental setup: owned RN static server PID 32349 on port 6100; created
  emulator-only reverse tcp:6100 and forward tcp:6111 to Chrome debug socket (no prior reverse).
  Remove both mappings and stop server after this batch.

* 02:30Z Phase 4: summary and 36-check Android ledger written; 217 tests pass, 2 new slider tests
  reject the deliberate break. Supplemental Android Chrome core has all 5 checks passing; AI fixture
  pass in progress. Native OS settings and initial Portrait/collapsed drawer restored. No reproduced
  product findings.

* 02:33Z Phase 4: supplemental web core 5/5 passed; AI fixture image displayed. Refining the report
  harness: fresh origin 6102 avoids reused browser storage; server PID 46035 (6100 server stopped).
  Owned mappings now forward tcp:6111, reverse tcp:6102.

- 02:37Z Phase 4 cleanup: native phase ended with 36 passing subchecks; supplemental web has 9
  passing checks (including fixture generation/report and IDB original retention). No reproduced
  product defects. Stopped both owned static servers, removed forward 6111 and reverses 6100/6102,
  stopped owned Chrome, deleted owned emulator input fixtures, returned probe to root. Verified OS
  defaults restored. Final lint/format and evidence manifest verification in progress.

- 02:42Z Phase 4 follow-up: host-browser matrix remains blocked; continuing runnable native
  subcases. Optional tools off correctly hides Brushes/Stroke width/Undo while Save/Coloring remain.
  Persistence and canceled Clear gesture checks in progress.

- 02:44Z Phase 4 harness correction: the Tool Drawer master hides drawing tools only; Camera and
  Coloring have independent controls. First assertion expected the whole dock to disappear and is
  invalid. Source and screenshot agree. Corrected rerun in progress, with settings restored before
  retry.

- 02:46Z Phase 4 follow-up: corrected native tool-preferences driver passes all 4 checks, including
  five hidden choices and master-switch persistence across process restart. All toggles restored.
  Clear cancellation/Undo pixel comparison now running; 25-command history and Pen/Eraser width
  checks queued sequentially.

- 02:48Z Phase 4 plan correction: accepted stroke/point-cap removal does not remove the shared
  20-action Undo depth. Initial 25-Undo expectation was wrong; model.ts imports shipping
  MAX_UNDO_DEPTH and its existing test pins the cap. Preserved invalid take; corrected D11 and
  driver to verify 20 Undo steps retain the five oldest dots.

- 02:49Z Phase 4 follow-up: short and reversed Clear preserve byte-identical paper; full Clear
  equals the original blank crop; Undo exactly restores ink (4 checks pass). Corrected deep-history
  run reaches shared depth 20 with five oldest dots intact; hardware-shortcut checks in progress.

- 02:50Z Phase 4 follow-up: corrected D11 passes: 25 dots, 20 Undo steps, five oldest dots
  byte-identical to base, extra Undo preserves them. Ctrl+Z removes a fresh stroke and Escape closes
  Brushes. Pen/Eraser five-width output checks now running with controlled 16 ms paths.

- 02:55Z Phase 4 follow-up: 51 native subchecks recorded. Pen and Eraser five-width scans match
  source within 2 px at density 420; size 3 restored for both. Warm-cache cold launch in airplane
  mode (Wi-Fi disabled) admits drawing. Settings preference round trips in progress; no reproduced
  product findings.

- 03:00Z Phase 4 follow-up: 59 native subchecks recorded. Eight public preference round trips pass:
  Camera/Auto-Save, Coloring (cached books retained), Reduce Motion, Sound master/sources, and
  Dark/Flat. All restored. Native save cooldown burst running; supplemental Android Chrome AI
  error/retry fixture batch prepared for after native phase cleanup.

- 03:01Z Phase 3 follow-up ended: 62 native subchecks recorded. Eight-tap Save burst produces one
  owned published PNG; drawing continues and a later Save produces one more. Final native
  preferences restored; restart/collapse/OS-state capture in progress before supplemental browser
  fixture phase.

- 03:01Z Phase 2 supplemental AI errors: native phase cleanup complete, OS state verified. Started
  owned static server PID 17132 on 6103 (session 63653), forward 6111 and reverse 6103 after
  confirming both ports unused and no existing reverse. Chrome opened to fresh fixture origin;
  errors/retry/refusal only, all APIs intercepted.

- 03:06Z Supplemental AI first batch: malformed JSON/retry and safety refusal pass. Two setups did
  not admit ink; wrong-content-type retry reached rest state without a second upload (unconfirmed,
  not a finding). Preserved first batch. Rerunning with source-owned engine/control readiness
  stamps, settled root, and independent origins 6104–6108 (owned reverses to server 6103); prior
  owned AI tab navigated blank.

- 03:13Z Phase 2 supplemental follow-up ended: five admitted AI error/refusal cases pass, including
  one explicit retry to fixture success for each retryable response. Total supplemental web checks
  14; native 62; unique positive tests 217. Isolated bare-502 follow-up passed. No new defect meets
  the two-reproduction threshold. Server 17132 stopped, forward 6111 and reverses 6103–6109 removed,
  Chrome stopped, probe returned to blank/collapsed root. Owned host ports verified closed. Final
  formatting/lint and manifest verification next.

- 03:16Z Phase 4 first-run closeout: plan has 63 cases; ledgers have 62 native and 14 supplemental
  web passing subchecks; 217 unique positive tests pass. Both new slider tests fail under the
  deliberate transform-only break. Type check, full format check, doc-reference check and full lint
  pass; lint has two existing warnings. findings.jsonl remains empty; residual coverage and
  unconfirmed observations are explicit in summary/results. Only the regression-test file and
  campaign package changed; pre-existing .kotlin directory untouched. Cleanup verified. Evidence
  manifest generated and hash-verified as the final artifact.

- 03:20Z Second run started. Android only: phone remaining coverage, five offline Monkey seeds,
  lifecycle and 2,000-stroke load, then tablet and API 29 sequentially. Deadline approximately
  08:30Z. First-run manifest preserved as evidence-manifest-first-run.json; current manifest will be
  refreshed at closeout. No commits or product changes.

- 03:23Z Phone Crayon width capture shows all five increasing widths. The initial one-column
  pixel-count assertion was invalid for textured Crayon (holes vary by column); preserved that log
  and corrected the measurement to the vertical envelope across the line. No defect filed.

- 03:27Z Second drawing setup invalidated: selecting Purple after Magic intentionally returns to the
  last ink brush (RsdEdgeControls.tsx:299). Stopped the owned batch and preserved invalid Magic
  captures under android-run2-invalid-Magic-swatch*. Corrected order: color before brush. No product
  defect.

- 03:31Z Phase 1 phone coverage continues. Added two mounted regression cases in
  rsd-native-settings-sliders.test.mjs: Volume and Button Size follow the original finger when a
  second finger moves, and ignore that second finger after the original leaves. All 13 slider tests
  pass. Transform-only negative control makes touchPageX accept the wrong contact: exactly the two
  new cases fail (exit 1). Product source untouched. The first positive setup hid Volume by
  disabling Sound; corrected to the existing pencil-loop fixture before counting the pass.

- 03:38Z Drawing review: Crayon/Magic five rendered envelopes are 6/12/22/38/58 px; each brush's
  1/2/5-contact cohort undoes to the exact baseline paper digest. Pen/Crayon/Magic dots pass. Two
  spatially continuous Magic curves each have one connected ink component. Their getevent traces
  expose a 1.5 s artificial first-event timestamp gap from uinput's first-batch timestamp. The
  original fixture also jumps ~870 px at that point, exceeding dropped-pointer recovery's 100 ms /
  10%-of-paper thresholds. Preparing two original-versus-calibrated traced comparisons before
  closing the unconfirmed fragmentation observation.

- 03:41Z Magic observation closed as a test-script artifact: three corrected traced trials each have
  one connected ink component, 13–17 ms first moves, <29 ms maximum gaps, 48 px maximum jumps and
  exact blank restoration by Undo. No finding. Phone remaining-coverage batch resumed.

- 03:53Z Phone drawing follow-up: Eraser 1/2/5 contacts and dot, plus Pen/Crayon/Magic edge
  crossings, all change paper and Undo exactly. Corrected picker drag yields 13,699 final-color
  pixels and exact visual recall. Volume 0/100 and Button Size 70/130 persist across restart;
  originals restored (50/100). Relative-distance and absent-selected-attribute harness errors
  retained and corrected, no findings inferred.

- 04:06Z Parent Center corrected sweep complete: 17 subchecks pass, including all row modes,
  per-session reuse/re-arm on restart, Never confirmation cancel/confirm/persistence, and Every-time
  restoration/re-arm. Orientation six checks and Pen 2/5-contact exact Undo also pass. Device ledger
  now 121 passing phone subchecks. Metered/slow coloring download, interruption and recovery batch
  started.

- 04:23Z Phone checkpoint: 131 bounded subchecks pass. Both save-failure trials survive restart and
  retry to exact reference pixels; staging cache and Auto-Save on Delete restored. AI
  preference/keyboard batch paused at an offscreen switch guard. Repeated adb swipes did not move
  the AI body; two fresh-process kernel-touch probes plus a Parent Center scrolling positive control
  are running before assigning any product finding. Wi-Fi/data remain off for this phase. Original
  AI values captured: Customize on, Auto-Save AI off; Create AI was originally off.

- 04:27Z RN-ANDROID-001 filed locally (S2): AI Art lower controls unreachable at normal font,
  repeated in two fresh processes with calibrated 61-frame kernel swipes; Parent Center scroll
  positive control passes. No product edit. Original AI prefs restored (Customize on, Auto-Save AI
  off, Create AI off); network restored. Independent keyboard-only batch started offline.

- 04:37Z RN-ANDROID-002 filed locally (S3): two fresh processes focus unselected Dark but
  Enter/Space/D-pad center cannot activate it; touch controls pass. System theme restored.
  Text-field Ctrl+Z preserves exact paper and Escape closes Settings. Device ledger: 134 pass / 3
  failed bounded phone subchecks, representing two unique defects. Single-optional brush/fallback
  combinations running before required robustness.

- 04:43Z Phone remaining-coverage phase ended: 140 pass / 3 failed bounded subchecks (two unique
  twice-reproduced defects). Six single-brush/fallback checks pass; all preferences restored.
  Required five-seed offline Monkey phase started: 3,000 events each, throttle 50 ms, all four
  specified system/navigation percentages zero, package-restricted. Per-app tagged network fences
  protect the no-AI-spend limit; each seed starts from an owned app snapshot and ends with repo
  verdict probes.

- 04:55Z Phone harness blocker after all five Monkey runs passed: shell commands and
  emulator-console ping/status stop responding (8–45 s timeouts), while host get-state still says
  device. Serial-scoped reconnect also times out. No shared adb-server reset or other device was
  touched. OS diff caught brightness/airplane changes; scoped restore commands completed before the
  transport stalled, but the final namespace verification is pending. App snapshot restored and both
  tagged firewall rules verified removed. Phone lifecycle/2,000-stroke phase deferred while testing
  the tablet; will retry this named phone after the tablet.

- 05:10Z Tablet landscape: Pen/Crayon/Magic one- and two-contact cohorts and Eraser pass exact Undo;
  core flow still running. All 13 mounted slider tests pass again. Verdict helper timestamp bug
  controlled on tablet: original misses the benign marker, in-memory one-argument adapter reads it.
  Monkey end UI/PIDs remain alive; its failed logcat reads are explicitly incomplete. Phone OS
  verification/lifecycle/long session remain pending while the VM is unresponsive.

- 05:17Z Tablet core ended: 23 pass, alive PID 11200, no target fatal/error screen with controlled
  logcat adapter. App stopped before phone recovery probe. Phone shell true still times out at 10 s;
  a serial-scoped reboot attempt is bounded and recorded. No shared adb reset or other device
  addressed. Current ledger: phone 145 pass/3 failed subchecks (2 unique defects), tablet 23 pass.

- 05:30Z Tablet phase ended: 34 bounded passes, all verdicts alive, two calibrated rotation trials
  retain one connected stroke and exact Undo; normalized ink density ratios 1.000/0.999. Font 1.0,
  sensor, rotation, night and network match baseline; controls collapsed and probe stopped. API 28
  emulator-5684 is arm64, accepted the identical APK, and is running core checks. Android 9 lacks
  uinput and uses global window focus; its recorded single-finger linear input fallback is explicit.
  No other device addressed. Phone shell/reboot probes timed out; its lifecycle/2,000-stroke phase
  remains pending.

- 05:40Z API 28 core ended: 20 bounded passes, alive with no target fatal/error screen. First
  attempt preserved after transient picker UI-dump failure (7 passes); corrected fresh dumps passed.
  Second attempt preserved at the clipped Parent Center row (15 passes); a public hub scroll and
  resumed tail pass gate digits/Enter, Farm/Magic, modal Back and restart. Neither harness
  limitation is a finding. Legacy denied/granted storage save tests now running. Tablet remains
  stopped/restored; phone recovery still pending.

- 06:00Z API 28 save transport: two real Allow trials publish PNGs; denied permission fallback and
  repeat-without-reprompt also publish matching files. However pixel review finds both real-Allow
  PNGs have zero colored pixels while before/after screens retain 8,497/7,630 purple pixels. This is
  a provisional export observation, not yet a finding: calibrated kernel-touch/contact-up controls
  are running before independent reproduction. API 36 saved PNG visibly includes ink. Corrected
  permission waits, old-SDK scoped permission-flag cleanup and bounded line-buffered getevent traces
  are recorded. Phone OS probe at 05:48Z still times out on shell true; lifecycle/2,000-stroke work
  remains blocked. All completed permission trials restore both grants and flags, preference file,
  helper artifacts and stop the probe.

- 06:05Z RN-ANDROID-003 recorded (S2): two fresh API 28 calibrated-kernel trials save paper-only
  PNGs while retaining visible ink on screen. Each has 62 frames, one down/up, no contacts left;
  gaps 95.735/58.538 ms, jumps 7.641 px. Permissions/publication pass; exports have zero colored
  pixels versus 10,229/10,228 on screen. Both app verdicts alive. Native
  permissions/flags/preference restored and helper removed, probe stopped. API 36 saved PNG is a
  positive ink control. API 28 calibrated Pen 1/2 and Crayon/Magic 2-contact drawing/Undo all pass.
  Findings total 3 unique defects; no product edits or commits.

- 06:19Z API 28 supplementary memory run: 200/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:21Z RN-ANDROID-003 upgraded to S1: Auto-Save on Delete reproduces twice with 10,269/10,214
  colored screen pixels removed by Clear, paper-only auto-saved PNGs, and no save error. Captured
  fresh restart has disabled Undo and blank paper. Auto-Save restored off; permissions/flags
  restored, helper removed, probe stopped. Phone host-side reconnect returns 0 but guest remains
  offline after a 40 s scoped wait; no shared adb reset. Supplementary API 28 2,000-stroke memory
  run is active (200-stroke checkpoint saved); it does not substitute for the blocked phone run.

- 06:23Z API 28 supplementary memory run: 400/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:26Z API 28 supplementary memory run: 600/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:28Z API 28 supplementary memory run: 800/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:30Z API 28 supplementary memory run: 1000/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:31Z API 28 supplementary memory run: 1200/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:32Z API 28 supplementary memory run: 1400/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:34Z API 28 supplementary memory run: 1600/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:36Z API 28 supplementary memory run: 1800/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:37Z API 28 supplementary memory run: 2000/2000 delivered strokes; meminfo checkpoint saved.
  Phone-specific long session remains pending while emulator-5680 is unresponsive.

- 06:45Z API 28 completed 2,000 strokes, app alive with scoped verdict; PSS retained 38,033 KiB
  after Clear and Undo eviction (one diagnostic observation, not a finding). Isolated adb server
  with emulator scanning/mDNS disabled and USB filter recovered a shell on emulator-5680 via its
  exact 5681 transport; shared adb and unowned emulator process untouched. API 28 lifecycle run in
  progress before switching back to phone.

- 06:53Z API 28 lifecycle supplement ended all eight scenarios alive: 4 direct passes, 2 rotation
  strict-oracle artifacts (max channel difference 3/255), 2 COMPLETE commands rejected by Android
  trim-level guard. Orientation/sensor/width restored, probe stopped. Phone nine-field OS
  restoration verifies, but recovered phone had no Splotch package and ~26-minute uptime.
  Reinstalling the identical APK; no cause inferred for that environment reset.

- 07:05Z Phone full lifecycle batch ended all eight cases alive. Home/return and rotations pass;
  first COMPLETE passes. Two reclaim checks stopped on an invalid Purple selected-tree assertion,
  although OS reclaim/new PID were confirmed. The second COMPLETE was rejected because Android still
  classified the UID foreground. Corrected four-case batch now checks rendered Purple and waits for
  a named background UID state plus non-app focus before kill/COMPLETE. Original raw errors
  retained.

- 07:13Z Phone lifecycle complete: all four requested scenarios pass twice after the explicitly
  documented oracle/admission corrections. Every selected run ends alive with scoped fatal/error
  arrays empty. Corrected reclaim confirms LAST_ACTIVITY, old PID absent/new PID returned,
  nondefault width 5 persisted, and exact recovered Undo. Both corrected COMPLETE requests accepted
  while backgrounded with exact ink retained. Phone 2,000-stroke session started, baseline PSS
  161,285 KiB, PID 19874.

- 07:14Z Phone long session: 200/2000 strokes delivered; meminfo recorded.

- 07:16Z Phone long session: 400/2000 strokes delivered; meminfo recorded.

- 07:17Z Phone long session: 600/2000 strokes delivered; meminfo recorded.

- 07:19Z Phone long session: 800/2000 strokes delivered; meminfo recorded.

- 07:21Z Phone long session: 1000/2000 strokes delivered; meminfo recorded.

- 07:22Z Phone long session: 1200/2000 strokes delivered; meminfo recorded.

- 07:24Z Phone long session: 1400/2000 strokes delivered; meminfo recorded.

- 07:25Z Phone long session: 1600/2000 strokes delivered; meminfo recorded.

- 07:27Z Phone long session: 1800/2000 strokes delivered; meminfo recorded.

- 07:28Z Phone long session: 2000/2000 strokes delivered; meminfo recorded.

- 07:30Z Phone first 2,000 strokes complete, exit 0 and scoped verdict alive, no fatal/Dropbox/error
  screen. Clear verified empty; after 20 new actions evict Clear history and another 30 s PSS is
  238,802 KiB vs 161,285 baseline, retained +77,517 KiB (75.7 MiB), flagged observation rather than
  leak finding. Same-PID (19874) 2,000-stroke warm repeat started; its distinct
  output/inputs/meminfo preserve the first cycle.

- 07:32Z Phone warm repeat: 200/2000 strokes delivered; meminfo recorded.

- 07:34Z Phone warm repeat: 400/2000 strokes delivered; meminfo recorded.

- 07:35Z Phone warm repeat: 600/2000 strokes delivered; meminfo recorded.

- 07:37Z Phone warm repeat: 800/2000 strokes delivered; meminfo recorded.

- 07:38Z Phone warm repeat: 1000/2000 strokes delivered; meminfo recorded.

- 07:40Z Phone warm repeat: 1200/2000 strokes delivered; meminfo recorded.

- 07:41Z Phone warm repeat: 1400/2000 strokes delivered; meminfo recorded.

- 07:43Z Phone warm repeat: 1600/2000 strokes delivered; meminfo recorded.

- 07:44Z Phone warm repeat: 1800/2000 strokes delivered; meminfo recorded.

- 07:46Z Phone warm repeat: 2000/2000 strokes delivered; meminfo recorded.

- 07:48Z Same-PID warm repeat completed another 2,000 strokes (4,000 main strokes total on phone,
  plus 40 eviction dots), exit 0/alive/no scoped fatal or error. Final 20-dot paper is byte-exact to
  warm baseline. Retained PSS +8,769 KiB versus +77,517 first cycle; both observations flagged, no
  leak finding. Background COMPLETE memory-release diagnostic now running on same PID 19874.

- 07:49Z Same-PID heavy-memory COMPLETE control passes: request accepted in confirmed background
  state, PSS 255,111 -> 225,558 after 30 s background, 240,838 after return/input/Undo+30 s. Paper
  and Undo are byte-exact; PID 19874 unchanged; scoped verdict alive/no fatal/error. Verified
  five-seed Monkey rerun now started with separate raw tag-filtered logcat files and exit-code
  proof; original log-gap batch preserved.

- 07:56Z Verified Monkey rerun complete: 5 seeds x 3,000 events, each alive/no fatal/error screen,
  raw logcat exit 0, zero connected network time, zero key/pointer drops. App snapshot restored,
  both firewall tags confirmed absent in IPv4/IPv6. Nine OS differences restored. Phone passes 19
  final checks including APK digest, controls collapsed/probe stopped and empty immersive baseline.
  Owned private adb server stopped/socket removed; exact phone reconnect+registration recovers
  primary shared adb shell without server restart. API28 five-contact supplement started.

- 08:06Z API28 five-contact supplement closes 8/8 selected checks alive: Pen, Crayon, Magic and
  Eraser twice, all exact Undo, calibrated down/up counts and no remaining contacts. Original Eraser
  takes stopped before erasing due wrong Size 3 label; corrected Eraser size 3 trials pass, raw
  setup artifacts retained. Pen five-line screenshot visually inspected. Final API28 font-2
  eight-section Close check running, with unset-font restoration in finally.

- 08:18Z Final closeout: all approved-device app processes stopped; final restoration verifies phone
  19/tablet 10/API28 12, all installed APK hashes match. Private adb server/socket removed and
  shared phone access recovered without shared-server restart. Native final ledger: phone 161 pass/3
  fail, tablet 34 pass, API28 51 pass/4 fail/2 blocked, exactly 3 unique twice-reproduced defects.
  Full type check, lint, doc refs, format check and QA-helper lint all exit 0; lint retains 2
  existing warnings. All 49 finding evidence paths exist. Owned scripts/servers complete, no
  commits; sealing final manifest next.

- 08:20Z Evidence structure verification passes: 1,347 JSON files, 177,648 JSONL records and 1,089
  PNG chunk/CRC checks, no failures. All 49 finding references resolve.
  Formatting/type/lint/doc-reference gates pass; all owned test processes and servers are stopped,
  devices restored as documented. Final manifest generation and digest verification follow this last
  report edit; no commits.
