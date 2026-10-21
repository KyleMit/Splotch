# RN Android emulator observations

Candidate b236d639160459eecd60900926c759af5d4ae080; Release APK supplied by orchestrator. API 36,
1080×2400. Dedicated emulator only. No other Android device addressed.

The APK was temporarily absent at the brief's path and appeared during this run. Installation with
`install -r` succeeded. First launch displayed Android's immersive-mode tutorial; it was
acknowledged after checking that the probe remained the focused app. This is OS onboarding, not a
product finding. See `../evidence/android-install.log.txt`, `android-launch.log.txt` and
`android-immersive-tip.png`.

Every input uses Display0 foreground checks in `../repro/android-driver.mjs`. System Back is allowed
only after a current hierarchy proves a dialog is open. Screenshots before the helper revision are
diagnostic transition frames; files with `.settle.json` record the later three-frame settle check
after one second. Audio, haptics and physical-touch properties are not established.

| Case                  | Status  | Observation and evidence                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boot                  | pass    | Root paper, palette, Settings and drawer visible; `android-boot.png`, `android-boot.xml`.                                                                                                                                                                                                                                                                                                                                |
| D01 initial admission | partial | Three separate adb swipes produced 3 Undo units: `android-three-strokes.xml`, `android-undo-1.xml`, `android-undo-2.xml`, `android-undo-3.xml`. Undo enabled after first and second, disabled after third. Continuous uinput motion produced one unit: `android-joined.xml` enabled, `android-joined-undo.xml` disabled. Path shapes differ between these initial subchecks; exact same-path follow-up remains required. |

Other plan cases remain unrun until their result is appended below. A partial result does not pass
the unobserved subcases.

## First public-control batch

* D02/D03/D04/D05 **partial pass**: selected Pen, Crayon, Magic and Eraser through Brushes; drew a
  500 ms stroke with each. Pen solid line and Crayon texture visually inspected; Eraser removed the
  Magic stroke on the same path. Evidence `android-brush-Pen.png`, `android-brush-Crayon.png`,
  `android-brush-Magic-brush.png`, `android-brush-Eraser.png` and matching XML/settle records. Dots,
  edges, every eraser/brush combination and page-based Magic remain unrun.
* S01–S08 **partial pass**: opened Appearance, Sound, Tool Drawer, Accessibility, Coloring, AI Art
  and Saving, returning to hub with Back each time. Titles and expected controls present in
  `android-settings-*.xml` with settled PNGs. No settings mutated in this batch. All seven extra
  books had already finished downloading by the Coloring inspection; fresh-install download timing
  is therefore unrun.
* G01/G04 **partial pass**: Parent Center raised a multiplication gate. Android hardware digit keys
  entered 32 for 4×8, Delete removed the last digit (rendered answer 3), a final digit and Enter
  opened Parent Center. Evidence `android-parent-gate.*`, `android-gate-hardware-delete.*`,
  `android-parent-center-unlocked.*`. Policy controls readable in the scrollable phone layout. No
  policy changed. Lockout and session-policy lifetime remain unrun.

* P01 **partial pass**: Save screenshot produced an owned, non-pending MediaStore PNG at
  `Pictures/Splotch/`; content read back and decoded as 1080×2067 RGBA PNG. Evidence
  `android-mediastore.txt`, `android-saved-output.png`, `android-saved-metadata.json`. This save
  contained the tested Pen/Crayon ink; coloring art and save cooldown remain unrun.
* L03 **pass for section dismissal**: hardware Back from Sound closed all of Settings and retained
  ink. `android-system-back-hub.*` is named after the initial harness expectation, but actually
  shows root. Source `rsdDrawing/RsdSettingsDialog.tsx:183` explicitly makes Android Back close
  Settings from any section; only header Back returns to hub. The old LIFE-1 slice also records
  this. No defect. The driver refused a second Back on root.
* D09 **partial pass**: selected `#FFB3C1`, dismissed by scrim and reopened Custom Color; visible
  ring and selection retained (`android-custom-selected.*`, `android-custom-reopened.*`). Drag and
  recall after a different swatch remain unrun.

* X01/X02 **pass for inspected subcases**: at OS font scale 2.0 the Settings hub and Accessibility
  section show complete visible labels and reachable Close/Back controls. OS dark mode while app
  appearance remained System changed root/Settings to dark with readable text. Inspected originals
  `android-font2-hub.png`, `android-dark-font2-settings.png`; other matching PNG/XML files retain
  the sequence. This does not close known issue 2985 or establish every maximum-font dialog. OS
  font, rotation and night mode restored (`android-restored-os-settings.txt`).
* L02 rotation take **blocked by setup**: the files named `android-landscape.*` and
  `android-landscape-settings.*` remain portrait because user_rotation did not turn the emulator
  sensor. They are invalid landscape evidence. The existing parity driver explicitly uses
  `adb emu rotate` for this reason; a sensor-driven follow-up is required.

* D01 **pass**: the same 75-point uinput path was split into three contacts, then replayed as one
  continuous contact. Undo enabled until press 3 in the split run, and disabled after press 1 in the
  joined run. Assertions live in `repro/android-touch-admission.mjs`; evidence
  `android-admission.log.txt`, `android-admission-separate-*`, `android-admission-joined-*`. Both
  runs started without earlier ink/history.
* D06 **partial**: five simultaneous uinput contacts produced visible ink and one Undo cohort;
  `android-five-contacts.*`, `android-five-contacts-undo.*`. This is emulator synthetic multitouch;
  it does not prove physical input density, palm behavior, or every brush.

* L02/D14 **pass for layout rotation subcase**: emulator sensor rotation under Auto produced a
  2400×1080 landscape frame with Colors replacing the top palette and the full action row available.
  Settings switched to its compact landscape shell and explanatory portrait note. Evidence
  `android-sensor-landscape.*`, `android-sensor-landscape-settings.*`,
  `android-sensor-rotation.log.txt`. Original sensor acceleration restored. Ink retention was not
  scored in this take because the admitted history check had ended blank.

* G02 **pass** on the fresh-process take: three wrong answers produced a 30-second pause with
  visibly dimmed keypad. Tapping during the pause did not fill an answer; after the pause, the gate
  announced it was ready and a correct 3×4 answer opened Parent Center. Evidence
  `android-gate-lockout-fresh.log.txt`, `android-gate-lockout-raw.png`,
  `android-gate-lockout-after-tap.png`, `android-gate-lockout-ended.xml`,
  `android-gate-after-lockout-unlocked.*`, `android-gate-lockout-timing.json`. Earlier
  `android-gate-lockout.log.txt` and `android-gate-lockout-retry.log.txt` are **invalid harness
  takes**: UIAutomation could not reach idle during the timer and the old helper read stale XML.
  Their XML and claimed unlocked state must not be used. The corrected helper removes old XML and
  rejects unsuccessful dumps.

* C01/C03/P01/D04/D12 **pass for offline page subchecks**: in airplane mode, opened Farm and Cat,
  selected Magic, and drew a continuous colored reveal through the actual Cat art. Clear left Cat
  line art, Undo restored the reveal, and Save ran while offline. Original images inspected:
  `android-offline-cat-magic.png`, `android-undo-clear-page.png`. Full sequence in
  `android-offline-cat.*`, `android-clear-page.*`, `android-offline-save-page.*`. Airplane mode
  restored to disabled. This does not establish uncached download errors or every book's bytes.

- S01/S10–S13 **pass for entry/return subchecks**: after scrolling the landed hub, opened Install,
  Feedback, What's New (Updates), and About; each section showed its expected controls and returned
  via header Back. Thus all twelve Settings section entries have been exercised. Evidence
  `android-settings-install.*`, `android-settings-feedback.*`, `android-settings-whats-new.*`,
  `android-settings-about.*`, and the lower hub frame. No feedback submitted, pinning enabled, or
  external information link opened. Initial tail takes were harness failures: first the swipe ran
  before the dialog landed, then header Back reset scroll. The helper now rejects tap centers
  outside scrolling bounds; later steps land the dialog and scroll to the next row explicitly.
- P01 offline file verification **pass**: MediaStore row 20 is owned by the probe, non-pending;
  `android-offline-saved-page.png` decodes and visibly includes Cat line art and Magic reveal. See
  `android-mediastore-offline.txt`.

- L06 **pass for the scripted workload**: a 60,000 ms, five-contact uinput scribble completed with
  the same app PID before/after (14494). The full command plus settled capture took 68,198 ms. Ink
  visible, chrome remained available, and Undo accepted. Evidence `android-stress-result.json`,
  `android-stress.log.txt`, `android-stress-five-after.*`, `android-stress-five-undo.*`. No
  performance or physical sample-fidelity claim is made.
- D04 blank-paper repeat **no reproduced defect**: early adb-swipe take
  `android-brush-Magic-brush.png` has gaps. Controlled uinput repetitions produced the full colored
  curve (`android-magic-control-1.png`, `android-magic-control-2.png`); the first also retains an
  isolated initial dot. The fixture jumps immediately from its starting dot to the first curve
  sample, and dropped-pointer recovery intentionally refuses stale large jumps
  (`drawing/contactResponder.ts:70`). Input timing was not traced, so the initial fragmentation is
  not assigned a product cause or counted as a complete continuity pass. It does not meet the
  two-reproduction finding threshold.

- L04 **pass for exercised lifecycle subchecks**: `RUNNING_CRITICAL` trim-memory and Home/resume
  preserved byte-identical pixels in the paper crop (x200/y500, 650×1400) and kept Undo enabled.
  Force-stop/relaunch changed the paper to blank and disabled Undo, as the removed-restoration
  contract specifies. Evidence `android-lifecycle-paper-digests.json`,
  `android-before-memory-warning.*`, `android-after-memory-warning.*`,
  `android-after-home-resume.*`, `android-after-process-death.*`,
  `android-memory-lifecycle.log.txt`. This is emulator lifecycle evidence, not physical
  background-download or auto-lock acceptance.

## Phase 4 native follow-up

* S04/L01 **pass for four preference subchecks**: disabled all five optional drawing tools and
  verified their switches, hidden root controls, and persisted choices after force-stop/relaunch.
  Restored those choices, disabled the master switch, and verified it also persisted. All switches
  restored. Evidence `android-tool-preferences-results.json`, `android-tools-all-optional-off.*`,
  `android-tools-off-expanded.*`, `android-tool-off-persisted-section.*`,
  `android-drawer-disabled-persisted-section.*`, `android-drawer-preferences-restored.*`. The
  initial assertion that disabling the master must remove the entire dock was wrong: Camera and
  Coloring are independent (`rsdDrawing/RsdActionsPanel.tsx:119`). Its failure log is retained as
  `android-tool-preferences-invalid-expectation.log.txt`; the corrected full rerun passed.
* D12 **pass for four gesture subchecks**: short drag and a drag beyond the threshold then back
  preserved byte-identical paper pixels. A full drag restored the original blank crop; Undo restored
  the original ink crop exactly. Compared x200/y600, 650×1300. Evidence
  `android-clear-cancel-results.json`, `android-clear-cancel-ink.*`,
  `android-clear-short-returned.*`, `android-clear-reversed-returned.*`,
  `android-clear-full-committed.*`, `android-clear-full-undone.*`. The initial adb ink swipe has
  fragmented geometry; this take scores cancellation and deletion only, not stroke continuity.
* D11 **pass for bounded history and exhausted-history subchecks**: drew 25 distinct dots; Undo
  remained available after 19 presses and became unavailable after 20, leaving pixels identical to
  the first five dots. An extra Undo preserved them. Source `drawing/model.ts:134` imports shipping
  `web/src/lib/drawing/undoHistory.ts` MAX_UNDO_DEPTH. The plan initially confused removed
  stroke/point caps with Undo depth; that incorrect 25-Undo expectation and its raw take are
  preserved under `android-deep-undo-invalid-*`. The corrected driver and D11 use the shared
  20-action policy. Evidence `android-deep-undo-results.json`, `android-deep-undo-retained-base.*`,
  `android-deep-undo-25-dots.*`, `android-deep-undo-one-left.*`, `android-deep-undo-exhausted.*`,
  `android-deep-undo-extra-press.*`.
* X06 **pass for two hardware-shortcut subchecks**: a fresh stroke enabled Undo; Android Ctrl+Z
  removed it and restored the five-dot base exactly. Escape dismissed the open Brush Menu. Evidence
  `android-deep-undo-new-stroke.*`, `android-deep-undo-new-undone.*`,
  `android-shortcut-brushes-open.*`, `android-shortcut-brushes-escaped.*`. Text-field isolation and
  segmented-choice arrow navigation remain unrun.
* D10 **pass for Pen/Eraser five-width output subchecks**: selected each Size 1–5 and Eraser size
  1–5 through their menus and drew controlled 60-step paths at 16 ms cadence. The x550 pixel scans
  measured Pen widths 5/10/20/36/58 px and erased gaps 10/22/42/74/116 px. Each is strictly
  increasing and within 2 px of `drawing/strokeWidth.ts` at the emulator's density 420 (2.625 pixels
  per dp). Both restored to size 3 and Pen selected. Originals visually inspected:
  `android-widths-pen-five.png`, `android-widths-eraser-five.png`; measurements in
  `android-widths-results.json`. Baseline menu and last Pen choice have XML evidence. Crayon and
  Magic at every width remain unrun.
* L05 **pass for warm-cache offline cold launch**: force-stop/relaunch in airplane mode created a
  different app PID, displayed Drawing paper, and admitted a controlled stroke with Undo available.
  Wi-Fi status explicitly reports disabled. Evidence `android-offline-cold-results.json`,
  `android-offline-cold-root.*`, `android-offline-cold-drawn.*`. Airplane mode restored in
  `finally`. This does not establish a fresh install without downloaded extras.
* S02/S03/S05/S06/S08 **pass for eight preference subchecks**: Camera off removes Save;
  Camera/Auto-Save choices persist; Coloring off removes its root action and persists while
  retaining all seven cached extra books; Reduce Motion persists; Sound master and separate
  Drawing/Deleting preferences persist; Dark/Flat persist across process restart. Every tested
  preference restored (System/Raised, sound/sources on, motion off, Camera/Coloring on, Auto-Save
  off). Evidence `android-settings-preferences-results.json`, the
  `android-prefs-*-persisted-section.*` files, `android-prefs-*-restored.*`,
  `android-prefs-camera-hidden.*`, `android-prefs-coloring-hidden.*`,
  `android-prefs-dark-flat-root.*`. The Dark/Flat root original was visually inspected. This
  establishes UI/state persistence, not audible output, motion timing, or actual Auto-Save on
  Delete.
* P02 **pass for three save subchecks**: eight scheduled Camera taps in a 1,376 ms burst produced
  exactly one new owned, published MediaStore image (row 21). The command including device
  registration took 3,851 ms; after subtracting its 1,500 ms registration delay the whole burst
  remains inside the source's 4,000 ms cooldown. A following drawing added 7,293 purple pixels in
  the isolated paper crop. After the settled capture elapsed, a new Save produced one further owned
  published image (row 22). Evidence `android-save-cooldown-results.json`,
  `android-save-cooldown-mediastore.txt`, `android-save-cooldown-before.*`,
  `android-save-cooldown-after-burst.*`, `android-save-cooldown-after-next.*`. This does not test
  failed saves or exact polaroid animation timing.
