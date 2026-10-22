# Safe areas across devices

The React Native app reads safe areas through `react-native-safe-area-context`. Its web export maps
the browser's safe-area environment into that same provider. Read this before moving controls near a
cutout, home indicator or system bar. The app is in `` until root promotion (ADR-0182).

## Current owners and checks

* `src/rsdDrawing/NativeFrame.tsx` supplies `SafeAreaProvider`. Drawing chrome and modal geometry
  consume `useSafeAreaInsets()`.
* `src/rsdDrawing/RsdNotchBand.tsx` paints the band in separate cover/dock-side layers and applies
  native status-bar style/visibility through RN `StatusBar`.
* `src/lib/platform/notchBand.ts` holds the pure cutout threshold, band-edge, color and status-bar
  decisions. RN uses those decisions directly.
* `src/platform/notchBandPlatform.ts` maps Expo orientations into the retained angle vocabulary; its
  `.web.ts` counterpart reads the browser orientation and writes `theme-color`.
* `tools/migration/lib/safeAreaMatrix/devices.ts` holds the researched profiles, and
  `tools/migration/lib/safeAreaMatrix/diagnostics.ts` applies product policy before diagnosing them.

| Check                    | Command                                                                                                        | Proves                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| RN web safe-area matrix  | `npm run native:web:build` (post-build guard)                                                                  | Insets reach the app; control tap points fit; no scrolling; band edges and picker insets match. |
| Screenshot gallery       | `node --experimental-strip-types tools/migration/check-native-web-safe-area.mjs --gallery <dir>` after a build | Every profile/orientation with claimable region outlined in `<dir>/index.html`.                 |
| Native/mounted contracts | `tools/migration/tests/rsd-native-notch-band.test.mjs`                                                         | Provider-to-band contracts at their mocked native seams.                                        |

`tools/migration/check-native-web-safe-area.mjs` runs on the RN export. CI's export build includes
it; it is also part of the local native-web build checks. It uses CDP's real safe-area override, not
an author CSS fallback. That proves web layout under the profiles, not native UIKit/Android inset
delivery or actual physical cutout measurements. A screenshot check can expose a policy mismatch;
expectations derived from `diagnose()` alone cannot prove the policy is right.

The Svelte root custom-property seam, `/dev/notch` gallery, safe-area source sweep and Capacitor
SystemBars injection tests retired with their subjects. The RN app does not consume injected
Capacitor safe-area variables or run a native WebView. Do not combine those former offsets with
provider insets.

## How to emulate browser insets

| Approach                                  | Changes genuine `env()` values? | Use                                                                           |
| ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `env()` fallback argument                 | No                              | Fallback runs only for an unsupported name, not a supported zero.             |
| Author CSS custom property                | No                              | Can model a consumer written for that seam; RN has no such override seam.     |
| DevTools device preset                    | No                              | Device dimensions alone do not supply cutout insets.                          |
| CDP `Emulation.setSafeAreaInsetsOverride` | Yes                             | RN browser matrix and gallery; Chromium only.                                 |
| Safari / WebView on a simulator or device | Yes                             | Browser/WebView investigation, distinct from native RN provider measurements. |

CDP requires all inset keys and whole-pixel values. The RN checker rounds the researched fractional
dp/CSS values and compares with what it actually applied. Real devices can report fractional logical
insets; never infer a cutout from viewport dimensions alone.

A device pose and the app's interface orientation must agree before interpreting a screenshot. The
2026-08 simulator investigation found WebView offsets of exactly one inset when they disagreed. That
is historical evidence about a misleading measurement setup, not a claim that RN has the same
WebView offset. The iOS runbook retains the screenshot-orientation caveats.

## Device observations and retained geometry rationale

The browser/WebView observations below retain their original measurement dates. Capacitor-era native
measurements are evidence about that WebView configuration, not RN safe-area-provider measurements.
The shared dataset with per-entry sources and confidence is
`tools/migration/lib/safeAreaMatrix/devices.ts`. The rules worth carrying in your head:

**iOS reports both landscape sides identically.** `safe-area-inset-left` and `-right` are both set
to the full cutout depth in landscape, whichever side the notch is physically on. *You cannot tell
the two landscape rotations apart from CSS.* This is the single most consequential fact here — see
the open defect below.

**Viewport size never implies the inset.** 375×812 is both an iPhone X (top 44) and a 13 mini (top
50). 414×896 is both an XS Max (44) and an XR (48). 1024×1366 is both a home-button iPad Pro (top
20, bottom 0) and a home-indicator one (24/20). Branch on measured insets, never on dimensions.

**A bottom inset arrives without a top one.** Every home-indicator iPad reports `0/0/20/0` in a
Safari tab, in all four orientations — Safari's chrome absorbs the top inset, and iPadOS Safari has
no bottom toolbar for the home indicator's 20px to hide behind. No iPad has ever had a display
cutout, so nothing on an iPad should ever paint a Notch Band.

**The iPad top inset is not 24 on iPadOS 26, and that breaks the threshold.** An iPad mini (A17 Pro)
and an iPad Pro 13-inch (M5) simulator, both on iPadOS 26.5 running the native build, each measured
a top inset of exactly **32 css px** in the Capacitor-era native WebView — not the 24 recorded in
`DEVICE_PROFILES`, which the rest of this document treated as a hard ceiling. Since
`NOTCH_INSET_THRESHOLD_PX = 30`, `hasNotch(32)` is true and the app paints a band on a device with
no cutout: precisely the bezel-iPad false positive the threshold exists to exclude. The headroom
argument the constant was chosen under (iPad max 24, iPhone min 44) no longer holds on its iPad
side; the run is written up in
[scratchpad/safe-area-device-verification-2026-08-24.md](scratchpad/safe-area-device-verification-2026-08-24.md).

The profile numbers are deliberately left at 24 until the constant is decided, because
`tools/migration/check-native-web-safe-area.mjs` derives its expected band edges from `diagnose()`,
which applies the app's own `bandEdges()` to those numbers — raising the profile to 32 alone would
make CI assert that iPads are *supposed* to paint a band. The inset and the threshold have to move
in one change.

**Rounded corners do not inset the sides.** An iPad 10th gen has the largest corner radius Apple
ships (25pt) and still reports `left: 0, right: 0`. Android waterfall/curved-edge insets default to
`0` in AOSP and no shipped device overrides them.

**Historical Android browser/WebView contrast (2026-07).** `safe-area-inset-top` is always `0` in a
Chrome tab (Chrome's own toolbar occupies that band) and still `0` in an installed PWA as of 2026-07
([crbug 407420295](https://issues.chromium.org/issues/407420295)). Only a native WebView reports one
— and only on Chromium M144+ for all WebViews, M136–143 for fullscreen ones, and not at all below
M136. `<meta name="theme-color">` remains the only mechanism that tints an Android web status bar.

**Orientation support is not universal.** No Face ID iPhone rotates to upside-down portrait — it is
a system-level block, not an app setting. No Android *phone* does either
(`config_allowAllRotations=false`). iPads, Android tablets, and unfolded foldables do.

**Landscape does not zero the top inset on Android.** iOS hides the iPhone status bar in landscape,
so its top inset goes to `0`; Android keeps the status bar on the top edge at a separate, shorter
landscape height (24–28dp).

**One device reports several different insets.** Android's Display size setting changes
`densityDpi`, rescaling the viewport *and* every CSS px inset together. One OnePlus device declares
three status bar heights by `sw` qualifier. Read `env()` live; never cache or hardcode.

## How the landscape band picks its edge

In portrait the cutout is at the top and there is nothing to decide. Landscape is where it gets
hard, and the rule that reads as obvious — paint whichever side inset is deeper — is wrong on both
platforms, for unrelated reasons:

* **iOS reports both landscape sides with the same value**, whichever side the cutout is physically
  on. `insetRight >= insetLeft` is therefore always true, so the band always painted right: correct
  on one rotation, wrong on the other.
* **Android with 3-button navigation** moves the nav bar to the side *opposite* the camera, where at
  48dp it is deeper than the cutout's ~38dp. The rule picked the nav bar in *both* rotations,
  painting the drawing colour behind the back/home/recents buttons.

The retained `landscapeBandEdges()` rule in `src/lib/platform/notchBand.ts` keys on **symmetry**,
not depth:

| The two side insets        | What the band does | Why                                                                                                                                                |
| -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equal                      | Paint **both**     | This is exactly the case the app cannot resolve — and both strips are already outside the content box, so covering both spends no claimable screen |
| Different, angle 90        | Paint **left**     | The sides are distinguishable and the rotation says which                                                                                          |
| Different, angle 270       | Paint **right**    |                                                                                                                                                    |
| Different, no usable angle | Paint **nothing**  | A band on the wrong edge is worse than no band: it spends claimable screen *and* leaves the cutout bare                                            |

### The rotation angle, and the one version that disagreed

`screen.orientation.angle` is at the browser floor (Chrome 38 / Safari 16.4), is already in the
browser implementation's input in `src/platform/notchBandPlatform.web.ts`. The angle is the
**device's** rotation *counter-clockwise* from natural, so **90 puts the natural top edge — and the
cutout — on the LEFT**, and 270 on the right.

That sign is the whole question, and it is worth knowing how it was settled, because the obvious
sources disagree:

* The [W3C Screen Orientation spec](https://www.w3.org/TR/screen-orientation/) says "rotated
  counter-clockwise from its natural orientation" — which reads either way depending on whether you
  picture the device or the content turning. It is not sufficient on its own.
* The [WHATWG Compatibility Standard](https://compat.spec.whatwg.org/) is, because it chains
  `window.orientation` to the same angle and states the direction unambiguously: "`90` represents a
  rotation 90 degrees counterclockwise from the natural orientation."
* [AOSP `Display.getRotation()`](https://developer.android.com/reference/android/view/Display#getRotation())
  agrees, in inverted vocabulary: "if the device is rotated 90 degrees counter-clockwise … the
  returned value here will be `Surface.ROTATION_90`". Chromium passes that straight through. Android
  calls it a clockwise *graphics* rotation and W3C a counter-clockwise *screen* rotation — the same
  pose in opposite frames of reference, and the source of most of the confusion online.
* Measured, on the same page in the same pose
  ([W3C issue 247](https://lists.w3.org/Archives/Public/public-webapps-github/2023Apr/0185.html)):
  turning the device clockwise (notch to the right) reported **270** on Chrome and Firefox for
  Android.

**The trap:** [WebKit bug 254863](https://bugs.webkit.org/show_bug.cgi?id=254863) comment 8 states
the opposite mapping — 90 = notch right. That was an accurate description of **iOS 16.4**, which
shipped the inverted mapping against a spec that at the time permitted either. It was corrected
three days later in [bug 255388](https://bugs.webkit.org/show_bug.cgi?id=255388) (WebKit
`262940@main`), and the spec was pinned counter-clockwise in
[w3c/screen-orientation#248](https://github.com/w3c/screen-orientation/pull/248). Anything written
before **April 2023** is unreliable on this point.

iOS 16.4 is this app's *floor*, so the one OS version that reports the inverted angle is a device we
support. That is a large part of why iOS takes the paint-both branch rather than the angle branch:
on iOS the angle is never consulted, so the 16.4 inversion cannot reach the band at all. Android's
mapping has no such history.

**Historical verification gap.** The investigation inferred the post-fix iOS mapping from WebKit
source and Apple's `UIInterfaceOrientation` semantics; it did not record a real notched-iPhone
measurement. It does not currently affect the band (iOS never reads the angle), but it would if that
branch ever changed. For a new browser measurement, record `screen.orientation.angle` and both side
insets in both landscape poses, alongside the observed physical cutout edge. Symmetric iOS insets
cannot identify the cutout side by depth alone. Also note Safari 17 changed iPad's *natural*
orientation to landscape, which reshuffles the angle mapping there; no iPad has a cutout, so nothing
in the band depends on it.

## What the current matrix models

The RN check runs the browser export. It supplies profiles' geometry through CDP and the angle a
portrait-natural device would report. `appliedInsets()` layers the app's status-bar policy on the
raw research tuple; for native Android landscape profiles it removes the top inset contributed by
the hidden status bar. The dataset remains unchanged research; policy belongs to its imported
production function.

This does not execute native status-bar or safe-area code. Native delivery, keyboard behavior,
window modes and physical cutouts need observations on their actual runtime. Keep that distinction
in a result, especially when a profile carries a historically measured WebView inset.

## Adding a device

Add a distinct inset tuple to `DEVICE_PROFILES` in `tools/migration/lib/safeAreaMatrix/devices.ts`,
with its source, runtime and honest confidence. The RN check/gallery derives scenarios from that one
array. A second device with identical geometry adds no layout case; a new physical/runtime
observation can still improve the provenance of an existing profile.

## Historical measurements and remaining research

A [simulator and emulator run on 2026-08-24](scratchpad/safe-area-device-verification-2026-08-24.md)
measured the former native WebViews. These are retained hardware/browser facts with that scope, not
a fresh RN native verification:

* **The rotation-angle sign is correct.** Measured on an Android emulator with distinguishable
  sides: angle `90` reports the inset on the **left**, angle `270` on the **right**, and the band
  followed. The counter-clockwise reading this document argued for beat the WebKit bug comment that
  says the opposite.
* **The iOS symmetric-landscape branch is correct.** An iPhone 17 Pro reported `62` on both sides in
  a landscape interface and the app painted both edges.
* **A native Android WebView really does report a cutout** — `42` on a Pixel 7 Pro AVD with WebView
  150, confirming the M144+ claim above against a Chrome tab's `0`.

## Open questions worth an on-device check

1. Whether Android's "Simulate a display with a cutout" developer option propagates into
   `env(safe-area-inset-*)` in Chrome and WebView. Chrome's edge-to-edge guide covers only the
   gesture nav bar and never mentions cutouts. (The 2026-08-24 run used an AVD with a *declared*
   cutout, not the developer option, so this stands.)
2. Whether WebKit mirrors the iOS 26 change of the landscape top inset from `0` to `20`. Confirmed
   for UIKit, unconfirmed for `env()`. Related and now measured: iPadOS 26 raised the iPad **top**
   inset from 24 to 32 in `env()`, so the iOS 26 inset changes do reach the web layer.
3. The Safari-tab inset column for a specific iPad model — derived from how the WebView is laid out
   rather than from a per-model browser dump.
4. Whether any shipping Android device reports **both** side insets non-zero in landscape, the
   paired cutout-plus-nav-bar case `android-native-punch-3button` models. Enabling 3-button
   navigation on an emulator did not produce it: `env()` carried only the cutout in both rotations.
