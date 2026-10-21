# Running the Android configuration sweep

Every driver rejects serials except emulator-5686, emulator-5688 and emulator-5690. Run one device
at a time. No script contacts AI or the web, installs another app, clears package data, or writes
product source.

`sweep.py SERIAL init` records original settings once. `draw-uinput.py SERIAL LABEL` draws a
nine-stroke house through a temporary virtual touchscreen; `sweep.py SERIAL draw LABEL` is the
adb-input fallback. `sweep.py SERIAL change LABEL APPLY RESTORE` captures
before/applied/Undo/restored/Undo states. `batch.py` runs the simple configuration cases.
`remaining.py` runs system locales, rotation, navigation, keyboard, memory trim and process death.
Always review command errors and effective configurations; a screenshot alone does not establish an
accepted change.

`keyboard.py` uses `config-input-arm64 keyboard 30` to attach and detach a real Linux virtual
keyboard, and records Android's effective configuration and input-device inventory. The initial
built-in `uinput` JSON attempt was rejected on API34, so its unchanged configuration is not counted
as coverage. `draw-uinput.py` uses the same helper's touch mode for a recognizable house.

The native helper source is `config-input.c`, compiled with the installed Android NDK's
`aarch64-linux-android24-clang -O2 -Wall`. Its virtual device is destroyed when its file descriptor
closes. It never injects Back. The temporary device files under `/data/local/tmp/config-sweep-*` and
`/sdcard/config-sweep*.xml` are removed at signoff.

`locale-helper/ConfigLocale.java` requests a system locale through Android's ActivityManager
configuration API under the emulator shell's existing permission. Compile against the installed
Android SDK with javac, convert its class with build-tools d8, and push `classes.dex` to
`/data/local/tmp/config-sweep-locale.dex`. Run
`CLASSPATH=/data/local/tmp/config-sweep-locale.dex app_process /system/bin ConfigLocale fr-FR`,
`ar`, or the original locale. The driver separately captures the actual configuration. This avoids
assuming that writing `system_locales` alone changes the running system locale.

`contrast-repro.py` reproduces RN-CONFIG-001 twice from fresh processes. It uses the adb-input
fallback and restores high-contrast text afterward. The strokes may be sparse under adb swipe
injection; the immutable ink is sufficient to establish blanking and recovery. The complete house
used for window/input checks comes from direct virtual touch input.

`analyze.mjs SERIAL...` counts purple ink only inside the paper and records masks and Undo deltas. A
zero or negative Undo delta is a review signal, not an automatic product failure. Layout changes,
texture bounds, intentional Undo, and capture timing need review.
`contact-sheet.mjs EVIDENCE_DIRECTORY` makes labeled review sheets from captured PNGs.

Deleting `font_weight_adjustment` after setting300 does not reset Android's effective value on
API34. Set0 first, then restore the original absent key. Validate both stored settings and the
activity's effective configuration. Expected empty `pidof` after `am kill` returns status1; the
first API34 runner treated that as an error, and the relaunch capture was completed separately. That
runner error is not a product defect.
