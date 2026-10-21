# Android configuration survival sweep

UTC 2026-10-21. Scope overrides the broader overnight brief: Android only, no AI, no product edits,
commits, pushes or GitHub access. Only emulator-5688 (API34 phone), emulator-5690 (API36 tablet),
emulator-5686 (API28 phone), sequentially. Earlier hunt evidence remains untouched.

Source checkout: `43affe93cf1a` (full hash in evidence). User-supplied Release APK
`rn-tip-3fed2d55.apk`; artifact hash and installed package metadata recorded separately. Results
describe this APK, not an assumed exact checkout build.

## Oracle and protocol

Draw a multi-stroke house with chimney/door, expose Undo, and take a baseline PNG, UI tree, PID,
`dumpsys activity` and lifecycle events. For each applied setting capture again, use Undo and
confirm one stroke disappears, add a replacement stroke, restore the original setting and repeat the
capture/Undo check. Preserve full raw evidence and a machine-readable observation per capture. Same
PID alone is insufficient: compare `wm_on_create_called` / `am_on_create_called`, relaunch events
and the local activity identity too. Do not clear shared log buffers.

Pass requires unchanged PID and activity, recognizable retained ink, functional enabled Undo, and
correctly fitting chrome. An unsupported command or a setting that never reaches the activity is
blocked, not a pass. Known RTL mirroring/partly unpainted paper belongs to issue 3140 and will only
be annotated. New findings require two fresh reproductions.

The in-memory lifecycle oracle is `experiments/native-architecture/DEVELOPMENT.md` (Configuration
changes, Large OS text); the manifest's `MainActivity` configChanges and
`tools/migration/tests/native-config-changes.test.mjs` pin coverage. LIFE-1 in
`docs/scratchpad/2026-10-18-device-parity/execution-plan.md` specifies settings survive a process
restart and ink does not. No shipping runtime comparison is authorized or inferred.

## Cases on each device

| Case       | Apply, observe, restore                                         | Expected / applicability                                                                        |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| FONT       | system font_scale 2.0 then 0.85                                 | Retain drawing/Undo; live text layout, all devices                                              |
| DENSITY    | wm density at 125% then 80% physical density                    | Retain drawing/Undo and fit resized logical viewport                                            |
| APP-LOCALE | cmd locale set-app-locales fr-FR then ar                        | API33+; retain state, annotate known RTL issue                                                  |
| SYS-LOCALE | Settings system language fr-FR then ar                          | All devices where reachable; verify effective configuration                                     |
| NIGHT      | cmd uimode night yes then no                                    | Retain state and correct light/dark paper/chrome                                                |
| ROTATE     | user_rotation landscape and portrait                            | Phone portrait lock holds; tablet both orientations, including app orientation option if needed |
| MULTI      | Split with Settings, resize, exit                               | API34 phone/API36 tablet; verify actual multi-window config, state and usable controls          |
| FREEFORM   | windowingMode 5, resize and exit                                | Attempt if OS supports; report blocked if unavailable                                           |
| BOLD       | secure font_weight_adjustment 300                               | API31+; retain state; documented weight refresh may wait for launch                             |
| CONTRAST   | secure high_text_contrast_enabled 1                             | All supported; retain state and usable chrome                                                   |
| KEYBOARD   | emulator hardware keyboard/input configuration                  | Verify effective keyboard config change; report unsupported honestly                            |
| NAV        | gesture / three-button navigation overlay                       | Where available; restore original enabled overlay                                               |
| TRIM       | Background, send-trim-memory COMPLETE, foreground               | Live process retains ink/Undo; capture PID and lifecycle                                        |
| KILL       | Background, am kill, relaunch                                   | New PID/activity, unsaved ink/Undo gone is expected; settings and saved pictures persist        |
| SAVE28     | Change font, save multi-stroke drawing, permission if requested | API28: verify published PNG in MediaStore and file bytes/ink                                    |

Start API34 immediately; tablet by 11:20Z, API28 by 11:40Z. Final report and process cleanup by
11:55Z. Status updates at phase transitions and no less often than every 20 minutes. Repro
scripts/results/evidence stay within this directory. Record blocked/unexecuted subcases explicitly.
Existing manifest guard covers flag omissions; no speculative product test or product modification
is needed for this empirical-only sweep.
