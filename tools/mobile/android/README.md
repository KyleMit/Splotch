# Android tooling

This sub-capability owns the Node wrappers around Android SDK, emulator, Gradle, release-bundle, and
native smoke-test workflows. Public command names remain under the `android:*` namespace; the full
developer and release runbook is [`docs/MOBILE/android.md`](../../../docs/MOBILE/android.md).

## Entry points

| Entry point                     | Public command(s)                                             |
| ------------------------------- | ------------------------------------------------------------- |
| `setup-emulator.mjs`            | `npm run android:setup`                                       |
| `run-emulator.mjs`              | `npm run android:boot`                                        |
| `run-smoke-test.mjs`            | `npm run test:android`                                        |
| `print-emulator-api-levels.mjs` | Android deploy workflow matrix                                |
| `verify-release-bundle.mjs`     | `npm run android:verify`; `android:bundle` runs it on its AAB |
| `build-accessibility-probe.mjs` | `npm run android:accessibility:build`                         |

The release builds (`android:apk`, `android:apk:store`, `android:bundle`) are
`tools/release/build-native-release.mjs`, which runs the React Native project's Gradle wrapper
directly. They write under `experiments/native-architecture/android/app/build/outputs/`, and
`verify-release-bundle.mjs` checks the AAB there by default.

The toolchain requires Node 22+, a full JDK 21, and an Android SDK. Emulator setup additionally
requires `sdkmanager`, `avdmanager`, `emulator`, and `adb`; the smoke test requires Maestro. Release
bundle creation requires the ignored signing configuration documented in the mobile guide. Missing
tools, an unavailable emulator, Gradle failures, or an invalid bundle exit nonzero and retain the
underlying diagnostic output.

Set `ANDROID_HOME` (or the older `ANDROID_SDK_ROOT`) to override the default SDK location, and
`JAVA_HOME` to a full JDK 21 so `verify-release-bundle.mjs` can locate `jarsigner`.

`lib/android-toolchain.mjs` owns SDK discovery and the current development API level and AVD name.
`print-emulator-api-levels.mjs` adds the declared Android floor from `/beta` to the deploy
workflow's matrix without creating a second floor literal. Update the current API-level constant
together with CI and documentation; the nested config test enforces that agreement. Keep
Android-only lifecycle code here and cross-platform Maestro or static-export behavior at the mobile
capability root.

Run focused verification with:

```sh
npm run test:tools -- tools/mobile/android
```

## Direct accessibility-action diagnostic

`npm run android:accessibility:build -- --output <fresh-private-directory>` builds
`probes/accessibility-action` through the RN Android project's existing SDK and plugin, signed with
the local debug key that also signs the app's non-store builds. Nothing is installed or launched.
Commit source first; output must be new and outside the checkout. A failed build keeps its output,
log and record for diagnosis. The settings injection applies only to the admitted main project,
including when React Native has its own included Gradle builds.

The resulting package is `art.splotch.parity.driver`, with self-targeted instrumentation
`art.splotch.parity.driver.AccessibilityActionProbe`. It observes only the foreground
`art.splotch.app.dev` app. `operation=inspect` returns native names, geometry, semantics and action
lists; `operation=click label=<exact-name>` invokes `ACTION_CLICK` only for one enabled, visible
exact match. It records whether the action was listed and whether activation succeeded. A raw text
descendant is distinct from its activatable button. Duplicate names remain an error. An optional
`class=<exact-native-class>` explicitly narrows candidates before the uniqueness check; the result
records both selector fields. It never silently filters by accessibility importance. Refusals
include a bounded candidate summary with the total count and a truncation flag. Oversized snapshots
refuse before dispatch; an exception after attempted activation reports an unknown outcome in a
fresh, small error bundle.

Before installation or use, independently verify package/instrumentation identity, APK bytes, source
record and the expected existing certificate. Use fresh owned emulators for this campaign; this
helper grants no physical-device installation authority. Bind host foreground/window checks to
Display0 immediately before every input. API30+ additionally verifies the active accessibility
window's display. On older APIs, the host must separately prove the default-display context and
foreground identity. Below API30, output records `display: null` and
`displayVerifiedByDriver: false`; the host admission record supplies the separate proof. Retained
installs remain read-only.

A local invocation after those checks is
`adb -s <owned-emulator> shell am instrument -w -r -e expectedPackage art.splotch.app.dev -e operation inspect art.splotch.parity.driver/art.splotch.parity.driver.AccessibilityActionProbe`.
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
