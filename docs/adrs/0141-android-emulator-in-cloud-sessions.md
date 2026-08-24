# ADR-0141: Android Emulator in Cloud Sessions — a Separate Environment, Not a Default

**Status:** Accepted\
**Date:** 2026-08

## Context

[`docs/CLOUD/Claude.md`](../CLOUD/Claude.md) told contributors to skip the Android toolchain in a
Claude Code on the web session because "there's no emulator … in a cloud container". That was an
assumption, never a measurement, and it decided two things at once: whether an emulator *can* run
there, and whether it *should* be provisioned. This ADR separates them, because the answers differ.

The question matters because the alternative — the phone-preview tunnel (ADR-0021) — serves the web
app to a real browser and therefore cannot exercise anything native: the Capacitor bridge, the
Android manifest as built, plugin permissions, or the packaged APK.

## What the measurements found

A cloud session runs in a Firecracker microVM (`6.18.44-fc-v21`). It exposes **no `/dev/kvm`**, and
its virtual CPU advertises neither `vmx` nor `svm`, so no hardware-accelerated guest can be nested
inside it. `emulator -accel-check` agrees: `KVM requires a CPU that supports vmx or svm`.

An emulator nonetheless **boots and works** with `-accel off`, which drops QEMU into TCG, a software
interpreter. On a 4-vCPU / 15 GB session, API 34 AOSP x86_64:

* Cold boot to `sys.boot_completed=1`: **350-500 s**.
* `adb` shell, `logcat`, `install`, `am start`, `input tap`, `screencap`: all functional. Splotch's
  debug APK installs in ~20 s and its activity launches.
* Gradle `assembleDebug` in the same container: ~2 m 20 s, independent of the emulator.

Three would-be improvements were tried and rejected on evidence, not on reputation:

* **arm64 system image.** Emulator 37 refuses it —
  `Avd's CPU Architecture 'arm64' is not supported
  by the QEMU2 emulator on x86_64 host` — despite
  shipping a `qemu-system-aarch64` binary. Google removed cross-architecture emulation, so the guest
  ABI must match the host's.
* **Multi-threaded TCG** (`-qemu -accel tcg,thread=multi`). Host CPU rises from ~100% to ~190%, but
  the guest never boots: adb goes `offline` and stays there past 12 minutes. The emulator's QEMU
  fork is unsafe under x86 MTTCG. Single-threaded TCG is the only configuration that works, which
  caps the whole thing at roughly one host core.
* **AVD snapshots.** Saving works (5 s, 1.3 GB). Restoring *never* does —
  `error while loading state
  for instance 0x0 of device 'ram'`, on both a snapshot taken across a
  config change and one taken and reloaded on an otherwise untouched instance. Worse, **a failed
  restore silently cold-boots**, so a harness that does not read the log will report a fast restore
  that never happened.

Two hard limits remain, and they are what shape the decision:

* **Splotch's WebView will not render.** The renderer process dies at a fixed offset in
  `libwebviewchromium.so` with `SIGTRAP`/`SI_KERNEL` — Chromium's deliberate `IMMEDIATE_CRASH`, a
  failed internal check — taking the app with it. The guest CPU TCG presents is threadbare
  (`ssse3 sse4_2 popcnt aes`; no `avx`, `avx2`, `fma`, `bmi*`, with the emulator logging
  `TCG doesn't support requested feature: CPUID.01H:ECX.avx`), which is the likeliest cause. Panel
  size, guest RAM, and both GL backends were varied; each changed how far it got, none stopped it.
  The AOSP launcher and system UI render fine, so the emulator itself is healthy — it is Chromium
  specifically that cannot survive.
* **Nothing measured on it means anything.** At ~50-100x slower than hardware the guest trips
  Android's own ANR watchdogs during normal operation. ADR-0078's capacity model and the committed
  performance matrix assume real targets; this is not one.

## Decision

**Provision the emulator on a dedicated cloud environment, opted into by
`SPLOTCH_CLOUD_PROFILE=android`, and start its cold boot from the SessionStart hook.**

* One committed setup script keeps serving every environment.
  [`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh) dispatches on the profile var and sources
  [`setup-android-emulator.sh`](../../.claude/cloud/setup-android-emulator.sh) only when it lists
  `android`. The default environment is untouched — the var is simply absent there. A second setup
  script was rejected: the shared steps (pnpm, Playwright, chisel) would drift between copies.
* The android environment's dialog config is committed as
  [`environment.android.example`](../../.claude/cloud/environment.android.example), recording only
  its **deltas** from `environment.example`, for the same reason ADR-0021 committed the first one:
  these are stateful cloud objects with no as-code provisioning, so the file is the reviewable copy.
* [`.claude/hooks/cloud-android-emulator.sh`](../../.claude/hooks/cloud-android-emulator.sh) starts
  the boot in the background at t=0 and returns immediately. With snapshot restore unavailable,
  overlapping the 6-8 minute boot with the session's first real work is the only "ready at launch"
  there is. The hook is inert off-cloud and inert without the profile.
* The AVD is provisioned at **720x1280 / 320 dpi with 4 GB** rather than a stock Pixel profile's
  1080x2340 / 440 dpi / 1536 MB. Fewer pixels through SwiftShader is what most reduces the ANR
  dialogs, and it is a provisioning-time decision so no session has to rediscover it.
* [`docs/CLOUD/ANDROID-EMULATOR.md`](../CLOUD/ANDROID-EMULATOR.md) carries the capability table and
  the runbook, per ADR-0107: this is reference material read by lookup, so it lives in `docs/` and
  the cloud doc routes to it.

**The default environment does not get this**, and that is the point of the profile. The toolchain
adds ~5 GB to the snapshot and minutes to its build, for a device most sessions never want.

## Consequences

* An Android environment can build, sign, install, and `adb`-inspect the native app without a
  physical device — the gap the tunnel could not cover.
* **It cannot show you Splotch.** Anyone reaching for this to look at the app should use the phone
  preview tunnel or a physical device instead; the doc says so at the top so the discovery is not
  re-made per session.
* Performance work is explicitly out of scope here and stays on the targets
  [`docs/PROFILING-ANDROID.md`](../PROFILING-ANDROID.md) names. ADR-0078's model is unaffected.
* The claim in `docs/CLOUD/Claude.md` that a cloud container has no emulator was wrong and is
  corrected. The narrower true statement — no Xcode, no USB device — remains.
* If the WebView crash is ever worth fixing, the lead is the missing CPU features, and the fix is
  outside the container: a runner with nested virtualization, or a cloud device farm driven over the
  network. Neither is blocked by anything decided here.
