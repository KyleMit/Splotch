# ADR-0026: Notch Band via a Safe-Area CSS Strip, Not Per-Platform Native Status Bars

**Status:** Active
**Date:** 2026-06

## Context

A phone's top notch / hole-punch strip is dead space in Splotch. The goal was to
paint it with the currently selected drawing color (and clear it to paper-white
on the eraser), animating the change — across all four deployment targets: web
and native, on Android and iOS.

There is no single API that colors that strip everywhere:

- **`<meta name="theme-color">`** tints the Android web status bar (Chrome tab /
  installed PWA) but is ignored by an iOS standalone PWA (which runs
  `black-translucent`) and by the native WebViews.
- **`@capacitor/status-bar` `setBackgroundColor`** is Android-only and a no-op on
  iOS, where the status bar is a translucent overlay whose background can't be
  set to an arbitrary color.

The unifying observation: wherever web content draws *under* the status bar, a
plain CSS element sized to `env(safe-area-inset-top)` paints the strip. That
holds on iOS native, the iOS standalone PWA, and — because `targetSdkVersion = 36`
forces edge-to-edge on Android 15+ (`android/.../MainActivity.java`) — native
Android too. The app previously did **no** safe-area handling at all (no
`viewport-fit=cover`, no `env(safe-area-inset-*)`), relying on the browser's
default auto-inset to keep content clear of the cutout.

## Decision

Paint the notch with **one CSS band** (`NotchBand.svelte`) sized to
`env(safe-area-inset-top)`, driven by one reactive source of truth
(`computeNotchBandState` in `src/lib/notchBand.ts`), rather than per-platform
native status-bar coloring. Three mechanisms fan out from that source, each only
where it's the one that reaches the strip:

- **CSS band** — the primary visual on iOS native, the iOS PWA, and native
  Android. A CSS `background-color` transition gives the animate-in for free.
- **`<meta name="theme-color">`** — kept in sync because it is the *only* thing
  that tints the Android web status bar; a harmless no-op elsewhere.
- **`@capacitor/status-bar` `setStyle`** (native only, lazy-loaded via
  `lazyPluginModule`) — flips the system clock/battery icons light or dark for
  contrast against the band, by luminance (`isLightColor`, shared with
  `getRingColor` in `colorRing.ts`). We use `setStyle` **only** — never
  `setBackgroundColor` — so the CSS band remains the single source of the color.

Enabling this required `viewport-fit=cover` (`app.html`), which is global: it
makes content on every route reach under the cutout. So the flow container and
the edge-anchored buttons (`app.css` `.app-container`, Clear / Actions / Parent)
were given `env(safe-area-inset-*)` padding to stay clear of the notch and home
indicator.

**Cutout detection.** The band only paints when the measured top inset clears a
threshold (`NOTCH_INSET_THRESHOLD_PX = 30`): iPhone notches / Dynamic Island
(~44–59px) and Android hole-punches clear it; a bezel-camera iPad or a plain
status bar (~20–24px) does not, so those get no band. CSS insets cannot perfectly
separate an Android hole-punch from an iPad status bar (they overlap near ~24px);
the threshold reliably excludes the bezel-iPad case and is the single tuning knob.

The platform-independent decisions (band color, cutout test, status-bar style,
the full fan-out) are pure functions in `notchBand.ts`, unit-tested across the
four targets, the color/eraser states, and the no-cutout case, with no DOM.

## Consequences

- **+** One mechanism and one source of truth instead of three per-platform code
  paths; consistent rendering and a CSS-driven animation we fully control.
- **+** The decision logic is DOM-free and unit-tested per deployment target.
- **+** Native coupling is minimal: `setStyle` for icon contrast only, lazy-loaded.
- **−** `viewport-fit=cover` is global and shifts every route's relationship to the
  safe area; the inset padding restoring current spacing is a standing tax on any
  new edge-anchored UI (it must add the matching `env(safe-area-inset-*)`).
- **−** Cutout detection is a luminance-of-inset heuristic, not a true display-
  cutout API; a device whose status-bar inset sits near the threshold could
  misjudge. Tunable via one constant.
- **−** iOS is the least-certain target: the band depends on the WebView drawing
  under the status bar with `viewport-fit=cover`, which needs on-device
  verification (revisit `capacitor.config.json` `ios.contentInset` if the band
  doesn't extend under the notch). A non-installed iOS Safari tab reports ~0 top
  inset in portrait, so it shows no band — acceptable (kids use the PWA/native app).
