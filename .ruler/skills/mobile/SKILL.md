---
name: mobile
description: React Native Android/iOS guide for toolchain setup, builds, signing, devices, and release checklists. Read before changing native projects, Expo modules, or store release tooling.
---

# Splotch native app

Splotch ships one Expo / React Native / React Strict DOM app (ADR-0182). Metro resolves platform
modules by file extension; Android ink uses Skia, and the web target is a separate static export.
The app and its `android/` and `ios/` projects live at the repository root.

Read the relevant guide:

* [`docs/MOBILE/native.md`](../../../docs/MOBILE/native.md): shared architecture, offline behavior,
  storage, privacy posture, store assets and upload strategy.
* [`docs/MOBILE/android.md`](../../../docs/MOBILE/android.md): Android setup on macOS or Linux,
  Gradle release builds, upload signing and Play submission checklist.
* [`docs/MOBILE/ios.md`](../../../docs/MOBILE/ios.md): Xcode/CocoaPods setup, simulator and device
  builds, archive/export signing and App Store checklist.
* [`docs/MOBILE/compliance.md`](../../../docs/MOBILE/compliance.md): recorded policy text and
  implementation decisions. Verify policy sources before making a new compliance decision.
* [`DEVELOPMENT.md`](../../../DEVELOPMENT.md): development builds, native module changes and device
  iteration.

Use the existing `android:*` and `ios:*` scripts. Ordinary local builds use `art.splotch.app.dev`;
only explicit store targets use `art.splotch.app`. Never install over or clear a store copy with
private drawings. Device capture procedures and ownership live in
[`docs/PROFILING.md`](../../../docs/PROFILING.md) and
[`tools/device-parity/README.md`](../../../tools/device-parity/README.md). Plain Gradle/xcodebuild
scripts produce releases; upload stays manual, with no EAS or fastlane.
