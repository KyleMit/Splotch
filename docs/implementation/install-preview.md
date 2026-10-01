# Install Banner home-screen preview

The leading visual previews the installed icon and its label. The 60px decorative wrapper uses the
existing opaque `apple-touch-icon.png` at 52px, with asynchronous decoding and the 12px semibold
`APP_HOME_SCREEN_NAME` label. The main row starts at the icon top; copy has the existing 4px spacing
step above it. Portrait phones retain the full-width second CTA row.

The manifest's long name was `Splotch - Drawing for Kids`, while its short name and Apple title were
`Splotch`. Both manifest fields use `Splotch` so every install label matches the preview. The banner
is the production consumer of the small identity module. App-template and manifest literals remain
at those file boundaries, with independent drift guards for all three names.

The light icon lift is local to this home-screen preview. Explicit and system dark selectors use the
existing `--float-shadow`; an explicit light preference overrides system dark. This follows the
requested single-surface treatment without adding a one-consumer global elevation token. Other
spacing, radius, type, weight, and ink values reuse design tokens. The share-card producer inputs
are untouched, so their provenance digest remains unchanged.

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
* Initial production browser checks: 61 targeted and 1,130 complete suite tests passed. Browserless
  checks passed with 4,388 app, 45 SSR, 277 asset, 23 store-drawing, 6,651 tool tests, and 42 API
  smoke checks. All 14 local Quality checks passed.
* Independent review found the system-dark shadow path was missing. Four effective-appearance cases
  cover system light/dark and explicit light/dark overrides. Against the original production
  artifact only system dark failed; the other three passed. The local selector includes both forms.
* Final production browser suite: 1,134 passed. Final Browserless mirror: all five tiers passed;
  final Quality mirror: all 14 checks passed.
* Web release startup: 457,438/525,000 bytes, 40/40 modulepreloads; eagerly loaded error union:
  486,343/525,000 bytes. Native static release: 6,211,707/7,000,000 bytes and 28/28 modulepreloads.
  Both release builds passed their seams and target-boundary checks. Native install-event
  registration is absent; its hydrated compiled home route shows no banner or preview after four
  real strokes, a synthetic install event, and opening/closing Settings. The shared lazy overlay
  retains banner code. These are compiled static artifacts, not physical-device or signed-store
  tests.
* Final independent review and exact-head CI results are recorded in the pull request.
