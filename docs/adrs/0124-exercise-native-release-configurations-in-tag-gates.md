# ADR-0124: Exercise Native Release Configurations in Tag Gates

**Status:** Active **Date:** 2026-08

## Context

The tagged native workflows proved that a Debug Android APK and Debug iOS simulator app could boot,
but neither compiled the configuration sent to the stores. Android Release enables R8 optimization,
obfuscation, `proguard-android-optimize.txt`, and resource shrinking. iOS Release changes Swift and
C optimization, whole-module compilation, assertions, validation, and active compilation conditions.
A healthy Debug build therefore said nothing about failures unique to those settings.

Production signing cannot be the answer. The Play upload key is intentionally local, and an iOS App
Store archive needs a personal development team plus Apple-managed provisioning. Moving either
identity into CI would expand the secret and account surface merely to answer whether the code and
resource rules compile.

The alternatives were:

1. Compile an unsigned Android AAB and an iOS Release simulator app without store signing, while
   leaving both boot smokes on Debug. This is the smallest compile check, but Android would never
   install or boot the optimized artifact.
2. Generate a disposable Android key, install and smoke the Release APK, and separately compile an
   iOS Release simulator app without store signing before the established Debug smoke. This
   exercises Android's optimized runtime artifact and keeps iOS compilation independent of store
   signing.
3. Install and smoke Release simulator apps on both platforms. This gives symmetric runtime
   coverage, but replaces the known iOS Debug boot signal with a code-signing-disabled simulator
   installation that the issue does not need to decide.
4. Build store-signed AAB and IPA artifacts in CI. This tests the most production-like path, but
   requires production credentials, provisioning, and account access in the tag gates.

## Decision

Choose alternative 2 and keep the work in the existing tag-only native deploy workflows.

* `android:apk:release` runs the production static web sync followed by Gradle
  `:app:assembleRelease`. `.github/workflows/android-deploy.yml` creates a new PKCS12 key in the
  runner's temporary directory, writes its known test credentials to the already-ignored
  `android/keystore.properties`, builds the Release APK, installs it, and runs the unchanged Maestro
  boot flow. The disposable certificate carries no Play identity and no production secret enters CI.
* `ios:build:release` runs the production static web sync followed by an Xcode Release build for the
  generic iOS Simulator destination with `CODE_SIGNING_ALLOWED=NO`.
  `.github/workflows/ios-deploy.yml` compiles that app before running the existing Debug simulator
  smoke. A development team, provisioning profile, and `ios/local.xcconfig` are neither read nor
  required.
* `tools/mobile/tests/native-release-configurations.test.mjs` guards the commands, Android
  optimization settings, disposable signing seam, Release APK install path, no-store-signing iOS
  settings, and workflow wiring on every ordinary CI run.

ADR-0120's boundary remains intact: Maestro still answers only whether the installed artifact boots
and paints. Release configuration coverage changes which Android artifact reaches that assertion; it
does not add UI navigation. The iOS Release step is compilation coverage, not a new behavioral test
tier.

## Consequences

* \+ Android R8, ProGuard, resource shrinking, signing configuration, installation, and first paint
  are exercised together before a tag is considered healthy.
* \+ iOS Release-only compiler and project-setting failures are caught without an Apple account or
  signing material on the runner.
* \+ Production signing identities remain local; the Android test key is generated per run and is
  useless for Play uploads.
* \+ The change is reversible: the public scripts and workflow steps can be removed or replaced by
  bundletool/store-signed gates without migrating persisted CI state.
* − Android CI proves the Release bits under a disposable certificate, not the availability or
  correctness of the real Play upload key.
* − The iOS Release app is compiled but not installed; the Debug build remains the iOS boot signal.
* − iOS performs a second native build and static sync on tag runs, increasing macOS runner time in
  exchange for keeping compile and boot failures distinct.
