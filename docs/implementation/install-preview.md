# Install Banner home-screen preview

The leading visual previews the installed icon and its label. The 60px decorative wrapper uses the
existing opaque `apple-touch-icon.png` at 52px, with asynchronous decoding and the 12px semibold
`APP_HOME_SCREEN_NAME` label. The main row starts at the icon top; copy has the existing 4px spacing
step above it. Portrait phones retain the full-width second CTA row.

The manifest's long name was `Splotch - Drawing for Kids`, while its short name and Apple title were
`Splotch`. Both manifest fields use `Splotch` so every install label matches the preview. The banner
is the production consumer of the small identity module. App-template and manifest literals remain
at those file boundaries, with independent drift guards for all three names.

The light icon lift is local to this home-screen preview. Its dark selector uses the existing
`--float-shadow`. This follows the requested single-surface treatment without adding a one-consumer
global elevation token. Other spacing, radius, type, weight, and ink values reuse design tokens. The
share-card producer inputs are untouched, so their provenance digest remains unchanged.

Done when all three modes and stages render the decorative preview in both themes and phone
orientations, names agree, expanded help clears short-phone palette and corner controls, the parting
message retains its mascot, the actual service-worker precache supplies the icon offline, and both
release build targets retain their startup and bundle budgets.

## Evidence

* Before and after: all 36 mode/stage/theme/orientation combinations captured from the real drawing
  route, plus iOS/Android help in both themes and orientations. Install API events are mocked; no
  operating-system installation is attempted.
* 320×568 returning/help bounds in both themes: banner y=141–504, palette y=0–75. The 66px gap
  leaves the palette clear. Drawer and Settings reachability are covered by real browser
  interactions.
* The parting mascot and shrink-to-Settings flow are captured in both themes and a GIF of the actual
  motion. Motion, timing, install state, copy, CTA behavior, and visibility rules are unchanged.
* Targeted unit tests: 95 passed. Each real Apple title, manifest `name`, and manifest `short_name`
  was independently changed to `Wrong`; each guard failed, then all three passed after restoration.
* Type check, ESLint, CSS lint, and token style lint passed.
* Browser, offline, release-build, complete local quality, and independent review results are
  recorded in the pull request after they finish.
