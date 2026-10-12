<!-- cspell:ignore simctl devtools localabstract screencap XCUIDevice -->

# Safe-area verification on simulator and emulator — 2026-08-24

[PR #1286](https://github.com/KyleMit/Splotch/pull/1286) built the `/dev/notch` harness and the
`safe-area-matrix.spec.ts` CI matrix, and fixed `landscapeBandEdges()` to key on inset **symmetry**
rather than depth. Two of its conclusions were reached from specification text rather than
measurement, and it says so: the rotation-angle sign is "not verified on hardware", and the iPad
inset column is "derived from how the WebView is laid out rather than from a per-model browser
dump".

This run put both on a device — an Android emulator and three iOS simulators, running the real
native builds. It confirmed the fix, and it falsified one researched value that the notch threshold
depends on.

## What was run against

| Target                | Build                       | Notes                                   |
| --------------------- | --------------------------- | --------------------------------------- |
| Pixel 7 Pro AVD       | `android:apk` debug, native | API 33, WebView 150.0.7871.181, dpr 3.5 |
| iPhone 17 Pro sim     | `ios:build` debug, native   | iOS 26.5, dpr 3                         |
| iPad mini (A17 Pro)   | same `App.app`              | iPadOS 26.5, dpr 2                      |
| iPad Pro 13-inch (M5) | same `App.app`              | iPadOS 26.5, dpr 2                      |

The AVD declares a real cutout — `cutoutSpec={M 677,72 a 43,43 0 1 0 86,0 …}`, 144 physical px at
density 3.5 — so no developer-option simulation was involved.

## Confirmed

**The rotation-angle mapping is correct.** This is the one that mattered, because `#1286` settled it
from the WHATWG Compatibility Standard against a WebKit bug comment that says the opposite. Measured
on Android, where the two sides are distinguishable:

| `screen.orientation.angle` | `env(…-left)` | `env(…-right)` | Band painted     |
| -------------------------- | ------------- | -------------- | ---------------- |
| 90                         | 42            | 0              | left only, 42px  |
| 270                        | 0             | 42             | right only, 42px |

That is `CUTOUT_LEFT_ANGLE = 90` / `CUTOUT_RIGHT_ANGLE = 270` in `lib/platform/notchBand.ts`,
confirmed. The counter-clockwise reading was the right one.

**The iOS symmetric branch works.** On the iPhone 17 Pro in a landscape interface both side insets
read 62 css px and the app painted **both** edges — the case the app cannot resolve, and the branch
the old `insetRight >= insetLeft` rule got wrong on one rotation of every pair.

**Values that matched the research exactly:**

| Measurement                   | `devices.ts` | Measured    |
| ----------------------------- | ------------ | ----------- |
| iPhone 17 Pro portrait top    | 62           | 62.0        |
| iPhone 17 Pro landscape sides | 62 / 62      | 62.0 / 62.0 |
| iPad mini viewport            | 744×1133     | 744×1133    |
| iPad Pro 13-inch viewport     | 1032×1376    | 1032×1376   |

**Android native WebView really does report a cutout** — 42 css px top, confirming the M144+ claim
in [SAFE-AREA.md](../SAFE-AREA.md). A Chrome tab reports zero.

**The consumption seam holds at runtime.** `var(--safe-area-top)` resolved to the same number as
`env(safe-area-inset-top)` on both platforms, which is the half of the seam that
`safeAreaProperties.test.ts` cannot prove statically.

**Android landscape top inset is 0**, not the 28 in the `android-native-punch-gesture` profile,
because `statusBarHiddenFor()` hides the status bar there. That is the harness's `appliedInsets()`
model behaving as designed, not a discrepancy.

## Falsified — the iPad top inset

Both iPads measured a top inset of **exactly 32.0 css px**, where `devices.ts` records 24.

`NOTCH_INSET_THRESHOLD_PX` is 30, so `hasNotch(32)` is true and **the app paints a Notch Band on an
iPad that has no display cutout** — the bezel-iPad false positive the threshold exists to prevent.
It also retires the headroom argument stated in both `SAFE-AREA.md` and the `ipad-home-indicator`
notes: 24 is not the ceiling on iPadOS 26.

This is almost certainly the same iOS 26 inset change that
[SAFE-AREA.md](../SAFE-AREA.md#open-questions-worth-an-on-device-check) lists as open question 2 for
iPhone landscape — except that it reaches `env()`, and it lands on iPad.

**Do not fix this by editing the number alone.** `safe-area-matrix.spec.ts` derives
`expectedBandEdges` from `diagnose()`, which runs the app's own `bandEdges()` against the profile's
insets. Changing the iPad profile to 32 while `NOTCH_INSET_THRESHOLD_PX` stays 30 makes CI assert
that iPads are *supposed* to paint a band, locking the defect in behind a green build. The inset and
the threshold have to move together. There is room either way: iPad now tops out at 32, the lowest
cutout iPhone is 44.

## Not reproduced — the 3-button-nav side inset

`android-native-punch-3button` claims `landscape-left: {left: 38, right: 48}` at
`confidence: 'high'` — both sides non-zero, the deeper one being the nav bar. That is the scenario
that motivated the whole fix.

With 3-button navigation actually enabled
(`cmd overlay enable com.android.internal.systemui.navbar.threebutton`, gestural disabled), `env()`
carried **only the cutout**: 42 on the cutout side, 0 on the other, in both rotations. The nav bar
contributed no inset, even with `mNavigationBarPosition=1` confirming it had moved to a side.

The fix behaves correctly either way — an asymmetric pair plus a usable angle resolves the same
whether the other side is 0 or 48. But the profile's premise is unverified, and `high` confidence
overstates what is known.

## Found — the band fails to paint on most Android cold starts

Not introduced by `#1286`; it lives in the layout store's boot measurement. But it defeats what that
PR set out to guarantee, and the CI matrix structurally cannot see it.

Across 12 cold starts of the native Android build, the Notch Band failed to paint **8 times** (4/6
fresh installs, 4/6 plain restarts). In a failing instance:

* `var(--safe-area-top)` reads `42px` — the CSS is correct
* the app's own `measureSafeAreaInsets()` probe, run verbatim, returns `top: 42` — the DOM would
  answer correctly if asked
* the band is `rgba(0, 0, 0, 0)` — so `layout.safeArea.top` is holding a stale `0`
* dispatching a bare `resize` repaints it purple immediately

The cause is in [`lib/state/layout.svelte.ts`](../../web/src/lib/state/layout.svelte.ts): it calls
`syncViewportImmediately()` once at module load, then only re-measures on `resize`,
`orientationchange`, and `visibilitychange`. On Android native, `env()` resolves to `0` at module
load and becomes non-zero a few hundred ms later **without firing any of them** — `innerHeight`
never changes, so there is no resize. One instrumented cold start caught the transition directly:

```
{"t":1595,"envTop":0, "resizesSoFar":0,"innerHeight":891}
{"t":1851,"envTop":42,"resizesSoFar":0,"innerHeight":891}
```

The CI matrix cannot catch this because `overrideSafeAreaInsets` applies the insets over CDP
*before* navigation, so the value is always present by the time the layout module runs.

## Footguns

The traps that cost time here, so the next run doesn't re-derive them. The simulator ones are
mirrored into [MOBILE/ios.md](../MOBILE/ios.md) and [MOBILE/android.md](../MOBILE/android.md); the
inset-specific one is in [SAFE-AREA.md](../SAFE-AREA.md).

**A device pose that disagrees with a locked interface orientation doubles the inset offset, and it
looks exactly like a `viewport-fit` bug.** This one produced two false findings before it was
caught. The app locks rotation by default on phones (`lockRotationEnabled` defaults `true`,
`forceLandscapeOrientation` false below `TABLET_MIN_SIDE_PX`), so rotating the simulator device
leaves the app portrait. In that mismatched pose the whole web layer is offset by exactly the
safe-area inset, and the band paints one full inset *inside* the screen edge, leaving the cutout
strip bare — a picture-perfect impersonation of a full-bleed defect. Both times it resolved to the
pose, not the app. Verify the device and interface agree before believing any placement result.

**`XCUIDevice.orientation` is the only rotation that works, and it is not what you reach for
first.** AppleScript against the Simulator's Device → Rotate menu times out (`-1712`) and leaves a
hung `System Events` process; `simctl` has no rotation verb at all. Maestro 2.6.1's `setOrientation`
(`PORTRAIT`, `LANDSCAPE_LEFT`, `LANDSCAPE_RIGHT`, `UPSIDE_DOWN`) drives `XCUIDevice` through its
XCTest driver and works.

**`simctl io screenshot` and Maestro's `takeScreenshot` disagree about orientation, and both lie to
`sharp`.** `simctl` writes the device-native buffer, ignoring the interface rotation entirely.
Maestro writes the rotated image as an **EXIF orientation flag** — so `sips` previews it correctly
while raw pixel access sees an unrotated buffer. Reading one without `sharp(...).rotate()` produced
a confident "no bands found" on an image that plainly had two. Call `.rotate()` before any raw
measurement.

**`ios_webkit_debug_proxy` does not see simulators** — it enumerated only the physically attached
iPad. There is no CDP-equivalent path to a simulator WKWebView here, which is why the iOS numbers in
this note are measured off screenshots while the Android ones are read from the live DOM.

**Maestro's text selectors do not reach into the WebView.** `tapOn: Settings` and
`tapOn: Appearance` both failed against controls that are plainly present and labelled. Coordinate
taps (`tapOn: {point: "92%,88%"}`) work. Note the percentages are relative to the *device* frame, so
they stop matching what you see once the interface is rotated relative to the device.

**The app must be launched with `am start`, not `monkey`.** `adb shell monkey -p art.splotch.app 1`
reported success and started nothing; `am start -n art.splotch.app/.MainActivity` works.

**The WebView debug socket is named after the pid**, so the forward has to be re-established on
every launch — see the recipe now in [MOBILE/android.md](../MOBILE/android.md). With a physical
phone also attached, every `adb` call needs `-s emulator-5554`; per the root `CLAUDE.md`, never kill
the other listener to free a port.

**Measure the band across several launches, not one.** Given the cold-start race above, a single
sample has a roughly one-in-three chance of showing an unpainted band and sending you after a
phantom inset bug.
