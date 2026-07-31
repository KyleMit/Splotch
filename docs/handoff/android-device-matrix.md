# Handoff — physical Android performance matrix

> 2026-07-31 · branch `experiment/trusted-ipad-input` · PR
> [#682](https://github.com/KyleMit/Splotch/pull/682) · Capture the two missing physical-Android
> deployment targets without changing product behavior.

## Objective & non-goals

**Objective.** Capture the full drawing, undo, and discrete-action snapshot for physical Android
Chrome and the physical Android Capacitor app, then add targets 6 and 7 to the committed nine-target
matrix.

**Non-goals.** Do not fix failures during the snapshot. Preserve the first valid red result, note an
obvious cause if one appears, and defer product changes to a focused follow-up.

## State

Seven targets are committed under `scrapbook/performance/2026-07-31-deployment-target-matrix/`.
Physical Android web/native are explicitly unavailable in that dataset. A phone was plugged in
during the session, but it did not become visible as an authorized ADB device. The user asked to
return to it later.

Use the new `run-performance-matrix` skill for the canonical serial workflow. Android browser
actions must use `perf:android:web:actions` and direct CDP, not Appium. Drawing may use the shared
Appium real-screen runner. Native actions use Appium attached to the Capacitor WebView with
`--native-app --native-webview-class=android.webkit.WebView`.

## Decisions made (and why)

* Preserve one failed sample rather than repeating until green; this is a snapshot campaign.
* Use direct CDP for Android Chrome actions. Appium browser input produced global cadence noise in
  the emulator and cannot attribute browser frame gaps reliably (ADR-0092).
* Keep drawing and action input-fidelity classifications advisory until a physical Android hand run
  calibrates cadence/contact geometry. Do not inherit the physical-iPad calibration.
* Build the instrumented app/site once per target and reuse it. Confirm that ordinary release builds
  still exclude profiling marks after any harness change.

## Unverified assumptions

* The phone can run Chrome 149-compatible DevTools and can authorize this Mac over USB.
* Android developer mode and USB debugging are enabled.
* The phone and Mac can reach the same preview URL, or ADB port forwarding can provide it.
* The native application can be installed without a signing or minimum-SDK mismatch.

## Done & verified

* Android emulator web and native rows exist in the committed matrix.
* Direct CDP Android browser action profiling landed in `254e4195` and is documented in ADR-0092.
* Native Appium sessions can recover action probes after reload (`dffcbfbc`, `92d30866`).
* The report generator preserves unavailable rows instead of inferring them from emulator data.

## Risks & next 3 steps

1. Ask the user to unlock the phone, accept the USB-debugging RSA prompt, and keep the screen awake;
   verify one `device` row in `adb devices -l` before building anything.
2. Capture web drawing/undo and the three-repeat action suite, then native drawing/undo and actions.
   Save exact artifact paths and do not retry a legitimate failed run.
3. Add both sources to `sources.json`, regenerate the report, verify the JSON/Markdown/HTML, and
   commit the snapshot separately from any later product fix.

The main operational risk is confusing host/emulator/device scheduling with application work. When
an action fails, retain the action-aligned trace and compare against a no-op idle control before
opening a fix.

## Reread first

* `.agents/skills/run-performance-matrix/SKILL.md`
* `.agents/skills/profiling/SKILL.md`
* `.agents/skills/mobile/SKILL.md`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md`
* `docs/adrs/0092-direct-cdp-android-browser-action-profiling.md`
* `scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json`
