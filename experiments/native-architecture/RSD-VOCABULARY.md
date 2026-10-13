# RSD drawing vocabulary and native adapters

The canonical `src/index.ts` registers `ProbeApp`, which mounts `RsdDrawingScreen`. Shared chrome,
recovery cards, labels, selection groups and actions use React Strict DOM 0.0.54. The behavior,
ordered ink, history, save and export owners remain the drawing candidate owners. This alternative
is unselected and incomplete.

Explicit native boundaries are `NativeFrame` (safe area and window background), `NativePaper`
(drawing surface and measured paper geometry), `NativeDialog` (native modal and bounded action
scroll viewport), `NativeScrollAreas` (the full-bleed drawing layout and the bounded status
viewport) and `RsdRecoveryNotice` (the PNG recovery scroll viewport). Its cards and exact filename
actions remain RSD children; the viewport itself is a React Native `ScrollView`.

The released RSD native renderer implements `html.div` using a native view. Accepting the `overflow`
style does not create a `ScrollView`. The recovery adapter therefore uses the existing drawing
layout owner's 25% feedback height bound and spacing. The drawing layout follows the shipping app:
one bar of paint swatches plus More colors along the top edge in portrait and down the left edge in
landscape, Clear on the right edge, Settings in the bottom-right corner, and the remaining tools in
a drawer whose chevron (`Expand controls` / `Collapse controls`) sits in the bottom-left corner. The
bar is the shipping Color Palette plate (`--surface` with its drop shadow on the paper) holding
fixed 55px portrait / 60px landscape swatches that Button Size leaves alone (`paletteGeometry.ts`).
It measures its own length and shows as many swatches as fit at full size, by the shipping ladder's
formula, trimming by the shipping trim order (`PALETTE_TRIM_ORDER`, drift-guarded by
`tools/tests/native-drawing-tokens.test.mjs`; the geometry and ladder by
`tools/migration/tests/rsd-native-drawing-frame.test.mjs`); remembered custom paints go first, and
the selected paint always keeps a swatch. Shipping hides the bar on phone landscape and moves color
into the Actions Panel; the native bar stays until that panel is ported. Compact paint radios retain
their full accessible names, checked state, visible selected treatment and actual paint colors.
Paint radios are raised, round, text-free swatches (`RsdSwatch.tsx`) whose selected state is the
shipping Selection Ring: a band of the bar surface inside the edge, a one-pixel surface seam and a
4px ring a shade off the paint (`selectionRingColor`, shipping's `getRingColor`). More colors is the
honeycomb on a raised surface disc. Settings is the muted `RsdIconButton` corner skin. Toolbar
actions are icon buttons drawn from the shipping icon set through `RsdIcon` (react-native-svg
`SvgXml` on every platform, fed by the generated `icons.generated.ts`); each keeps its former text
as its accessible name. The Drawing tools sheet in the drawer keeps the brush and width choices and
the less frequent actions. Their touch size imports the drawing control owner. Status messages have
no visible strip: `RsdDrawingStatus` speaks them from an `RsdVisuallyHidden` live region over the
paper, and shows only the retry controls a failure needs. The paper area and sheet wear the shipping
handmade-paper grain (`PaperTexture`, a memoized tile that ink never re-renders) with no border, and
a sheet presented smaller than its area sits lifted on a flat `paperMargin` with the float shadow.
`NativePaper` fills the paper area behind the floating edge controls and contain-fits the fixed
logical paper into it, centered, the way the shipping app presents a rotation-locked paper
(ADR-0050); the paper keeps its fixed aspect, so a portrait phone shows it full width with margins
above and below. These allocations require native geometry and visual verification; source flex
bounds alone do not establish usable paper space. The recovery viewport preserves individual
actionable children, names itself “PNG recovery” with the `rsd-png-recovery-viewport` identity, and
retains clipped child views. Recovery state and scrolling stay settled while contacts are drawing.
An empty recovery state allocates no viewport. No new PNG writer, queue capacity, persistence policy
or Dismiss owner is introduced.

Every shared action supplies both `disabled` and the explicit boolean `aria-disabled`. The released
native renderer maps the latter into accessibility state, including false after true. The
application keeps its settings/menu/busy guards; this does not force settings ready or bypass
unavailable controls. A native transition still requires empirical readback.

The native dialog retains Modal back/dismiss callbacks and gives its RSD options a bounded, named
scroll viewport. Its caller-owned close action sits in a nonshrinking native footer outside that
viewport. Dialog content uses a natural-height stack rather than a full-screen flex basis inside
scroll content. Main tools, pages, saved pictures and settings keep their behavior owners. Native
escape declarations do not establish keyboard or screen-reader equivalence.

Focused source and mounted-host checks can establish the released renderer, viewport props, exact
action identity, disabled input and canonical transform. They do not establish native scroll
geometry or screen-reader behavior. A fresh optimized artifact and actual native controls/dialog
scrolling, enabled-state transition, paper geometry and recovery scroll/reveal/Dismiss interaction
must bind this source before native acceptance. The existing pre-scroll build and structural fixture
results do not cover this adapter. Small-screen and large-text paper allocation, remaining native
drawing fidelity, complete web adapters, lifecycle, services, security and release gates remain
open. See the migration contract and Phase 1 plan.

`NativeFrame` owns a `react-native-safe-area-context` 5.7.0 provider and padding safe-area view for
all four window edges. Each frame mounts its provider in its own coordinate space: the drawing root
and every native Modal window use separate providers. Core React Native SafeAreaView is not an
Android inset owner. No initial activity metrics are transplanted into a Modal. The fixed
nonshrinking footer remains outside the options ScrollView, with token padding inside the safe area.
Back/dismiss/busy guards and the 52-point control minimum remain unchanged.

The new package declaration is unresolved until an ordinary owned pnpm resolution, exact released
archive/source qualification, native autolinking and frozen install succeed. Existing c2f2 graph
receipts remain historical; their authenticated topology fences intentionally reject this new
declaration until a separately reviewed additive graph projection exists. No native inset or footer
visibility acceptance is inferred from source or mounted-host tests.

## Design tokens

`src/rsdDrawing/tokens.css.ts` is generated from the shipping design owner
(`web/src/lib/design/tokens.ts`, plus the layout tokens `web/src/app.css` declares) by
`tools/migration/lib/rsd-fixture-tokens.mjs`; never edit it by hand. Every group is a statically
analyzable `css.defineVars`, so StyleX compiles it to custom properties on web and the RSD native
runtime resolves the same variables on Android and iOS. Dark mode is the one `darkTheme` over
`colors`, applied where the screen and dialog roots already apply it.

| Group                                     | Web                                      | Android and iOS                                                                                                                   |
| ----------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `colors` / `darkTheme`                    | every themed color, plus `floatShadow`   | the same strings; slash-alpha `rgb(r g b / n%)` is emitted as `rgba(r, g, b, a)`, the only alpha form React Native's parser reads |
| `brandColors`, `fixedColors`              | unthemed colors and `clearGradientRest`  | the gradient reaches React Native as `experimental_backgroundImage`                                                               |
| `shadows`, `colors.floatShadow`           | `box-shadow` lists                       | React Native `boxShadow` strings, rgba colors                                                                                     |
| `motion`                                  | durations and `cubic-bezier()` curves    | RSD parses `s`/`ms` and turns `cubic-bezier()` into `Easing.bezier`                                                               |
| `dimensions` spacing, radii, type, layout | `px` lengths                             | the same lengths                                                                                                                  |
| `dimensions.radiusBlobN{Corner}`          | one percentage per corner                | React Native corners take one radius, so each elliptical shipping corner keeps the mean of its two radii                          |
| `blobShapes`                              | the full elliptical radii                | the same numbers; `src/rsdDrawing/blob.ts` draws a blob as an SVG path from them                                                  |
| `stepNumberMix`                           | the step badge's `color-mix()` strengths | the same numbers; `src/rsdDrawing/RsdStepNumber.tsx` mixes the wash and digit ink itself                                          |
| `dimensions.fontSizeDisplayMin/Max`       | the `clamp()` bounds                     | no `calc()`/`clamp()`: `fontSizeDisplayFluid` carries the viewport term for a caller to evaluate against the window width         |
| `dimensions.modalGutterMin`               | the gutter floor                         | the safe-area term is the caller's, from `react-native-safe-area-context`                                                         |
| `fonts` weights                           | the variable face's 500/600/700          | `fontTheme.native.ts` swaps in one static face per weight; medium takes the regular face, since no 500 face is bundled            |

Shipping tokens with no projection — the other `color-mix()` strengths, bare RGB channels, the
Skia-drawn paper effects, the iOS input-zoom floor and the mono stack — are listed with their
reasons in `RSD_UNPROJECTED_TOKENS`. `tools/migration/tests/rsd-drawing-tokens.test.mjs` fails when
a shipping token is added or changed without regenerating, or when a projected value stops parsing
in React Native.

## Buttons

`RsdButton`, `RsdIconButton` and `RsdFlyoutMenu` (`src/rsdDrawing/`) port the shipping design
`Button` (`brand` / `wash` / `outline` / `danger` × `sm` / `md` / `lg` / `hero`, busy and disabled),
the `.corner-button`, Actions Panel `.action-button` tile and `.flyout-option` skins, and the
`.flyout-menu` card, including the `.white-stroke` / `.dark-stroke` ink keylines. No screen uses
them yet; the screen units adopt them.

* **Hover** sits under `@media (hover: hover)`. The web matches it; React Native never does, so a
  touch device shows no sticky hover, as the shipping touch WebView shows none.
* **Press** is an RSD `:active` transition. On the web it is CSS `:active`. On Android and iOS the
  renderer's own `:active` follows raw pointer down and up, and a touch that slides off and lifts
  elsewhere never sends the control its pointer up, so `RsdPressable` drives that state from
  Pressable's press-in and press-out instead: released on sliding off, on cancellation and on
  release, pressed again on sliding back. The native renderer animates only the transition
  properties named by their camelCase style key, so `transform` and `opacity` run on the native
  driver (one render as the press starts, one as it ends) and the kebab-case color names reach the
  web's CSS transition alone.
* **Style reaches an `html.*` element by name.** React Strict DOM's web Babel transform merges only
  a `style` prop it can see, so a wrapper that spreads its props onto an `html.*` element ships an
  uncompiled style array to the DOM. `RsdPressable.web.tsx` destructures `style` and passes it
  explicitly; `tools/migration/tests/rsd-web-buttons.test.mjs` compiles the buttons with the
  production web transform and fails on the spread form.
* **Flyout options** take the tile's size-class `base` and the Button Size `scale` separately, as
  shipping does: the option is `max(base, 60) × scale` and its padding `7 × scale`.
* **Selected** uses `aria-checked` with a `radio` or `switch` role. Shipping's `aria-pressed` has no
  native mapping in the released renderer.
* Values shipping writes as literals rather than tokens (press scales, the hero size, outline
  insets, the busy ring, the corner opacities, tile and flyout geometry, the `color-mix()` brand
  shadows resolved to `rgba()`) are exported beside each component, because the StyleX web compile
  resolves only local constants and token files inside `css.create`.
  `tools/migration/tests/rsd-native-button-chrome.test.mjs` reads `Button.svelte` and `app.css` and
  fails when one diverges, including the variant list and each variant's fill, label, border, hover
  and disabled tokens; `rsd-native-button.test.mjs` and `rsd-native-icon-button.test.mjs` mount
  every variant, size and state through the released native renderer.

## Pickers and sliders

`RsdSegmentedPicker` ports the shipping design `SegmentedPicker`: the `segment` track with its
sliding brand thumb, the two-column toggle `chip` grid and the `underline` tabs, in radio mode (a
radiogroup with one roving tab stop and arrow-key selection, `rovingRadio.ts`) or toggle mode.
`RsdSlider` and `RsdSliderRow` port the shipping relative-drag `Slider` and its labelled settings
row (`sliderModel.ts` holds the drag, detent and key rules). Neither is adopted by a screen yet.

Each picker option sits in a React Native view whose `onLayout` frame places the thumb, so the same
measurement serves web and native. The thumb is a Reanimated view: a selection change starts a
`withTiming` glide on the UI thread (requestAnimationFrame on web), and first placement, a resize
and reduced motion snap; no frame renders React. The options' ink fades are CSS transitions on web
only (`pickerPlatform.ts`); React Strict DOM would run them natively through the JS-driven
`Animated`. React Strict DOM also drops `aria-pressed` natively, so a pressed toggle chip reports
`selected` there (`pickerPlatform.native.ts`). `onLayout` frames and `translateX` are physical, so
the thumb starts at the track's physical left: `right: 0` where React Native swaps left and right in
RTL (`thumbOrigin`), `left: 0` everywhere else.

The slider's host is a React Native view, because the responder system carries the relative drag on
every renderer and only a React Native view takes the increment and decrement accessibility actions
VoiceOver and TalkBack adjust a slider with. It is `accessible`, so VoiceOver focuses it as one
element, and its responder grant returns `true`, which blocks the native responder so an enclosing
`ScrollView` cannot cancel a drag that drifts vertically. Its track, fill, detent notch and thumb
are React Strict DOM children painted from the tokens.

The literals these ports carry that no token holds (the thumb's travel and its `--ease-glide` curve
for Reanimated, option and icon sizes, the slider's disc, track, shadows and notch, the phone
breakpoint) are exported as `PICKER_METRICS` and `SLIDER_METRICS` and read against the Svelte
sources by `tools/migration/tests/rsd-native-segmented-picker.test.mjs` and
`rsd-native-slider.test.mjs`. Not ported: the shipping `inputName` native-form radios (React Native
has no form submission), the keyboard focus ring (React Strict DOM has no `outline` or
`:focus-visible`). Arrow-key roving and slider keys reach the option cell and slider host through
react-native-web's key events; a hardware keyboard on Android or iOS is unverified.

## Settings rows

The Settings building blocks port the shipping components one to one, for the Settings screens to
adopt: `RsdToggleSwitch` and `RsdToggleRow` (`settings/ToggleSwitch.svelte`, `ToggleRow.svelte`),
`RsdSettingCard`, `RsdSettingGroup` and `RsdSettingSectionBody` (`SettingsModal.svelte`'s `.setting`
and `.setting-group`), `RsdRuleLabel` (`design/RuleLabel.svelte`), `RsdHubRow`
(`settings/HubList.svelte`) and `RsdSidebarRow` (`nav/SidebarToc.svelte`'s Settings rows), with the
shared `RsdActivityDot`.

The switch is the one platform split. On the web (`RsdToggleSwitch.web.tsx`) it is a
`<button role="switch">` described by the row's help line through `aria-describedby`, its row label
is a `<label for>`, and the thumb slides by a CSS transition over `--duration-base`. On Android and
iOS (`RsdToggleSwitch.tsx`) a React Native `Pressable` carries the switch role, the checked and
disabled state, and the help line as its accessibility hint, which React Strict DOM cannot express;
the thumb slides through a Reanimated shared value on the UI thread, so a toggle renders React once
rather than per frame. Both read the app's Reduce Motion answer and land the thumb without sliding
when it is on. The track, thumb face and glyph are shared RSD markup (`toggleSwitchFace.tsx`). React
Native mirrors the thumb's `left` inset to the trailing edge in an RTL layout while its translation
stays physical, so the native slide is signed: leftward when the layout is swapped.

The hub row's two-line subtitle is the other web difference. React Strict DOM compiles `lineClamp`
to native `numberOfLines`, but on the web to a bare `line-clamp`, which browsers ignore outside a
`-webkit-box`; `lineClampBox.web.tsx` wraps the text in shipping's clamp box there.

`tools/migration/tests/rsd-native-settings-rows.test.mjs` mounts every primitive through the
released native renderer, light and dark, and reads each geometry value from the shipping Svelte and
CSS sources (`rsd-settings-rows-shipping.mjs`); `tools/tests/native-settings-rows-web.test.mjs`
covers the web switch and the hub subtitle's clamp.

## Design primitives

`src/rsdDrawing/` ports the small shipping primitives in `web/src/lib/components/design/` and the
`app.css` confirm card and step badge: `RsdDisclosure`, `RsdStatusMessage`, `RsdScrollCue`,
`RsdVisuallyHidden`, `RsdExternalMark`, `RsdConfirmCard`, `RsdStepNumber`, and the `RsdTextField` /
`RsdTextArea` input skin. They take their values from the generated tokens or the drift-guarded
`DRAWING_THEMES` projection; component-level literals (the confirm card's 336px, the cue's 72px, the
textarea's 88px) are exported beside each component and read back from the shipping source by
`tools/tests/native-design-primitives-drift.test.mjs`.
`tools/migration/tests/rsd-native-design-primitives.test.mjs` mounts each one through the released
RSD native renderer and checks its accessibility props and resolved light and dark styles.

Where React Native differs:

* Status messages and the live `RsdVisuallyHidden` set `role` and `aria-live`, which Android reads
  as a live region. iOS has none, so they also announce their text through
  `AccessibilityInfo.announceForAccessibility`.
* React Native lays out a span nested in other text inline and ignores its box, so
  `RsdVisuallyHidden` belongs beside text, never inside a text run. `RsdExternalMark` carries its
  "(opens outside Splotch)" name as the `aria-label` of a single `role="img"` drawing instead, so it
  works inline too.
* Paint blobs are SVG paths, and the external arrow is drawn into the same SVG as its blob.
* The text fields wrap React Native's `TextInput` from `src/drawing/Text.tsx`, so they take the
  Quicksand face, and draw the focus ring with React Native's `outline*` styles.
* `RsdConfirmCard` lays out the title, copy and two actions; the caller passes the actions (the
  design Button) and hosts the card in its dialog.
