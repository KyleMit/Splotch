# Bug-hunt drivers

Run from repository root. These scripts never commit, push or edit product source.

* `serve.mjs`: static RN export on `RN_HUNT_PORT` (6100 by default; 6100–6199 enforced), real
  `web/static/coloring` assets, local failing API response. Record its process handle and stop it
  when the browser batch ends.
* `check-capabilities.mjs`: one headless browser at a time, phone context, no remote requests. Saves
  each engine's launch/readiness result. This run's host browser processes abort before a page
  exists.
* `inspect.mjs`: initial Chromium phone inspection, no external requests.
* `web-core.mjs`: Chromium phone (`RN_HUNT_PROFILE=iphone`), tablet (`ipad`), or desktop (`desktop`)
  core checks. Uses the existing parity stroke/gate helpers and AI API fixtures. `RN_WEB_URL`
  selects loopback host; optional `RN_HUNT_CDP` connects an owned Chromium endpoint rather than
  launching one. It writes observations into this campaign's evidence, never the older parity
  package. Browser admission failures are separate from product defects.
* `android-driver.mjs`: all commands hard-code the dedicated emulator; inputs require the probe
  focused on Display0. `back` refuses a root screen. Each static capture waits for three identical
  frames after one second, then obtains a fresh hierarchy. UIAutomation failure rejects the take
  instead of reading an old XML file. Timed gate states use direct screenshots because the countdown
  prevents UIAutomation from becoming idle.
* `generate-touch.mjs <output> joined|separate|stress <contact-count>`: the documented virtual
  touchscreen protocol, 1080×2400, 16 ms sample cadence. `separate` splits the same 75-point path
  into three contacts. `stress` schedules 60 seconds. Push to `/data/local/tmp/` on the dedicated
  emulator and run only after the driver's foreground guard. These are synthetic emulator contacts,
  not proof of physical coalescing or palm handling.
* `android-touch-admission.mjs`: expects generated touch fixtures already pushed under the
  `rn-hunt-*` names; restarts the probe, admits separate/joined cardinality, then five contacts.
* `android-gate.mjs`: starts on Settings hub; opens Parent Center and exercises hardware keys.
* `android-gate-lockout.mjs`: restarts the probe to reset the gate model, makes three wrong answers,
  captures the pause without waiting for idle, and proves recovery and destination.
* `android-lifecycle.mjs`: font 2.0 and dark-mode checks, with OS restoration in `finally`. Its
  original user_rotation take remained portrait and is invalid landscape evidence.
* `android-sensor-rotation.mjs`: actual emulator sensor rotation under app Auto; restores the
  original acceleration. Start on root with the app's orientation setting Auto.
* `android-offline-stress.mjs`: offline root and cached library, restores airplane mode.
* `android-stress.mjs`: expects 60-second five-contact fixture pushed; compares PID, then Undo.
* `android-memory-lifecycle.mjs`: trim-memory, Home/resume and force-stop/relaunch checks.
* `android-settings-tail.mjs`: lower Settings hub and four remaining section entries.
* `android-tool-preferences.mjs`: start on Tool Drawer with its master and all five tools on; checks
  hidden tools and process persistence, then restores them. The master switch leaves Camera and
  Coloring available because those have their own settings.
* `android-clear-cancel.mjs`: start on blank root; compares a fixed paper crop after short and
  reversed Clear drags, full Clear, then Undo. The temporary uinput file is removed in `finally`.
* `android-deep-undo.mjs`: restarts blank, draws 25 dots, exhausts the shared 20-action Undo depth,
  verifies the five oldest dots remain, presses Undo again, and admits a fresh stroke with Ctrl+Z.
  Also closes Brushes with Escape. Uses guarded coordinates from the current Undo hierarchy.
* `android-widths.mjs`: starts with Pen and Eraser size 3; draws all five Pen widths and cuts all
  five Eraser widths through a Pen stripe. Measures a fixed scanline for strictly increasing widths
  and restores both brushes to size 3. Restore manually if interrupted.
  `android-controlled-path.mjs` supplies 60-step, 16 ms straight-line uinput paths without the
  instantaneous initial jump in the older curve fixture.
* `android-offline-cold.mjs`: warm library cache; force-stops and starts a new app process in
  airplane mode, draws through uinput, then restores the original airplane setting.
* `android-settings-preferences.mjs`: start on root with default choices from this run; checks
  Camera/Auto-Save, Coloring, Reduce Motion, Sound sources/master, and Dark/Flat persistence across
  process restarts. Restores each section before the next. It observes preference state and rendered
  controls, not audio output or animation timing. Restore the current section manually if
  interrupted.
* `android-save-cooldown.mjs`: ink present or blank root with Camera on and Pen selected; drives
  eight Camera taps inside the shared cooldown, verifies one published owned image, adds ink, then
  verifies a later Save creates one more. The temporary uinput file is removed in `finally`.
* `slider-negative-control.mjs`: temporary transform-only break of slider termination; expects the
  two added mounted tests to fail. Deletes temporary config and never edits product files.

The scripts assume the stated starting screen. A rejected input or stale precondition is a harness
blocker until corrected. Do not interpret an exit code alone as a product finding; every finding
needs two reproductions and evidence. Keep failed logs. On interruption, restore any outstanding
emulator OS settings before resuming. No Android root Back, other device, live AI generation, key or
access code is used.

`web-ai.mjs` uses a fresh loopback origin (`RN_WEB_URL`, default port 6102), disables service
workers for the fixture and blocks unmatched remote requests. Wait for Settings to unmount before
drawing and for the result Download control, not its earlier original preview. `web-ai-report.mjs`
continues an already displayed fixture result, verifies confirmation and acknowledgement, and counts
original models without printing their content or credentials. Android Chrome cannot create isolated
browser contexts; use a fresh origin for an independent AI take. The host-profile matrix still needs
host browsers.

`web-ai-errors.mjs` uses the owned Android Chrome CDP endpoint and independent origins on ports
6104–6108. Serve on host 6103 and reverse each emulator port to host 6103. Forward host 6111 to
Chrome's debug socket and open Chrome at the first origin. The driver clears only its fixture
origins, disables service workers, intercepts every API, and aborts other remote requests. It checks
500, bare 502, malformed JSON and wrong media type followed by explicit retry, plus a 422 safety
refusal without sending a report. It waits for the source-owned engine/control readiness stamps and
a settled root before drawing. It selects and foregrounds the matching tab; screenshots come from
the dedicated emulator after a Chrome focus check. It navigates to `about:blank` and clears its
origins before disconnecting. Any blocked case makes the driver exit nonzero.

The isolated follow-up used `RN_HUNT_CASE=bare502 RN_WEB_URL=http://127.0.0.1:6109` with an
additional reverse from emulator 6109 to host 6103. Remove every mapping created by the run and stop
the owned server when finished. These remain supplemental Android Chrome checks, outside the
requested host-browser/profile matrix.

## Android continuation

The second-run scripts allow only emulator-5680, emulator-5682 and emulator-5684. Use one device at
a time. The phone scripts import the original guarded driver; the two additional devices use
`android-device-driver.mjs`, which validates its serial before invoking adb. The supplied APK is
unchanged and declares min SDK 24.

`android-run2-magic-timing.mjs` records three corrected Magic trials; its analyzer verifies one
connected ink component and exact Undo restoration. The uinput stream primes its event clock with an
empty synchronization packet before the registration delay, avoiding the older artificial first
packet gap. `android-run2-extra-analyze.mjs` validates the retained Eraser and edge-crossing images.
`android-run2-picker.mjs` checks the picked ink RGB and exact visual selection recall; swatches do
not export an Android selected attribute.

`android-run2-sliders.mjs` uses relative drags, repeated to clamp at the true range ends. It
restores Volume 50 and Button Size 100, then System/Raised/Portrait. The orientation script restores
the sensor and Portrait. Parent Center checks restore all five policies to Every time. If a UI
script is interrupted, read its last capture and restore the outstanding setting before continuing.

Network checks use only emulator bandwidth/latency, Wi-Fi/data, Data Saver and the emulator Wi-Fi
metering override. Their `finally` restores the initial states. Save-failure checks temporarily
replace only the app's photo staging directory with a file, retaining the original directory beside
it; `finally` puts it back. They never modify product code or fill shared storage. The keyboard
script keeps networking disabled until Create AI Images is restored off; inspect its partial JSON if
interrupted before networking can safely be restored.

Monkey takes an app-data snapshot, runs each recorded seed from that snapshot with Wi-Fi/data off,
and restores it before reconnecting. It uses the repository's Android verdict probes and preserves
the full Monkey output. The long session samples `dumpsys meminfo` every 200 delivered strokes;
Clear retains its picture for Undo, so the later samples also evict that Undo entry with 20 new
marks. Lifecycle checks use the same verdict helpers and record intentional background process
reclamation separately from crashes. No root Back is sent.

On this API 36 image, `cmd netpolicy set metered-network` advertises support but returns 255 without
output. `cmd wifi connect-network AndroidWifi open -m` successfully sets the emulator network's
metered override; the same command without `-m` restores its original `none` override. The network
driver verifies `cmd netpolicy list wifi-networks`, saves its baseline before mutations, and
restores Wi-Fi/data and Data Saver. The first command failure is preserved in
`invalid-netpolicy-command/`.

`android-run2-ai-scroll-probe.mjs` is the failing repro for RN-ANDROID-001. Start with Create AI
Images enabled and both Wi-Fi/data off, at normal font and Button Size. It restarts twice, traces
one-finger swipes and compares Auto-Save AI bounds, then admits the same gesture in Parent Center.
It writes its observations before asserting. `android-run2-recover-ai.mjs` uses the captured
original AI flags to restore Customize on, Auto-Save AI off and Create AI off before networking
returns. The small visible Customize strip can restore that flag; Auto-Save itself is unreachable.
The keyboard-only driver avoids the unreachable lower controls. The earlier all-settings keyboard
batch is preserved as an invalid visibility take.

The offline Monkey wrapper additionally installs tagged IPv4/IPv6 OUTPUT rejection rules for only
the probe's Android UID. This prevents a random in-app action from reaching the hosted AI service
even if a system touch reveals a network toggle. It removes only its exact tagged rules, restores
the app snapshot before reconnecting, records cleanup errors individually, and compares OS setting
snapshots. It never clears a log, rewrites shared firewall tables, or addresses another device.

`android-run2-verdict.mjs` retains the repository verdict classifier and corrects only its
literal-quoted adb logcat timestamp argument in memory, guarded against source drift. The control
logs a disclosed benign marker: original reads miss it, the adapter reads it. The five earlier
Monkey runs retain live-process/UI evidence but incomplete logcat coverage. No repository helper is
edited.

`android-run2-device-core.mjs emulator-5682` (or `emulator-5684`) runs that named device only.
Tablet first-run immersive guidance must be dismissed after foreground inspection before admission;
the first rejected take is retained. `android-run2-tablet-layout.mjs` rotates only the tablet
sensor, checks retained ink and exact Undo, and visits seven Settings sections at font scale 2.0.
Its finally restores the captured sensor and font scale.

Android 9 has no `uinput` executable in this image. The generic driver records a single-contact
linear-path fallback as `*.input.json` and rejects non-linear or multi-contact requests there. Its
foreground guard uses Android 9's global windows focus; newer Android uses Display 0 focus. Neither
change weakens the serial allowlist.

For lifecycle reclamation, the unmodified whole-window verdict is retained, including the deliberate
old-process death. The return verdict begins after `am kill` has demonstrably removed the old PID
and before relaunch; unexpected fatal lines and Dropbox reports retain the whole-window verdict.
This avoids presenting an intentional reclaim as an app defect.

`android-run2-api28-save.mjs` expects the fresh API 28 installation with denied storage permission.
It backs up the app's permission-request preference, denies the real first storage prompt, checks
app-media fallback and no-repeat-prompt saving, compares decoded pixels for the two denied saves.
Public Pictures grants are exercised by the separate real-Allow script. Finally it restores the
preference, permission and user flags and stops the app. Exported QA PNGs remain as evidence.

`android-run2-api28-granted-save.mjs` uses the actual Android Allow dialog and waits for Splotch to
regain focus before inspecting output. Its pass means permission and file publication; it does not
assert that ink survived. The distinct failing `android-run2-api28-export-fidelity.mjs` checks that
content with two fresh calibrated-kernel strokes, before/after screen ink and decoded export pixels.
`android-run2-api28-autosave-fidelity.mjs` reproduces the same omission through Clear with Auto-Save
enabled and restores that setting off. They exit nonzero on RN-ANDROID-003 and retain complete
results before cleanup.

The API 28 kernel driver uses the documented emulator-console event command, with the measured
qwerty2 axis limits, a guarded portrait viewport and bounded getevent recording. A remote PTY keeps
getevent line-buffered so timeout does not lose the final releases. Android 9 timeout returns 142 in
this image. Each accepted trace verifies all requested contacts went down/up and none remain active;
frame gaps and spatial jumps are recorded. The lifecycle callback interrupts a held contact at its
midpoint.

`android-run2-api28-long-session.mjs` is supplementary API 28 coverage. It delivers 2,000 short
linear adb swipes, samples whole-process meminfo every 200, then samples Clear and Undo-picture
eviction using the imported shared history depth. It records every successfully delivered command;
it does not expose a private app stroke counter or claim physical-device performance approval. It
never substitutes for the phone-specific run. `android-run2-api28-lifecycle.mjs` is the matching
older-device lifecycle supplement, restoring orientation, sensor and Pen width.

The read-only phone-console probe addresses only localhost console port 5680, validates the
Android-console greeting, and uses the existing console credential only in memory if required. Its
output redacts credentials and records read-only status, heartbeat and guest screenshots. Do not
drive another emulator while a functional input run is active; host transport availability queries
are metadata only.

The phone adb recovery uses an owned foreground server on
`localfilesystem:/private/tmp/rn-hunt-private-adb-5680/adb.sock`, tool handle 95849. It starts with
`ADB_LOCAL_TRANSPORT_MAX_PORT=0 ADB_MDNS_AUTO_CONNECT=0` and `--one-device emulator-5680`, which
prevents automatic connections to other devices. A single `host:emulator:5681` registration
addresses only the approved phone. Phone scripts then inherit
`ADB_SERVER_SOCKET=localfilesystem:/private/tmp/rn-hunt-private-adb-5680/adb.sock`. Stop only this
private server and remove its owned socket directory after final restoration; never reset the shared
adb server. Its successful shell and upstream implementation references are in
`android-run2-private-adb-result.json`.

Mid-drag rotation can rerasterize existing ink with per-channel rounding. The API 28 raw strict Undo
comparisons differ by at most 3/255 in two trials. The full-paper raster reviews retain the original
errors and check a tolerance of 4/255; shifting the reference one pixel fails that oracle in
thousands of channels. Subsequent phone rotation checks use that bounded color tolerance; other Undo
comparisons remain exact. These are oracle corrections, not findings.

The phone long-session driver accepts `--warm-repeat` only after the primary cycle succeeds and
while its exact PID is still alive. It uses separate `android-run2-warm-*` files and preserves all
primary raw meminfo. The existing 20 eviction dots form the warm baseline; its final 20-dot paper
must match within the controlled raster tolerance. This compares equivalent drawing states in the
same process. `android-run2-memory-pressure.mjs` is a subsequent same-PID diagnostic: confirmed
background state, the exact COMPLETE command, delayed meminfo, return, new input and Undo. A
rejected trim command is recorded separately from an app failure.

`android-run2-final-verify.mjs <approved serial>` is read-only. Run after that device's restoration
and force-stop. It checks the saved OS baseline, stopped probe PID, installed APK byte digest, and
API 28 storage grants/user flags. Tablet immersive confirmation has only a semantic baseline because
its exact initial key value was not captured. The phone's recovered preinstall value and API 28's
original value were both captured as empty strings.

After all owned processes stop and `results/active-runner.json` has state `complete`, run
`inventory-evidence.mjs`. It rejects symlinks and gitignored evidence, hashes every file except its
own manifest, writes atomically and verifies every recorded digest. Run it after the last formatting
or report edit; redirecting its output into the evidence being hashed would invalidate that file.
