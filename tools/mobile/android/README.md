# Android tooling

This sub-capability owns the Node wrappers around Android SDK, emulator, Gradle, release-bundle, and
native smoke-test workflows. Public command names remain under the `android:*` namespace; the full
developer and release runbook is [`docs/MOBILE/android.md`](../../../docs/MOBILE/android.md).

## Entry points

| Entry point                     | Public command(s)                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `gen-monochrome-icon.mjs`       | `npm run gen:android:assets` — restores monochrome art after Capacitor generation        |
| `setup-emulator.mjs`            | `npm run android:setup`                                                                  |
| `run-emulator.mjs`              | `android:boot`, `android:emulator`, `android:live`                                       |
| `run-gradle.mjs`                | `android:apk`, `android:apk:release`, `android:run`, `android:bundle`, `android:clean`   |
| `run-on-device.mjs`             | `npm run android:run:device` — installs on the sole attached physical phone (issue 1645) |
| `run-smoke-test.mjs`            | `npm run test:android`                                                                   |
| `print-emulator-api-levels.mjs` | Android deploy workflow matrix                                                           |
| `verify-release-bundle.mjs`     | `npm run android:verify`                                                                 |
| `open-release-bundle.mjs`       | `npm run android:open`                                                                   |

`run-emulator.mjs` retains its `boot`, `emulator`, and `live` modes. `run-gradle.mjs` forwards the
requested tasks to the committed wrapper from the `android/` project directory.
`android:apk:release` writes `android/app/build/outputs/apk/release/` — `app-release.apk` when
`keystore.properties` supplies a signing key, otherwise `app-release-unsigned.apk`; the tagged CI
gate test-signs and boots the signed filename. Bundle release commands write and inspect
`android/app/build/outputs/bundle/release/app-release.aab`; the opener reveals that containing
directory without changing it.

`gen-monochrome-icon.mjs` copies the authored VectorDrawable from `assets/icon-monochrome.xml` into
Android resources and restores both adaptive references. The public command runs Capacitor's asset
generator first, so regenerate through that command rather than invoking the vendor generator alone.
Missing source/adaptive files or unexpected XML fail before any resource is written. The monochrome
restoration requires Node only; full asset generation also needs installed Capacitor assets and
artwork under `assets/`.

The toolchain requires Node 22+, a full JDK 21, and an Android SDK. Emulator setup additionally
requires `sdkmanager`, `avdmanager`, `emulator`, and `adb`; the smoke test requires Maestro. Release
bundle creation requires the ignored signing configuration documented in the mobile guide. Missing
tools, an unavailable emulator, Gradle failures, or an invalid bundle exit nonzero and retain the
underlying diagnostic output.

Set `ANDROID_HOME` (or the older `ANDROID_SDK_ROOT`) to override the default SDK location,
`JAVA_HOME` to a full JDK 21 so `verify-release-bundle.mjs` can locate `jarsigner`, and
`ANDROID_SERIAL` to pick a device when an emulator is also connected.

`lib/android-toolchain.mjs` owns SDK discovery, the current development API level and AVD name,
Gradle paths, and release artifact paths. `print-emulator-api-levels.mjs` adds the declared Android
floor from `/beta` to the deploy workflow's matrix without creating a second floor literal. Update
the current API-level constant together with CI and documentation; the nested config test enforces
that agreement. Keep Android-only lifecycle code here and cross-platform Maestro or static-export
behavior at the mobile capability root.

Run focused verification with:

```sh
npm run test:tools -- tools/mobile/android
```

## Direct accessibility-action diagnostic

`npm run android:accessibility:build -- --output <fresh-private-directory> --signing-init <existing-opaque-Gradle-init>`
builds `probes/accessibility-action` through the RN Android project's existing SDK/plugin and
candidate Release signing configuration. The supplied init file makes the existing signing
configuration available to Gradle. The handler never opens or prints credential values. No identity
is created, and nothing is installed or launched. Commit source first; output must be new and
outside the checkout. A failed build keeps its output, log and record for diagnosis. The settings
injection applies only to the admitted main project, including when React Native has its own
included Gradle builds.

The resulting package is `art.splotch.parity.driver`, with self-targeted instrumentation
`art.splotch.parity.driver.AccessibilityActionProbe`. It observes only the foreground
`art.splotch.migration.probe` app. `operation=inspect` returns native names, geometry, semantics and
action lists; `operation=click label=<exact-name>` invokes `ACTION_CLICK` only for one enabled,
visible exact match. It records whether the action was listed and whether activation succeeded. A
raw text descendant is distinct from its activatable button. Duplicate names remain an error.

Before installation or use, independently verify package/instrumentation identity, APK bytes, source
record and the expected existing certificate. Use fresh owned emulators for this campaign; this
helper grants no physical-device installation authority. Bind host foreground/window checks to
Display0 immediately before every input. API30+ additionally verifies the active accessibility
window's display. On older APIs, the host must separately prove the default-display context and
foreground identity. Retained installs remain read-only.

A local invocation after those checks is
`adb -s <owned-emulator> shell am instrument -w -r -e expectedPackage art.splotch.migration.probe -e operation inspect art.splotch.parity.driver/art.splotch.parity.driver.AccessibilityActionProbe`.
For a click, set `operation` to `click` and supply the complete exact `label`, shell-quoted as one
argument. The driver does not launch or navigate to the app, provide coordinate fallback, grant
permissions, force internal state, or recover a failed route. Check the resulting public UI
separately.

Keep output and device records private with byte-verified recovery. Editable/password nodes are
redacted, but collection must still stop completely during credential entry. UiAutomation uses
`FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`; labels or action success are not observed speech.
Qualify a driver with a wrong-foreground refusal, actual public navigation, disabled-action refusal
and separate-contact/Undo cardinality before trusting drawing/history results. A simulated result
does not establish the physical gesture requirements. Screenshots and Save animations alone do not
prove a published storage file.
