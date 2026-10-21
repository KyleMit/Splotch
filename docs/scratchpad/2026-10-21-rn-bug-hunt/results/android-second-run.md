# Android second run

Candidate b236d639160459eecd60900926c759af5d4ae080; same supplied Release APK. Started 2026-10-21
03:20Z. Latest instructions limit this worker to emulator-5680, then emulator-5682, then
emulator-5684. Host web belongs to another worker. No product source, commits or GitHub writes.

Evidence is under `../evidence/`; executable fixtures under `../repro/`. A result marked captured
still needs image/assertion review. Only twice-reproduced product defects enter `findings.jsonl`.

## Phone coverage in progress

The original one-column Crayon thickness check was invalid because texture holes change ink count.
The vertical envelope across the middle of the line replaces it. The invalid log is retained as
`android-run2-drawing-invalid-column-scan.log.txt`.

A second setup selected Purple after Magic, intentionally returning to the last ink brush
(`RsdEdgeControls.tsx:299`). Those Magic-labeled images tested Crayon. They are preserved under
`android-run2-invalid-Magic-swatch*` and do not count as Magic coverage. The corrected fixture
selects color before selecting a brush. Neither invalid setup is a product defect.

The corrected drawing batch completed: Crayon and Magic have increasing measured physical vertical
envelopes 6/12/22/38/58 px. These are envelope measurements including antialiasing, not the
single-column solid-width metric used in the first run. Each brush's one-, two- and five-contact
mark changes the paper, then one Undo restores the exact pre-cohort digest. Pen, Crayon and Magic
dots render. See `android-run2-drawing-verified.json` and the corresponding PNG/XML pairs.

The first two continuous-path Magic runs each produce one connected ink component, but their kernel
traces reveal an artificial initial timestamp gap. They establish continuous output after an initial
hold; they do not yet close the early-swipe question. The original-versus-calibrated comparison is
pending.

## Magic early-swipe closeout — test-script artifact

Three corrected independent trials passed: first move 14.26/13.35/16.53 ms, max gap
28.70/26.21/24.28 ms, max jump 48.01 px. Each image has exactly one 8-connected colored ink
component (49,122 / 48,326 / 48,524 pixels at the documented threshold), and Undo equals its blank
crop byte for byte. Evidence: `android-run2-magic-corrected-verdict.json`, all three
`android-run2-magic-calibrated-timing-*` traces, input streams, screenshots and summaries. The
original script has a 1.5 s initial timestamp gap and ~870 px initial jump, which triggers the
shared dropped-pointer recovery policy (>100 ms plus >10% short-paper-edge distance). The corrected
script inserts an empty synchronization batch before the registration wait and uses a continuous
curve. No fragmentation in 3 tries; classified as test-script artifact, not entered in findings.

The extra brush batch passed Eraser 1/2/5-contact erasing and dot, with exact Undo restoration.
Pen/Crayon/Magic edge crossings left chrome closed; their images and Undo images are retained. The
picker assertion in that batch was invalid: `RsdColorPicker.tsx` paints its selected ring but
exports no `selected` attribute on the swatch button. The image shows the final target ring.
`android-run2-drawing-extra-invalid-picker-oracle.log.txt` preserves that failed assertion. A
corrected picker test uses output ink RGB and exact grid-image recall. This is not a finding.

The first slider extreme take was invalid: these sliders use relative travel. A center-to-edge swipe
moved Volume from 0% to 66%, so it was not a maximum; the restore calculation then wrongly used 66
as the full range. Preserved under `evidence/invalid-slider-distance/`. The corrected script makes
repeated full direction sweeps to clamp at the true extrema, uses the declared full range to
restore, and verifies the rendered values. No slider defect inferred.

Corrected picker **pass**: the final dragged-to `#1A1F24` appears in 13,699 output ink pixels. The
chosen-ring grid is byte-identical after scrim dismissal, selecting Purple, and reopening; it also
differs from the pre-drag grid. See `android-run2-picker-results.json` and corrected captures.

Slider/Appearance batch **11 bounded subchecks pass**. Volume clamps at 0/100; Button Size at
70/130. Both ends persist through a process restart, with visible unclipped root controls in the
captured phone viewport. Volume 50 and Button Size 100 are restored. Light, Dark, System, Flat,
Raised, Auto and Portrait selections reflect the chosen radio state. Theme/style/orientation are
restored to System/Raised/Portrait. `android-run2-sliders-results.json` and its log retain
assertions. Landscape locking, sensor following and further persistence checks run in the next
fixture.

Pen 2/5-contact cohorts **pass**, with exact blank-paper Undo restoration:
`android-run2-pen-pair-results.json`. Orientation has **6 passing subchecks**: Landscape and
Portrait locks, both across restart, plus Auto turning to landscape and back on sensor restoration.
Portrait restored. The first cleanup lookup mistook the hub's composite accessible name for an exact
`Appearance` name; the six valid captures stand, and the corrected cleanup is captured too. No
orientation defect. See `android-run2-orientation-results.json`.

Parent Center's first policy sweep rejected an inverted rectangle on a different, scrolled-out radio
while filtering the visible row. The foreground/input guard prevented a tap. Preserved under
`invalid-parent-radio-filter/`; the filter now discards clipped/inverted rectangles before finding
the target row. A full corrected sweep is running. This harness assertion is not a finding.

For the first four protection rows, this batch tests policy selection/state only. It sends no AI
image or report, submits no feedback, and follows no external link. Parent Center itself is the
public action used for full Every time/Per session/Never lifetime and confirmation behavior.

Parent Center corrected sweep **17 subchecks pass**: four protection rows × three policy choices,
plus Per session first solve/reuse, cold-process re-arm, Never confirmation cancel, confirmed Never
persistence, and restored Every time re-arm. All five policies restored to Every time. See
`android-run2-parent-results.json`, PNG/XMLs and log. This source explicitly records only solves
made under Per session for reuse (`parentGate.ts`); the initial Every time solve did not carry over.

Coloring network batch **6 bounded subchecks pass**: remove downloads, metered/Data Saver
zero-transfer deferral, draw while an uncached metered download is pending, interrupt with Wi-Fi and
data off (2/7 installed; active default network none), retry to 7/7, then use the freshly downloaded
Brachiosaurus page and Magic offline. PNGs inspected. All seven extra books restored.
`android-run2-network-results.json` verifies every network baseline matches after restoration.

The console recorded 128,000 bits/s with 200 ms latency, but the observed Wi-Fi transfer did not
establish that rate limit. This passes the requested metered-connection branch; it is not a measured
slow-Wi-Fi result. The first `netpolicy set metered-network` command returned 255; its invalid take
is retained. The supported `cmd wifi connect-network … -m` path established metering, and omitting
`-m` restored the original `none` override. No app defect inferred from that command.

Saving **4 bounded subchecks pass**: actual Auto-Save on Delete publishes one non-pending owned PNG;
empty Clear publishes none; two independent staging-directory faults retain a retryable picture
through process death and save its exact reference pixels on retry. Matching raw-pixel SHA-256
values and MediaStore IDs are in `android-run2-save-results.json`. The induced directory fault is
restored; Auto-Save on Delete is restored off. No save defect found.

**RN-ANDROID-001 — S2, reproduced twice:** AI Art does not scroll to its lower settings on the API
36 phone at font_scale 1.0 / Button Size 100%. Two fresh-process trials retain the unreachable
Auto-Save bounds `[808,2296][945,1993]` after a calibrated one-contact swipe. The same gesture moves
Parent Center. Kernel traces contain 61 frames with max gaps 22.75/21.13 ms for the AI trials and
47.68 ms for the positive control; max jumps 18 px. Thus this is independent of the earlier Magic
input artifact. See `android-run2-ai-scroll-probe-results.json`,
`android-run2-ai-scroll-trace-summary.json`, before/after PNG/XMLs and findings.jsonl.

The partial first settings take changed Customize off; its captured original value was on. It has
been restored on, Auto-Save AI remains at its original off, and Create AI is restored off. Recovery
used the visible clipped Customize strip; it did not make the body scroll. Networking was reenabled
only after Create AI was off. No key or credential was saved and no generation ran.

Keyboard text-field isolation **pass**: while a dummy, unsaved key field has focus, Ctrl+Z leaves an
exact paper digest unchanged, and Escape closes Settings. Create AI was restored off before
Wi-Fi/data returned. The first handoff to arrow testing raced the asynchronous relaunch and hit the
launcher guard; the corrected driver waits for a landed app. No stray input was sent.

**RN-ANDROID-002 — S3, reproduced twice:** Right moves focus from Light to Dark, but none of Enter,
Space or D-pad center selects Dark. Touch selects it in both positive controls. Unselected Dark is
focusable but marked non-clickable in the native tree. Both full trials start from a fresh process;
System restored. The defect is inability to activate, not merely a choice between immediate
web-style arrow selection and Android focus navigation. Android's
[keyboard navigation guide](https://developer.android.com/develop/ui/views/touch-and-input/keyboard-input/navigation)
describes arrows as directional focus movement; that movement works here. The failed activation is
recorded in `android-run2-segmented-activation-results.json` and the individual key captures. The
failing repro writes its results and restores System before its final assertion.

Brush availability combinations **6 subchecks pass**: each of Eraser/Crayon/Magic as the sole
optional brush gives a direct on/off toggle; disabling that active brush leaves Pen's width choices
and no empty brush control. All optional tools restored on; Pen and Size 3 restored. See
`android-run2-brush-combinations-results.json` and its captures.

Monkey **5/5 runs alive**, 3,000 injected events each, 15,000 total. Seeds 20261021, 568036, 314159,
271828 and 8675309; throttle 50 ms; syskeys/nav/majornav/appswitch all zero; only the probe package.
All runs have zero key/pointer/trackball drops, 8–10 unsupported keyboard-flip drops, zero
mobile/Wi-Fi connected time and no error screen. The original helper failed to read logcat because
its timestamp argument included literal quotes; the empty fatal arrays do not establish clean logs.
Monkey itself reported no crash/ANR, and each end PID and UI was alive. Per-run JSON, PNG, XML and
complete Monkey text retained. App snapshot restored; exact tagged IPv4/IPv6 rules removed.

The OS diff detected Monkey touches outside app chrome: screen brightness 102→9, airplane mode 0→1,
related radio/boot flags and three new secure flags. Scoped commands restored airplane mode,
brightness, Wi-Fi/data, cellular-on-boot and removed the introduced flags. The subsequent full
settings read timed out, as did shell true/getprop and emulator-console ping/status; serial-scoped
reconnect also timed out. This is a phone harness/VM blocker after the five valid end verdicts, not
an inferred app crash. Final OS verification, lifecycle and long-session checks remain pending. The
tablet phase proceeds while that named phone is unresponsive; the shared adb server is intact.

## Tablet admission and verdict-helper control

The API 36 tablet accepted the identical APK. Its first core attempt was blocked by Android's
first-run immersive-mode guidance before drawing; that take is retained under
`evidence/invalid-tablet-onboarding/` and has zero functional passes. After a foreground-checked
acknowledgment, the corrected landscape run began.

The repository crash-verdict helper passes a literal-quoted `-T` timestamp to `adb logcat`, which
rejects it. `repro/android-run2-verdict.mjs` imports the exact repository classifier with only that
argument corrected in memory; no helper source is edited. A disclosed benign log marker proves the
original misses the requested interval and the adapter reads it
(`android-run2-verdict-control.json`). Subsequent lifecycle, long-session and other-device scripts
use the adapter. Earlier Monkey UI and process verdicts remain valid, with crash-log coverage
explicitly incomplete.

Tablet core: **23 bounded subchecks pass**, API 36, 2560×1600 landscape. Pen/Crayon/Magic each draw
one and two contacts with exact one-Undo blank restoration; Eraser restores exact ink. Width
choices, picker select/recall, seven Settings destinations, hardware math gate, Farm Cat/Magic,
modal system Back and restart pass. `android-run2-emulator-5682-core-results.json` ends **alive**,
PID 11200, no target fatal lines and no error screen through the controlled verdict adapter. The Pen
two-contact screenshot was visually inspected and has two distinct parallel lines. Core completion
does not by itself establish portrait or font-2 behavior.

Tablet follow-up: **9 bounded layout checks plus 2 calibrated rotation checks pass**, total **34**.
Font 2.0 was read back from Android; seven Settings destinations expose reachable Close controls.
Font-2 screenshots were retained; the inspected Tool Drawer labels and sidebar wrap fit. The initial
adb-swipe rotation take retained already-fragmented marks and is not continuity evidence. Two fresh
calibrated uinput repeats each produce one connected Pen component before and after rotation, with
normalized ink density ratios 1.000/0.999 and exact blank Undo. Both finish alive with no target
fatal/error screen. Font, sensor, rotation, night and Wi-Fi/data match the saved baseline; collapsed
controls restored and probe stopped. The fullscreen-guidance confirmation was returned to
unconfirmed; its exact original key value was not captured, so that restoration is semantic,
inferred from the original guidance screenshot.

API 28 admission: emulator-5684 reports SDK 28, arm64-v8a, 1080×2160 at density 440. The identical
APK installs successfully. Its uinput command is absent, so only linear single-finger strokes use
the explicitly recorded adb input swipe fallback; no multi-contact coverage is claimed there.
Android 9 reports foreground in the global windows dump, while newer images report it per display.
Fullscreen guidance was foreground-checked and acknowledged before core admission; the original
setting value is captured for final restoration.

API 28 core: **20 bounded subchecks pass**, alive end verdict with no target fatal/error screen.
First take stopped at a transient null-root UI dump after picker selection; its 7 passing checks and
log are retained in `api28-first-picker-dump-failure/`. Fresh-dump retry deletes XML every time. The
next take passed picker and all seven Settings sections, stopping before the offscreen Parent Center
row; `api28-hub-scroll-setup/` retains its 15-check checkpoint. The resumed tail uses an actual hub
scroll and passes hardware gate digits/Enter, Farm Cat/Magic, modal Back and restart. The final core
ledger includes each distinct head/tail check once, not each attempt.

API 28 save transport: two denied-storage fallback outputs match decoded pixels and the second save
does not repeat its prompt; two real-Allow fresh-process trials publish public Pictures PNGs and
finish alive. These are publication/permission checks, not image-fidelity passes. The initial 700 ms
prompt lookup and immediate post-Allow foreground check were invalid timing assumptions; corrected
bounded waits preserve the dialog and wait for the app to regain focus. An incomplete one-permission
CLI grant is retained under `api28-partial-cli-grant/` as a fixture artifact. The real dialog grants
both storage permissions.

Android 9 has no scoped permission-flag-reset CLI. `QaPermissionFlags.java` is an API-28-only,
fixed-package helper using the runtime-verified package-manager methods to read and clear only
Splotch's storage user flags after revocation. Both permissions, flags and the permission-request
preference are restored; the compiled helper and owned temporary build are removed. No APK or
product source changes.

API 28 calibrated kernel input: **4 checks pass**, Pen one/two contacts and Crayon/Magic two
contacts, each with visible marks in the expected bands and exact blank Undo. `event send` targets
the emulator's existing qwerty2 device, with its measured axis limits. A bounded remote-PTY getevent
trace proves down/up counts and zero final contacts. Earlier traces used a pipe, whose buffering
lost trailing releases when Android 9 timeout ended with status 142; those diagnostic takes are
retained, and are not app findings.

**RN-ANDROID-003 — S2, reproduced twice:** Saved PNGs omit all drawn ink on API 28. Two fresh
calibrated-kernel trials show 10,229/10,228 colored paper pixels before and after Save, but zero
colored pixels in each published 1079×1888 PNG. Both traces have 62 frames, one down/up, no final
contacts; max gaps 95.735/58.538 ms and max jumps 7.641 px. Both actual Allow dialogs grant storage
and publish photos, with alive end verdicts and no target fatal/error screen.
`android-run2-emulator-5684-export-fidelity-results.json`, PNGs and raw traces retain the evidence;
the failing repro writes each result and restores permission state before exiting. API 36's saved
PNG visibly includes ink. The exact capture/compose boundary causing the API 28 omission is not
isolated.

RN-ANDROID-003 impact follow-up: **two Auto-Save on Delete trials also fail**. Clear removes
10,269/10,214 colored screen pixels; each newly published auto-save has zero colored pixels, with no
save failure notice. The next fresh-process capture is blank with Undo disabled. This confirms the
automatic preservation path loses the cleared picture across restart, so the same defect is raised
to **S1**. Auto-Save restored off and both storage permissions/user flags restored, with no cleanup
errors. These two failed fidelity checks add to the two manual-save fidelity failures; they are one
unique defect.

Phone recovery: the 06:12Z host-side serial reconnect returned successfully, then reported this
guest offline; a 40-second serial-scoped wait timed out. No shared adb restart or unowned listener
termination. A supplementary API 28 2,000-stroke memory run began at 06:16Z with baseline PSS
199,569 KiB; the requested phone run and phone lifecycle scenarios remain blocked.

API 28 supplementary long session: **2,000 delivered strokes completed**, with meminfo every 200.
Final repo-helper verdict is **alive**, no target fatal, Dropbox crash or error screen. PSS rises
from 199,569 KiB to 238,225 KiB at stroke 2,000; after Clear, 30 seconds, 20 new actions to evict
the retained Undo picture, and another 30 seconds it is 237,602 KiB. Retained growth is **38,033 KiB
(37.1 MiB)**. Clear was independently checked to remove all colored paper pixels. This is a flagged
single diagnostic observation, not a reproduced leak finding; allocator/cache retention and a warmed
repeat have not been separated. Whole-process PSS is not JS heap. See
`android-run2-emulator-5684-long-results.json`, raw per-sample meminfo, input journal and frames.

At 06:45Z an isolated adb server recovered a shell to the exact phone emulator through its known
port 5681. Its Unix socket is private to this session, emulator auto-scan and mDNS auto-connect are
disabled, and USB is filtered to the emulator serial. The primary adb server and user-started
emulator remain untouched. The documented AOSP registration handler accepts `host:emulator:5681`;
`ADB_LOCAL_TRANSPORT_MAX_PORT=0` disables the port scan and `ADB_MDNS_AUTO_CONNECT=0` disables
discovery auto-connect. Device state briefly reported offline during registration, followed by a
successful shell. The owned server will be stopped after phone restoration and remaining checks. API
28 lifecycle input finishes before phone functional input resumes.

API 28 lifecycle supplement: all eight end PID/verdict classifications are alive. Four direct checks
pass (Home mid-contact twice, confirmed `am kill`/new PID return twice). The two rotation checks
accept new ink and Undo; strict raw equality differs only by 1–3/255 around the retained stroke.
Full-paper reviews allow at most 4/255 and both pass, while a one-pixel reference shift fails in
3,056/3,014 channels. These are corrected oracle artifacts, not findings. Both explicit background
COMPLETE requests return Android's “Unable to set a higher trim level than current level.” AOSP
Android 9 raises that message when `trimMemoryLevel >= requested level`; pre-command state was not
captured, so these two injection checks remain **blocked**, not passed. Their app processes stayed
alive. Raw errors remain in the individual results;
`android-run2-emulator-5684-life-reviewed-results.json` separates these reviewed statuses.
Orientation, sensor and Pen width restored; probe stopped with no cleanup error.

Phone recovery admission: the recovered console is `Splotch2985_API36_phone`, 1080×2400, SDK 36,
user 0 only. At 06:52Z uptime was 1,605 seconds and Package Manager could not find Splotch. The
cause of that guest-state change is not established. The identical APK was reinstalled successfully
(SHA-256 unchanged), actual first-run immersive guidance acknowledged, and phone lifecycle resumed
after fresh UI admission. Earlier functional/Monkey artifacts describe the earlier installed guest
state. An initial launch error was independently preserved as package absence in admission JSON; its
original lifecycle log was overwritten on the admitted rerun, explicitly disclosed in that JSON. OS
restoration now verifies all nine original Monkey differences, font 1.0, rotation 0/auto 1, night
off and original sensor.

Phone lifecycle closeout: **8/8 selected scenarios pass**, all alive with no scoped fatal/error
screen: Home mid-stroke twice, rotation mid-drag twice, background process reclaim twice, COMPLETE
while backgrounded twice. The two original reclaim attempts stopped on a wrong swatch-tree assertion
(Purple buttons do not expose selected=true), and the original second COMPLETE request raced
Android's foreground classification. These are retained raw in the original lifecycle summary. The
four corrected trials validate actual Purple pixels and nondefault width 5 after reclaim; require a
named background UID state plus launcher focus; then verify new input and exact Undo. Both COMPLETE
repeats retain exact ink. `android-run2-lifecycle-reviewed-results.json` selects those corrected
rows while retaining their source-file provenance. Rotation comparisons use the separately
controlled <=4/255 raster-rounding oracle; other Undo comparisons remain exact. Original sensor and
Portrait restored.

Phone long session: **2,000 delivered strokes complete**, meminfo every 200, all ten batches
successful. Exit 0, repo-helper verdict **alive**, PID 19874 unchanged, no scoped fatal, Dropbox
crash or error screen. The inspected final drawing is dense Purple ink confined to paper. Clear
removes all colored pixels in the checked crop. PSS baseline 161,285 KiB; stroke 2,000 244,996;
Clear+30 s 235,603; after 20 new actions evict the Clear picture and another 30 s 238,802.
**Retained +77,517 KiB (75.7 MiB)** is flagged. This is whole-process resident memory, not proof of
a JS/native leak. The raw App Summary grows primarily in Private Other and Native Heap; Code is
nearly flat. A second 2,000-stroke cycle starts in the same confirmed PID to distinguish continued
accumulation from first-cycle retained capacity; its starting and ending paper have the same 20-dot
pattern.

Warm repeat: another **2,000 strokes in PID 19874**, exit 0 and alive, no scoped fatal/Dropbox/error
screen. This brings phone main-session input to **4,000 strokes**, plus 40 eviction dots. Warm
baseline PSS 246,386 KiB; post-Clear/eviction+30 s 255,155, **+8,769 KiB (8.6 MiB)**. Starting and
ending 20-dot paper match exactly (zero changed channels), so the compared logical drawing states
agree. The first cycle's 75.7 MiB retained growth does not recur at that magnitude in this repeat;
the smaller positive difference remains flagged. Neither observation establishes unbounded growth or
a leak. A same-PID background COMPLETE diagnostic follows before process teardown.

Heavy-memory pressure control **passes** on the same phone PID: COMPLETE accepted after a named
cached/background UID state and launcher focus. PSS 255,111 KiB before; 244,569 immediately after
request; 225,558 after 30 seconds background; 240,838 after return, new ink, Undo and 30 seconds.
Retained paper and Undo compare byte-exact. Exit 0, alive, no scoped fatal/error screen. Some
capacity releases under the explicit system signal; neither the positive post-Clear deltas nor this
release prove a leak or a physical-device memory budget. The observations remain flagged for review,
without a product finding. A verified five-seed Monkey rerun follows; it preserves raw scoped logcat
and its exit code alongside the unchanged repo classifier adapter.

Verified Monkey closeout: **5/5 additional runs alive**, each 3,000 events with the same five
recorded seeds and requested throttle/percentages. All raw logcat reads exit 0, all scoped
fatal/Dropbox/error-screen arrays empty, no connected mobile/Wi-Fi time, no dropped
keys/pointers/trackballs. Unsupported flips are retained in raw output. The original five-run batch
remains explicitly incomplete for logcat; the verified batch closes that coverage gap without
rewriting it. Across both batches there are 30,000 events, using five distinct seeds twice. Snapshot
restoration and exact firewall-rule removal pass. The same nine OS changes recur (brightness to 1
this time) and all verify restored. Phone passes 19 final checks, including installed APK bytes,
stopped probe and OS baselines. The owned private adb server and socket are removed; a serial-scoped
reconnect/registration restores the phone on shared adb, which was never restarted. API28 input
begins only after phone teardown.

API28 five-contact follow-up **8/8 selected checks pass**, Pen/Crayon/Magic/Eraser twice, with five
calibrated down/up contacts and zero remaining contacts. All five bands draw or erase, one Undo
restores the exact prior paper, each verdict alive/no scoped fatal/error screen. The Pen screenshot
shows five clean separate lines. Two original Eraser setup takes used Pen's `Size 3` label and
stopped before erase input; their errors are script artifacts. Corrected takes select
`Eraser size 3` and pass. The reviewed aggregate preserves raw provenance. Pen and width restored;
no cleanup errors. A short font-2 Close/reachability supplement follows before final restoration.

API28 font-2 follow-up: seven direct Settings sections expose reachable Close controls and return to
paper. The first Parent Center hardware-key attempt leaves the answer empty; cancelling the gate
returns to the Settings hub, not paper, so the initial Close oracle fails. This is a single
unconfirmed keyboard observation, not a finding. A visible-keypad repeat reaches Parent Center and
closes to paper, completing eight bounded section-Close checks. Android materializes font_scale=1.0
when the changed value is first deleted; a second delete after configuration settles restores the
original absent key. Final OS readback confirms null. Raw original and corrected results remain
separate.

Final restoration: all devices pass (`emulator-5680`: 19 checks; `5682`: 10; `5684`: 12), including
the installed APK SHA-256 and stopped app PID. API28 dumpsys omits revoked permissions with no
flags; the read-only scoped package-manager helper independently verifies both grants denied and
flags zero, then removes its jar/build. Phone and API28 immersive values are restored to their
captured empty strings. Tablet's exact initial immersive key was not captured; its unconfirmed
semantics are restored and disclosed. The private adb server/socket are removed, original and
verified firewall tags absent, and primary shared adb phone access works again without restarting
that server. Final native ledger: phone 161 pass / 3 fail; tablet 34 pass; API28 51 pass / 4 fail /
2 blocked. Exactly three unique product findings remain.
