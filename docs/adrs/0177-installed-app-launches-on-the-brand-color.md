# ADR-0177: The Installed App Launches on the Brand Color

**Status:** Active **Date:** 2026-09

## Context

An installed web app's launch screen is drawn by the operating system from the manifest, before any
page code runs. It was white. A parent with a dark phone saw a white screen and then the dark app, a
drop of 88 points of lightness on a 0 to 100 scale.

The manifest spec gained `color_scheme_dark` on 2026-04-09, which overrides `background_color` and
`theme_color` when the operating system is dark. Two things limit it. Chromium's manifest parser
reads no dark member, so Android ignores it today; WebKit's parser reads it. And the launch screen
follows the operating system while the app follows the parent's Appearance setting, so a dark launch
screen can hand off to a light app.

On Android the launch screen draws the maskable icon whenever the manifest offers one. Depending on
how the app was installed it draws that icon masked or as the whole square. The shipped icon had an
opaque white ground, so on any launch color but white it showed as a white square. An emulator
launch with a purple `background_color` confirmed it.

Alternatives considered, each mocked against both papers in a spec sheet:

* **White**, as before. Seamless into the light app, an 88-point drop into the dark one.
* **Brand wash.** Still an 80-point drop into the dark app.
* **Dark paper.** Seamless into the dark app and an 86-point jump into the light one.
* **Dark paper only under `color_scheme_dark`.** Helps no Android phone today, and can disagree with
  the app's theme.
* **Brand on a transparent mascot.** The mascot's purple stripe disappears into the ground.

## Decision

The launch screen is the brand color under either color scheme, with the mascot on a white disc.

* `web/static/site.webmanifest` sets `background_color` to `--brand` (`#ab71e1`), 41 points from the
  light paper and 46 from the dark.
* `color_scheme_dark` overrides `theme_color` only. It does not name a `background_color`, so the
  launch screen is the same color on a dark phone.
* The maskable icons (`web-app-manifest-maskable-*.png`) have a brand-color ground with the mascot
  on a white disc inside the maskable safe zone. Drawn as a square on the launch screen, the ground
  cannot be told from the screen; masked for the home screen, the disc fills the mask.
* The any-purpose icons (`web-app-manifest-any-*.png`) are the same disc on a transparent ground.
* `web/src/lib/theme.manifest.test.ts` holds the manifest to `THEME_COLORS` and the brand token,
  reads the corner pixel of each maskable icon against `background_color`, and requires the
  any-purpose ground to be clear.
* The new files are in `WEB_ONLY_STATIC_FILES`, so the native export drops them with the manifest.

The icons were rendered from `web/src/lib/icons/splotchy.svg`. `web-app-manifest-192x192.png` and
`web-app-manifest-512x512.png` stay for the store-frame harness, which shows them as the app icon.

## Consequences

* \+ The launch screen is a similar distance from both papers, so neither theme gets a flash.
* \+ The launch screen does not depend on which icon Android picks or whether it masks it.
* \+ The home-screen icon shows the whole mascot. The earlier maskable art ran past the safe zone
  and was cropped by a round mask.
* − The home-screen icon changes for new installs, and for existing ones when Chrome next refreshes
  the install. Launchers with a wider mask than a circle show a brand-color corner around the disc.
* − Light-theme launches trade a seamless white for a 41-point step.
* − Verified on an emulator that installs a home-screen shortcut. The emulator could not mint the
  install type a phone with a Google account gets, so that path is unverified.
* − iOS home-screen launch screens are not covered.

Evidence: `docs/scratchpad/pwa-launch-fouc-2026-09-28/README.md`.
