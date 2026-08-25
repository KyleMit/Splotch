# Android emulator in a Claude Code cloud session

An Android emulator **does** run in a Claude Code on the web container, on a dedicated environment
that opts in. It is also slow enough, and limited enough, that it is the wrong tool for most of what
you would want an Android device for. Read the [capability table](#what-it-can-and-cannot-do) before
standing one up.

Everything here was measured in a cloud session, not inferred. Where a claim rules something out,
the command output that ruled it out is quoted.

## Why it is slow: there is no accelerator

A cloud session runs in a **Firecracker microVM**. That VM exposes no `/dev/kvm`, and its virtual
CPU advertises neither `vmx` nor `svm`, so nothing inside it can nest a hardware-accelerated guest:

```
$ ls /dev/kvm
No such file or directory
$ emulator -accel-check
KVM requires a CPU that supports vmx or svm
```

The emulator still runs, because `-accel off` drops QEMU into **TCG** — an interpreter that
translates each guest instruction in software. Everything below follows from that one fact.

Two adjacent options are dead ends, both verified here rather than assumed:

* **An arm64 system image does not help.** Emulator 37 refuses a foreign-ABI AVD outright —
  `Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on x86_64 host` — even
  though it ships a `qemu-system-aarch64` binary. Google removed cross-architecture emulation. The
  guest ABI must equal the host's, so the AVD is `x86_64`.
* **Multi-threaded TCG does not help.** Passing `-qemu -accel tcg,thread=multi` does raise host CPU
  from ~100% to ~190%, but the guest never finishes booting: adb goes `offline` and stays there past
  12 minutes. The emulator's QEMU fork is not safe under x86 MTTCG. Single-threaded TCG — roughly
  one host core — is the only configuration that boots.

## What it can and cannot do

Measured on a 4-vCPU / 15 GB session, AVD `splotch_cloud` (API 34, AOSP `default`, x86_64, 720x1280
@ 320 dpi, 4 GB guest RAM):

| Capability                                            | Status | Notes                                         |
| ----------------------------------------------------- | ------ | --------------------------------------------- |
| Emulator boots to `sys.boot_completed=1`              | ✅     | ~21 min cold; highly variable                 |
| `adb` device online, shell, `getprop`, `logcat`       | ✅     | Fully functional                              |
| `adb install` an APK                                  | ✅     | ~20 s for Splotch's 12 MB debug APK           |
| `am start` an activity; launcher and system UI render | ✅     | `screencap` returns real frames               |
| `adb shell input tap/swipe/keyevent`                  | ✅     | Taps land; each round trip costs seconds      |
| Gradle `assembleDebug` in the same container          | ✅     | ~2 m 20 s, unrelated to the emulator          |
| **Splotch's WebView renders**                         | ❌     | Renderer dies repeatedly — see below          |
| AVD snapshot save **and restore**                     | ❌     | Save works; restore always fails under TCG    |
| Any performance measurement                           | ❌     | ~50-100x slower than hardware; scores nothing |

### The WebView is the blocker for this app

Splotch is a Capacitor app, so everything the user sees is a WebView. On this emulator the WebView
renderer process crashes at a fixed faulting offset in `libwebviewchromium.so`, taking the app with
it:

```
E chromium: [ERROR:aw_browser_terminator.cc(156)] Renderer process crash detected (code 5).
F chromium: [FATAL:crashpad_client_linux.cc(732)] Render process's crash wasn't handled ...
F libc   : Fatal signal 5 (SIGTRAP), code 128 (SI_KERNEL) ... in art.splotch.app
```

`SIGTRAP`/`SI_KERNEL` is Chromium's deliberate `IMMEDIATE_CRASH`, i.e. a failed internal check
rather than an illegal instruction. The guest CPU that TCG presents is threadbare —
`ssse3 sse4_2
popcnt aes`, with no `avx`, `avx2`, `f16c`, `fma`, or `bmi*`, and the emulator logs
`TCG doesn't support requested feature: CPUID.01H:ECX.avx` at startup — which is the most likely
reason a Chromium check fails here and does not on hardware. Lowering the panel to 720x1280, raising
guest RAM to 4 GB, and switching between `swiftshader_indirect` and `guest` GL each changed how far
it got; none of them stopped the crash.

The system's own UI is unaffected — the AOSP launcher, wallpaper, icons and dialogs all render — so
the emulator is genuinely working. It is specifically Chromium that will not survive on it.

**So: this environment is for the Android toolchain, not for looking at Splotch.** Building,
signing, installing, `adb` inspection, manifest and permission checks, and native-shell behaviour
that does not depend on WebView paint are all in reach. Seeing the drawing canvas is not; use a
physical device or the
[phone preview tunnel](../../docs/CLOUD/Claude.md#previewing-the-dev-server-on-a-phone), which
serves the real app to a real browser and costs none of this.

### Expect "isn't responding" dialogs

Under TCG the guest is slow enough to trip Android's own watchdogs during and after boot —
`Process system isn't responding`, `System UI isn't responding`. They are a symptom of the
interpreter, not of a broken image. Dismiss with a tap on **Wait**, or suppress the background ones:

```bash
adb -s emulator-5554 shell settings put global anr_show_background 0
```

Lowering the panel resolution is what most reduces them; the AVD is provisioned at 720x1280 for
exactly this reason, rather than a stock Pixel profile's 1080x2340 @ 440 dpi.

## How the environment is set up

The emulator lives on its **own cloud environment**, not on the default one — the toolchain adds ~5
GB to the snapshot, and a session that only needs to run tests should never carry it. Both
environments run the same committed setup script; a single env var separates them.

| File                                        | Role                                                            |
| ------------------------------------------- | --------------------------------------------------------------- |
| `.claude/cloud/environment.android.example` | Committed record of the android environment's dialog config     |
| `.claude/cloud/setup.sh`                    | Shared entry point; dispatches on `SPLOTCH_CLOUD_PROFILE`       |
| `.claude/cloud/setup-android-emulator.sh`   | SDK, system image, and AVD provisioning (lands in the snapshot) |
| `.claude/hooks/cloud-android-emulator.sh`   | SessionStart hook; starts the cold boot in the background       |

Set `SPLOTCH_CLOUD_PROFILE=android` in the android environment's dialog and add `dl.google.com` to
its allowed domains. Leave the var unset everywhere else — every piece above is inert without it,
which is what keeps the default box lean. `docs/CLOUD/Claude.md`,
["Committing the environment config"](../../docs/CLOUD/Claude.md#committing-the-environment-config),
covers why these files are the reviewable copy of a cloud object that has no as-code provisioning.

Three choices here are worth stating, because each had a plausible alternative:

* **A profile var, not a second setup script.** A separate `setup-android.sh` would have to repeat
  the shared steps (pnpm, Playwright, chisel), and those two copies drift. Dispatching on
  `SPLOTCH_CLOUD_PROFILE` keeps one entry point and makes the extras additive — a future use case
  adds a profile rather than another script.
* **Deltas, not a full second config file.** `environment.android.example` records only what differs
  from `environment.example`, for the same reason: two full copies of the shared allowed-domains and
  env list would diverge silently.
* **A tuned AVD, not a stock Pixel profile.** 720x1280 / 320 dpi / 4 GB instead of 1080x2340 / 440
  dpi / 1536 MB. Fewer pixels through SwiftShader is what most reduces the ANR dialogs, and baking
  it into provisioning means no session has to rediscover it.

### Why the boot starts at session start

The obvious "ready at launch" design — boot once during setup, snapshot the AVD, restore it in
milliseconds per session — **does not work here.** Saving a snapshot succeeds (5 s, 1.3 GB);
restoring one never does:

```
INFO    | Loading snapshot 'clean1'...
qemu-system-x86_64-headless: error while loading state for instance 0x0 of device 'ram'
WARNING | Error -22 while loading VM state
WARNING | Failed to load snapshot 'clean1'
USER_INFO | The emulator is performing a cold boot without a saved state ...
```

Note the last line: **a failed restore silently falls back to a cold boot.** A timing harness that
does not read the log will report a snapshot restore that never happened. Do not trust a restore
without grepping for `Failed to load snapshot`.

Because there is no fast path, the SessionStart hook starts the cold boot in the background at t=0
and returns immediately. That is the whole of "ready at launch", and it buys less than it sounds
like: two clean fresh-userdata boots measured **1279 s and ~1309 s** (`Boot completed in 1278690 ms`
in the emulator log), i.e. **~21 minutes**, one with `-gpu swiftshader_indirect` and one with
`-gpu guest` — the GL backend makes no difference. Earlier, faster figures on this page's history
came from AVDs whose data partition was already initialised; a **first** boot pays the full package
scan on a single interpreted core, and that is what a fresh session gets. Treat ~20 minutes as the
planning number and expect variance around it.

So: start other work immediately, and come back to the device rather than waiting on it. When you do
wait, block **under a deadline** — never bare:

```bash
timeout 540 bash -c 'adb -s emulator-5554 wait-for-device && until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d "\r")" = 1 ]; do sleep 10; done' \
  && echo "emulator ready" \
  || echo "not ready in 540s — read /tmp/splotch-emulator-boot.log; if it is still booting, run this again"
```

**Both stages hang forever on a dead emulator**, so neither may be run bare. `wait-for-device` never
returns if the emulator died before registering with adb, and the `sys.boot_completed` loop never
exits if it registered but never finished booting — each returns 124 under `timeout` rather than
ever completing. The 540 s deadline sits under the environment's 600 s foreground Bash limit on
purpose: past that limit Claude *detaches* a command rather than killing it, which would leave
exactly the unbounded background task the deadline exists to prevent (`docs/CLOUD/Claude.md`,
["Bounding long-running work"](../../docs/CLOUD/Claude.md#bounding-long-running-work)).

**Expiry is the normal case, not a failure.** At ~21 minutes of boot against a 540 s bound, a wait
started early needs **two or three rounds**; that is the price of never leaving an unbounded command
behind. Before re-running, confirm the boot is still progressing rather than wedged — a healthy
guest keeps producing lines here:

```bash
adb -s emulator-5554 logcat -d -t 5     # advancing = still booting; run the wait again
```

A guest that is genuinely stuck shows adb `device` (or `offline`) with a static logcat and no
`Boot completed` in `/tmp/splotch-emulator-boot.log`. Never run two emulators against one AVD to
"hurry it up" — they share `userdata-qemu.img`, and the corruption costs another full cold boot.

`adb` itself resolves because provisioning symlinks it into `/usr/local/bin`; nothing exported by
the setup script survives into a session, and `platform-tools` is not on the default PATH. If that
step warned, call `$ANDROID_SDK_ROOT/platform-tools/adb` by its full path instead.

## Running Splotch on it by hand

```bash
export ANDROID_SDK_ROOT=/opt/android-sdk   # adb is already on PATH via /usr/local/bin
npm run build:cap                       # static native export
npx cap sync android
echo "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties
(cd android && ./gradlew assembleDebug --no-daemon)
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n art.splotch.app/.MainActivity
adb -s emulator-5554 exec-out screencap -p > /tmp/shot.png
```

Everything up to and including `am start` works. The screenshot will show the app's window and then
its crash, for the reason in [the WebView section](#the-webview-is-the-blocker-for-this-app).

## If you need more than this

The constraint is the missing accelerator, and nothing inside the container can add one. The paths
that actually solve it are all outside:

* **A physical device** — the only target that can be profiled at all
  ([`docs/PROFILING-ANDROID.md`](../../docs/PROFILING-ANDROID.md)).
* **A cloud device farm** (Firebase Test Lab, or a hosted device cloud) driven from the session over
  the network — real hardware, no local virtualization, and the natural home for
  [Maestro](../../docs/TESTING.md) smoke runs.
* **A CI runner with nested virtualization enabled**, where the stock KVM-accelerated emulator runs
  normally.
