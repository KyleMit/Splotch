# Safe areas across devices

How `env(safe-area-inset-*)` behaves on the hardware Splotch ships to, how the app consumes it, and
how to test a layout change against the whole device matrix without owning the devices.

Two tools do the testing, and they answer different questions:

| Tool                       | Command                                | Answers                                                                                                      |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/dev/notch` harness       | `npm run dev`, then open `/dev/notch`  | "What does this look like on a Pixel in landscape?" — every profile, every orientation, the live HUD, by eye |
| `safe-area-matrix.spec.ts` | `npm run test:e2e -- safe-area-matrix` | "Did anything break?" — the same matrix, asserted, in CI                                                     |

## The consumption seam

Nothing in `web/src` calls `env(safe-area-inset-*)` directly. `app.css` seeds four custom properties
on `:root` and every consumer — CSS and the JS probe alike — reads those:

```css
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  /* right, bottom, left */
}
```

The indirection exists because **`env()` cannot be overridden by an author**. Environment variables
are UA-defined, and the `env(x, fallback)` second argument fires only when the variable is
*unsupported* — never when it resolves to `0`. Every engine you would test in supports it, so the
fallback is dead code and `env(safe-area-inset-top, 44px)` yields `0px` on your desktop. One level
of indirection is the only way a harness can render the app under someone else's insets.

Two tests hold the seam together, and both matter:

* `web/src/lib/platform/safeAreaProperties.test.ts` — `app.css` seeds every edge, and no other
  source calls `env(safe-area-inset-*)` directly. A consumer that slips back to `env()` still looks
  right on a real device, which is exactly why nothing else would catch it, and becomes invisible to
  the harness.
* `safe-area-matrix.spec.ts` — at runtime, `var(--safe-area-top)` resolves to the same number as
  `env(safe-area-inset-top)`. The static guard proves nobody bypassed the properties; this proves
  the properties still carry the value.

`measureSafeAreaInsets()` (`lib/platform/safeArea.ts`) reads the numbers with a hidden
fixed-position probe rather than `getComputedStyle` on the custom property — the property read is
[reported broken in WebKit](https://bugs.webkit.org/show_bug.cgi?id=191872), the probe is not.

## How to emulate insets

| Approach                                  | Genuine `env()`?                 | Verdict                                                                      |
| ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `env()` fallback argument                 | —                                | **No.** Fires only when unsupported, never on `0`                            |
| `--safe-area-*` override                  | No — the properties, not `env()` | **Yes** for layout. What `/dev/notch` uses; works in any browser             |
| Chrome DevTools device mode               | No                               | **No.** Always reports `0`, for every device preset                          |
| CDP `Emulation.setSafeAreaInsetsOverride` | **Yes**                          | **Yes.** Chromium only. What the matrix spec uses                            |
| iOS Simulator (Safari + WKWebView)        | **Yes**                          | **Yes** — best free fidelity. macOS, and safaridriver rather than Playwright |
| Android dev options → simulate a cutout   | OS-level yes                     | Propagation into `env()` is **unverified**; see the open questions           |
| Real-device clouds                        | **Yes**                          | Yes, and expensive. Release branches, not every PR                           |

Two traps in the CDP path, both handled by `overrideSafeAreaInsets` in `web/tests/cdp.ts`:

* **Send all eight keys.** The protocol says "unset values will cause the respective variables to be
  undefined, even if previously overridden" — omitting `left` un-defines it rather than leaving it
  alone.
* **Insets must be integers.** The call is rejected outright on a fractional one, but real devices
  report fractions (a Galaxy S23 Ultra's `28.571`), because the value is a dp measurement divided by
  a non-integer display density. The helper rounds and returns what it applied.

## What the devices actually report

The full dataset with per-entry sources and confidence is `web/src/routes/dev/notch/lib/devices.ts`.
The rules worth carrying in your head:

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
cutout; **24px is the hard ceiling for a top inset on any iPad**, which is what gives
`NOTCH_INSET_THRESHOLD_PX = 30` its headroom in both directions (iPad max 24, iPhone min 44).

**Rounded corners do not inset the sides.** An iPad 10th gen has the largest corner radius Apple
ships (25pt) and still reports `left: 0, right: 0`. Android waterfall/curved-edge insets default to
`0` in AOSP and no shipped device overrides them.

**Android web never sees a cutout.** `safe-area-inset-top` is always `0` in a Chrome tab (Chrome's
own toolbar occupies that band) and still `0` in an installed PWA as of 2026-07
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

`landscapeBandEdges()` in `lib/platform/notchBand.ts` now keys on **symmetry**, not depth:

| The two side insets        | What the band does | Why                                                                                                                                                |
| -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equal                      | Paint **both**     | This is exactly the case the app cannot resolve — and both strips are already outside the content box, so covering both spends no claimable screen |
| Different, angle 90        | Paint **left**     | The sides are distinguishable and the rotation says which                                                                                          |
| Different, angle 270       | Paint **right**    |                                                                                                                                                    |
| Different, no usable angle | Paint **nothing**  | A band on the wrong edge is worse than no band: it spends claimable screen *and* leaves the cutout bare                                            |

### The rotation angle, and the one version that disagreed

`screen.orientation.angle` is at the browser floor (Chrome 38 / Safari 16.4), is already in the
compatibility register, and is already read by `lib/drawing/engine.ts`. The angle is the
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

**Not yet verified on hardware.** The post-fix iOS mapping is inferred from WebKit's current source
plus Apple's `UIInterfaceOrientation` semantics; no public measurement on a real notched iPhone
exists. It does not currently affect the band (iOS never reads the angle), but it would if that
branch ever changed. The measurement is cheap: log `screen.orientation.angle` beside
`env(safe-area-inset-left)`/`-right` in both landscape rotations — the deeper inset is the notch
side. Also note Safari 17 changed iPad's *natural* orientation to landscape, which reshuffles the
angle mapping there; no iPad has a cutout, so nothing in the band depends on it.

## What the harness models, and what it does not

The `/dev/notch` frames run the ordinary **web** build, so `isNative()` is false and no Capacitor
plugin executes. A native-only behaviour reaches a tile only when it changes geometry *and* the
harness models it explicitly. One does today: Android native hides the status bar in landscape
(`statusBarHiddenFor`), so `appliedInsets()` in the harness zeroes that top inset before rendering —
otherwise a tile shows a strip of padding the shipped app does not have. Native status-bar icon
styling changes no geometry and is simply absent.

The device numbers in `DEVICE_PROFILES` stay untouched research; `appliedInsets()` layers the app's
own policy on top by calling the app's own function, so the two cannot drift.

## Adding a device

Add an entry to `DEVICE_PROFILES` in `web/src/routes/dev/notch/lib/devices.ts` with its sources and
an honest `confidence`. Both the harness and the matrix spec read that one array, so a new profile
appears as a section in the gallery and as a set of scenarios in CI on the next run. Add a profile
only for a **distinct inset tuple** — a second phone reporting the same four numbers at the same
viewport exercises nothing the first didn't.

## Open questions worth an on-device check

1. Whether Android's "Simulate a display with a cutout" developer option propagates into
   `env(safe-area-inset-*)` in Chrome and WebView. Chrome's edge-to-edge guide covers only the
   gesture nav bar and never mentions cutouts.
2. Whether WebKit mirrors the iOS 26 change of the landscape top inset from `0` to `20`. Confirmed
   for UIKit, unconfirmed for `env()`.
3. The Safari-tab inset column for a specific iPad model — derived from how the WebView is laid out
   rather than from a per-model browser dump.
