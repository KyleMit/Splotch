# Android tooling

This sub-capability owns the Node wrappers around Android SDK, emulator, Gradle, release-bundle, and
native smoke-test workflows. Public command names remain under the `android:*` namespace; the full
developer and release runbook is [`docs/MOBILE/android.md`](../../../docs/MOBILE/android.md).

## Entry points

| Entry point                 | Public command(s)                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `setup-emulator.mjs`        | `npm run android:setup`                                                                                      |
| `run-emulator.mjs`          | `android:boot`, `android:emulator`, `android:live`                                                           |
| `run-gradle.mjs`            | `android:apk`, `android:apk:release`, `android:run`, `android:run:device`, `android:bundle`, `android:clean` |
| `run-smoke-test.mjs`        | `npm run test:android`                                                                                       |
| `verify-release-bundle.mjs` | `npm run android:verify`                                                                                     |
| `open-release-bundle.mjs`   | `npm run android:open`                                                                                       |

`run-emulator.mjs` retains its `boot`, `emulator`, and `live` modes. `run-gradle.mjs` forwards the
requested tasks to the committed wrapper from the `android/` project directory.
`android:apk:release` writes `android/app/build/outputs/apk/release/app-release.apk`; the tagged CI
gate test-signs and boots it. Bundle release commands write and inspect
`android/app/build/outputs/bundle/release/app-release.aab`; the opener reveals that containing
directory without changing it.

The toolchain requires Node 22+, a full JDK 21, and an Android SDK. Emulator setup additionally
requires `sdkmanager`, `avdmanager`, `emulator`, and `adb`; the smoke test requires Maestro. Release
bundle creation requires the ignored signing configuration documented in the mobile guide. Missing
tools, an unavailable emulator, Gradle failures, or an invalid bundle exit nonzero and retain the
underlying diagnostic output.

Set `ANDROID_HOME` (or the older `ANDROID_SDK_ROOT`) to override the default SDK location,
`JAVA_HOME` to a full JDK 21 so `verify-release-bundle.mjs` can locate `jarsigner`, and
`ANDROID_SERIAL` to pick a device when an emulator is also connected.

`lib/android-toolchain.mjs` owns SDK discovery, the API level and AVD name, Gradle paths, and
release artifact paths. Update its API-level constant together with CI and documentation; the nested
config test enforces that agreement. Keep Android-only lifecycle code here and cross-platform
Maestro or static-export behavior at the mobile capability root.

Run focused verification with:

```sh
npm run test:tools -- tools/mobile/android
```
