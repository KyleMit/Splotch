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

## Open defect: the band paints on the wrong edge in landscape

`cutoutEdge()` in `lib/platform/notchBand.ts` picks the landscape band edge by taking the deeper
side inset:

```ts
return input.insetRight >= input.insetLeft ? { edge: 'right', ... } : { edge: 'left', ... };
```

That rule fails on both platforms, for different reasons:

* **iOS** reports the two sides *equal*, so `>=` is always true and the band always paints right —
  correct on `landscape-right`, wrong on `landscape-left`. Half of all landscape use.
* **Android with 3-button navigation** moves the nav bar to the side *opposite* the camera in
  landscape, where it is deeper (48dp) than the cutout (~38dp). The rule then picks the nav bar in
  *both* rotations, painting the drawing colour behind the back/home/recents buttons and leaving the
  camera strip bare.

Painting the wrong edge is worse than painting nothing: it spends claimable screen on a colour bar
*and* leaves the strip the band exists to fill unpainted.

CSS alone cannot fix this — on iOS the information is genuinely absent. A fix needs a native signal
(`screen.orientation.angle` plus knowledge of where the camera sits), or a decision to paint both
sides in landscape, or to drop the landscape band. That is a product call, so the current behaviour
is pinned rather than changed: `devices.test.ts` asserts `wrongSide === true` for both cases, so a
fix is a deliberate, visible change to a test that names the defect.

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
