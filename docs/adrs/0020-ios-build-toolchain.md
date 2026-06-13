# ADR-0020: iOS Build Toolchain (Swift Package Manager, xcodebuild Scripts, Automatic Signing)

**Status:** Active
**Date:** 2026-06

## Context

Adding iOS as a deployment target (the second native platform after Android,
anticipated by ADR-0001) required three toolchain choices.

**Dependency manager.** Capacitor 8 scaffolds iOS projects with **CocoaPods**
by default, with **Swift Package Manager (SPM)** as an opt-in alternative
(`cap add ios --packagemanager SPM`). CocoaPods is the battle-tested path but
drags in a Ruby toolchain and a `pod install` step on every plugin change —
and CocoaPods itself is in maintenance mode upstream. SPM is Apple's native
mechanism: Xcode resolves packages itself, no extra runtime. The deciding
check: every Capacitor plugin Splotch uses ships a `Package.swift`
(`@aparajita/capacitor-secure-storage`, `@capacitor-community/media`,
`@capacitor/filesystem`, `@capacitor/network`, `@capacitor/preferences`), so
SPM costs nothing in plugin compatibility.

**Build scripting.** Mirror of the Android question that ADR-0012/ADR-0019
answered with `android:*` Gradle scripts. The alternatives were "Xcode GUI
only" (not scriptable, no parity with `npm run info` discoverability) or
Fastlane (a Ruby dependency for what is currently two `xcodebuild`
invocations).

**Signing.** Android uses a manually managed upload keystore
(`keystore.properties`). On iOS the equivalent manual route (distribution
certificates + provisioning profiles exported by hand) is notoriously
error-prone, and Xcode's **automatic signing** with cloud-managed certificates
is Apple's recommended default for a single-developer project.

## Decision

* **SPM, no CocoaPods.** The `ios/` project was scaffolded with
  `npx cap add ios --packagemanager SPM`. Plugins resolve via
  `ios/App/CapApp-SPM/Package.swift`, which `cap sync` regenerates — that file
  is generated, never hand-edited. The macOS prerequisite list is therefore
  just full Xcode (no Ruby, no `pod`); `cap sync ios` works even on a machine
  with only Command Line Tools, since the SPM update is plain file generation.
* **`ios:*` npm scripts wrap `xcodebuild` directly** (per ADR-0019 naming):
  `ios:build` (simulator debug `.app`), `ios:archive` → `ios:ipa` (Release
  archive + App Store export per `ios/App/ExportOptions.plist`, both with
  `-allowProvisioningUpdates` so automatic signing works headlessly), and
  `test:ios` (`scripts/ios-simulator-smoke.mjs`, the simulator twin of the
  Android emulator smoke test, sharing `.maestro/smoke.yaml`). These scripts
  are macOS-only by nature and say so in `scripts-info` — the inverse of the
  Windows-only `android:*` Gradle scripts.
* **Automatic signing, nothing committed.** `ExportOptions.plist` uses
  `signingStyle: automatic` + method `app-store-connect`; the developer's
  `DEVELOPMENT_TEAM` is configured locally in Xcode and deliberately kept out
  of the committed `project.pbxproj`. There is no iOS analog of
  `keystore.properties` to back up — Apple holds the distribution certificate.
* Version numbers are not managed in Xcode: `scripts/release.mjs` sets
  `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` via `capacitor-set-version`,
  keeping them locked to Android's `versionName`/`versionCode`.

## Consequences

* **+** One less toolchain: contributors install Xcode and nothing else; no
  `Podfile.lock`/Ruby-version drift class of failures.
* **+** Headless `.ipa` production (`npm run ios:ipa`) with no Fastlane, and a
  self-contained smoke test (`npm run test:ios`) that needs no signing at all.
* **+** No signing secrets to store or lose, unlike the Android keystore.
* **-** SPM is the less-traveled Capacitor path; a future plugin without a
  `Package.swift` would force either a patch or a migration to CocoaPods.
* **-** Automatic signing means releases can only be built by someone signed
  into Xcode with the team account — there is no CI-friendly secret to inject
  until a manual-signing or App Store Connect API-key setup is added.
* **-** Every `ios:*`/`test:ios` script is unusable on Windows; iOS work is
  hard-gated on a Mac with full Xcode (the repo's other Capacitor tooling,
  including `cap sync ios`, still runs anywhere).
