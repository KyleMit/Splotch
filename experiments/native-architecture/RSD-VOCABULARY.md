# RSD drawing vocabulary and native adapters

The canonical `src/index.ts` registers `ProbeApp`, which mounts `RsdDrawingScreen`. Shared chrome,
labels, selection groups and actions use React Strict DOM 0.0.54. The behavior, ordered ink, history
and save owners remain the drawing candidate owners. This alternative is unselected and incomplete.

Explicit native boundaries are `NativeFrame` (safe area and window background), `NativePaper`
(drawing surface and measured paper geometry), `NativeDialog` (native modal and bounded action
scroll viewport) and `NativeScrollAreas` (the full-bleed drawing layout and the bounded status
viewport).

The released RSD native renderer implements `html.div` using a native view. Accepting the `overflow`
style does not create a `ScrollView`. The drawing layout follows the shipping app: one bar of paint
swatches plus More colors along the top edge in portrait and down the left edge in landscape, Clear
docked to the right screen edge, Settings in the bottom-right corner, and the shipping Actions Panel
in the bottom-left corner (`RsdActionsPanel.tsx`): Brush, Stroke Width, Coloring Book, Screenshot,
AI Image and Undo tiles in the shipping order, followed by the muted corner chevron
(`Expand controls` / `Collapse controls`) that keeps the corner while the drawer is closed.
`edgeLayout.ts` ports `actionButtonLayout.ts` and the app.css panel rules: the size-class button
step times Button Size, capped so the line fits the paper area, a portrait column, a landscape row,
and the landscape phone's L (Brush and Stroke Width climb a vertical leg, the rest run along the
bottom). The Brush and Stroke Width buttons open `RsdFlyoutMenu` flyouts of icon options beside (or,
on a landscape row, above) their buttons, the selected option ringed, while the other tiles grey
out; a press anywhere outside closes the menu without being claimed. The menus load from their own
chunk on the web (`toolFlyouts.web.ts`). On an Android browser tab alone, the Fullscreen Toggle sits
in the paper area's top-left corner. The bar is the shipping Color Palette plate (`--surface` with
its drop shadow on the paper) holding fixed 55px portrait / 60px landscape swatches that Button Size
leaves alone (`paletteGeometry.ts`). It measures its own length and shows as many swatches as fit at
full size, by the shipping ladder's formula, trimming by the shipping trim order
(`PALETTE_TRIM_ORDER`, drift-guarded by `tools/tests/native-drawing-tokens.test.mjs`; the geometry
and ladder by `tools/migration/tests/rsd-native-drawing-frame.test.mjs`); remembered custom paints
go first, and the selected paint always keeps a swatch. On a landscape phone (shipping's
`PHONE_LANDSCAPE_QUERY`, through `isPhoneLandscapeViewport`) the bar gives its strip back to the
paper and the Actions Panel carries the shipping Color Button (`RsdColorButton.tsx`): the loaded ink
as an `ink-splotch` on an action tile, centred on the paper while the drawer is closed and topping
the L's leg while it is open, gliding between the two. A vertical swipe on it folds the drawer, as
shipping's `colorFoldGesture` does. It opens the Color Menu (`RsdColorMenu.tsx`, in the flyout chunk
on the web): the landscape palette's flat paint swatches and the honeycomb in one row, trimmed by
shipping's container-query ladder to the room beside the button (`colorMenuLayout.ts`, held rung for
rung by `tools/migration/tests/rsd-native-color-control.test.mjs`). Compact paint radios retain
their full accessible names, checked state, visible selected treatment and actual paint colors.
Paint radios are raised, round, text-free swatches (`RsdSwatch.tsx`) whose selected state is the
shipping Selection Ring: a band of the bar surface inside the edge, a one-pixel surface seam and a
4px ring a shade off the paint (`selectionRingColor`, shipping's `getRingColor`). More colors is the
honeycomb on a raised surface disc. Settings is the muted `RsdIconButton` corner skin. Toolbar
actions are icon buttons drawn from the shipping icon set through `RsdIcon` (react-native-svg
`SvgXml` on every platform, fed by the generated `icons.generated.ts`); each keeps its former text
as its accessible name. Status messages have no visible strip: `RsdDrawingStatus` speaks routine
notices from an `RsdVisuallyHidden` live region over the paper. Failures, told apart by type rather
than wording (a save the photo library refused, an action's error, a renderer fault, a failed
draft), show in `RsdFailureBanner`: the shipping Save Failure Banner's card, placement, copy and
Dismiss, plus the Retry a fault needs, loaded on first use on web. The paper area and sheet wear the
shipping handmade-paper grain (`PaperTexture`, a memoized tile that ink never re-renders) with no
border, and a sheet presented smaller than its area sits lifted on a flat `paperMargin` with the
float shadow. `NativePaper` fills the paper area behind the floating edge controls and contain-fits
the fixed logical paper into it, centered, the way the shipping app presents a rotation-locked paper
(ADR-0050); the paper keeps its fixed aspect, so a portrait phone shows it full width with margins
above and below. These allocations require native geometry and visual verification; source flex
bounds alone do not establish usable paper space.

The Settings › Appearance Button style reaches the chrome through `ToolbarSkin` (`toolbarSkin.ts`),
as shipping's `html[data-toolbar]`. Flat (`'bare'`) prints the controls on the paper: tiles, flyout
options, the flyout card and More colors lose their faces (`RsdIconButton`, `RsdFlyoutMenu`,
`RsdSwatch`), Selection Ring bands and seams take the paper, and the palette bar floats over a paper
that runs under it while the controls keep the place the raised bar leaves them. Shipping's
`BareToolbarPaper.svelte` and `GlassPanes.svelte` become `RsdBareGlass`: the rail glass inside the
bar, the two printed margin rules beside it over the paper, and the feathered panes under the
drawer, its open menu and the Settings corner, computed by shipping's own
`web/src/lib/glassPaneGeometry.ts` from the size the Actions Panel reports (`bareGlassLayout.ts`).
On the web the glass loads from its own chunk (`bareGlass.web.ts`) and only the first paint waits
for it; the native renderers have no backdrop blur or CSS masks, so their rail is shipping's opaque
no-blur fallback, their rules print unmasked, and they draw no panes.
`rsd-native-bare-toolbar.test.mjs` holds every value to the shipping sources.

Two native rules govern the flat bar. React Native paints a `position: static` child (React Strict
DOM's default) before every positioned sibling, so the palette plate is positioned, as shipping's
`.color-palette` is, to print its swatches over the rail glass. And a view with `mixBlendMode` makes
Android render its whole parent offscreen on every frame (for the margin rules, the drawing layout
with its ink), so the native rules print their blend pre-mixed against the paper
(`marginRuleInk.ts`): exact over the paper, close over ink. `rsd-native-flat-palette.test.mjs`
replays Fabric's paint order over the mounted bar and holds the pre-mixed ink to the shipping blend.

Every shared action supplies both `disabled` and the explicit boolean `aria-disabled`. The released
native renderer maps the latter into accessibility state, including false after true. The
application keeps its settings/menu/busy guards; this does not force settings ready or bypass
unavailable controls. A native transition still requires empirical readback.

The native dialog retains Modal back/dismiss callbacks and gives its RSD options a bounded, named
scroll viewport. Its caller-owned close action sits in a nonshrinking native footer outside that
viewport. Dialog content uses a natural-height stack rather than a full-screen flex basis inside
scroll content. Main tools, pages and settings keep their behavior owners. Native escape
declarations do not establish keyboard or screen-reader equivalence.

Focused source and mounted-host checks can establish the released renderer, viewport props, exact
action identity, disabled input and canonical transform. They do not establish native scroll
geometry or screen-reader behavior. A fresh optimized artifact and actual native controls/dialog
scrolling, enabled-state transition and paper geometry must bind this source before native
acceptance. The existing pre-scroll build and structural fixture results do not cover this adapter.
Small-screen and large-text paper allocation, remaining native drawing fidelity, complete web
adapters, lifecycle, services, security and release gates remain open. See the migration contract
and Phase 1 plan.

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
row (`sliderModel.ts` holds the drag, detent and key rules). The Settings section bodies below adopt
both.

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
has no form submission). The keyboard focus ring is the web export's global rule (Keyboard focus
ring below); the slider host marks its track to wear it. Arrow-key roving and slider keys reach the
option cell and slider host through react-native-web's key events; a hardware keyboard on Android or
iOS is unverified.

## Keyboard focus ring

React Strict DOM styles neither `outline` nor `:focus-visible`, so the web export draws shipping's
ring (`app.css` `:focus-visible`: a 2px `--brand` outline, offset 2px, keyboard focus only) from
global rules in `src/strict.css`. They sit outside StyleX's cascade layers, so they win over any
compiled style. An outline follows the focused element's own radius, so most controls need nothing.
A control whose ring is not its own box marks where it goes with `focusRing.ts`, as shipping's
per-component focus rules do:

* `focusRingHost('part')` on the control and `focusRingPart('ring')` on the shape it shows: the
  toggle switch track (shipping's `::before`), the slider track, the device checkbox box and the
  docked Clear face. A React Native view takes `focusRingHostView`, which react-native-web writes
  out through `dataSet`.
* `focusRingPart('halo')`: the AI style cover takes shipping's brand border and halo instead.
* `focusRingHost('inset')`: the disclosure summary, whose panel clips an outside ring.
* `focusRingHost(shape)`: a control that paints a blob as a path (the dialog Back and Close, and so
  the parental gate's and the banners' close) rounds its ring to the full elliptical blob.

`tools/tests/native-focus-ring.test.mjs` holds each value to the shipping stylesheets and mounts the
shared controls against `strict.css`, failing when one loses its ring or its shape. The native
renderers drop the marks; what a hardware keyboard shows on Android or iOS is unverified.

## Settings rows

The Settings building blocks port the shipping components one to one: `RsdToggleSwitch` and
`RsdToggleRow` (`settings/ToggleSwitch.svelte`, `ToggleRow.svelte`), `RsdSettingCard`,
`RsdSettingGroup` and `RsdSettingSectionBody` (`SettingsModal.svelte`'s `.setting` and
`.setting-group`), `RsdRuleLabel` (`design/RuleLabel.svelte`), `RsdHubRow`
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

## Settings section bodies

`RsdAppearanceSection`, `RsdSoundSection` and `RsdAccessibilitySection` port
`AppearanceSection.svelte`, `SoundSection.svelte` and `AccessibilitySection.svelte` from the rows
above, and the phone drill-in and the wide pane render the same bodies. Theme and Button style are
icon segment tracks, the orientation lock reuses `RsdOrientationPicker`, Sound is a switch over a
Volume slider and the "What makes sound" Drawing and Deleting switches, and Button Size is a slider
with its default notch beside the Reduce Motion switch.

A slider drags through many values, while the settings owner writes each choice and drops one made
during a pending write. `useSliderDraft` therefore moves a draft that previews live, and holds the
value the drag or key press settles on until the owner is ready, then writes it once; a second nudge
during the first one's write is kept, and the slider never locks. Both drafts live on the drawing
screen, so a held choice survives Settings closing and the Button Size edge controls resize under
the finger. While Volume is held, `audio/volumePreview.ts` loops the pencil at the scratch gain of
the value under the finger, as shipping's `playVolumePreview` does: it answers to the Sound switch
alone, loads the loop on the first drag through the drawing sound's own loader, and stops on
release, on the slider unmounting and on the app leaving the foreground. While Button Size is
dragged, Settings turns see-through as shipping's `.resizing` modal does: `ModalShell`'s
`seeThrough` clears the scrim and card surface, `useDialogSeeThrough` hides the header, scroll fade
and every `RsdSettingCard` except the one marked `keptSeeThrough`, the wide shell hides its table of
contents and the other sections, and the drawer opens. React Strict DOM maps `visibility: hidden` to
zero opacity natively, so each hidden piece hides itself rather than an ancestor hiding everything
below it.

The Volume, its two sources and Button style persist in settings schema 13. A schema 12 or earlier
record's quiet, medium or loud level becomes the volume that plays at the same gain (25, 50, 100),
with both sources on and Raised buttons; a schema 11 record also takes the external-links default on
the way. `audio/soundGates.ts` gates drawing sound on Sound and Drawing, and the clear page turn on
Sound and Deleting, as shipping's `canPlayDrawingSound` and `canPlayDeleteSound` do. Button style is
stored and chosen here; the flat toolbar's rendering is not ported yet.

## Settings › AI Art

`RsdAiSettingsSection` ports shipping's `AiKeyManager.svelte` with `RsdAiValueProp`
(`AiValueProp.svelte`), `RsdAiKeyManager` and `RsdOpenAiKeyHowTo` (`OpenAiKeyHowTo.svelte`). The
Create AI Images switch sits over the three-step explainer while it is off, and over the key manager
and the Customize AI Style and Auto-Save AI Images switches once it is on. On the phone the
drilled-in page claims shipping's stable card height (`aiSettings` in `modalGeometry.ts`).

As in shipping, nothing in this section asks for a grown-up check. The switch (`toggleAi` in
`createDrawingProduct.ts`) is stored beside the Parent Center policies, but it saves with its own
copy, and a failed save keeps its retry in this section (`aiSaveFailed` / `retryAiSave` on the
settings owner); Parent Center's retry covers only its policies. Saving or forgetting a key or
access code goes through the AI owner's `setup` and `removeCredential` while AI is on. The server
verifies a credential before the vault keeps it, and turning AI off, a Parent Center change or
leaving the app drops a change in flight. Generating, reporting, external links and feedback keep
their checks. The one field tells a key from a code by shipping's prefixes (`ai/credentialKind.ts`,
reading `web/src/lib/ai/keyFormat.ts`), and a refusal shows the server's own words. Settings reads
which credential is saved, and the free allowance while AI is on, through the owner's `inspect`; it
waits out a generation in flight, whose vault lease a read would end.

The two feature switches persist in settings schema 15 at shipping's defaults (customization on,
auto-save off); every earlier record migrates to them. The AI sheet does not read them yet.
`tools/tests/native-ai-settings-drift.test.mjs` reads the copy, defaults, geometry and illustrations
back from shipping; `tools/tests/native-ai-settings.test.mjs` drives the owner, the schema, and the
switch and key save that ask for no check while a send still does;
`tools/migration/tests/rsd-native-ai-settings.test.mjs` mounts the section through the released
native renderer.

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

## Color Picker

`RsdColorPicker` ports the shipping `ColorPicker.svelte`: a wordless honeycomb of fixed hexagons in
a card over the frosted scrim, opened by More colors. The colors, both grid arrangements and the
trim geometry are imported from shipping (`hexPickerLayout.ts`, `design/trimGeometry.ts`,
`breakpoints.ts`). `hexPicker.ts` turns them into the layout the shipping media queries produce for
a window: the orientation picks the portrait or landscape grid, the short axis drops shade levels
and the long axis drops families in the shipping order, every second visible row takes the
half-hexagon indent, and a window at least `LARGE_TABLET_MIN_SIDE_PX` on both sides grows every
hexagon by the roomy factor. The few literals no shipping module exports (the trim order, the hover
scale and brightness, the keyline and selected-ring insets, the dim keyline, the selected shade, the
snap slop) are read back out of `ColorPicker.svelte` and `hexSnapGesture.ts` by
`tools/migration/tests/rsd-native-color-picker.test.mjs`.

The card sits in `ModalStage`, the scrim, fly-in and close half of `ModalShell` without its header
and scrolling body. The picker flies in from More colors, flies back as it closes, and closes on the
scrim, Escape, Android Back and the browser Back. Each hexagon is the shipping clip polygon drawn by
react-native-svg, its ring (the white swatch: icon ink; the near-black swatch: the dim keyline; the
last custom paint: its own color shaded) behind an inset fill.

The gesture is shipping's hex snap on React Native's responder. A press on or between hexagons
highlights the nearest center within half a hexagon's height plus the slop, a drag moves the
highlight, and lifting picks what is under the finger, or the swatch still highlighted when the
finger lifts beyond every hexagon. The responder refuses termination, as shipping's pointer capture
keeps the drag. One finger explores: a second contact, a release that does not carry the tracked
finger, or a new viewport (shipping re-measures its centers on resize) cancels the drag without a
pick. A pick selects the paint, remembers it and closes the picker. Mouse hover on the web hit-tests
the hexagon shape, as the shipping `:hover` does; touch shows no hover.

Each hexagon is a button named by its color; `RsdPressable` gives its native host the button role
when a caller names none, since that host renders as a div. Its pointer events are off so every
press reaches the grid, and a keyboard or screen-reader activation presses the button directly. A
pointer's click (`detail` of 1 or more) that does reach a hexagon is dropped, as shipping's
`handleHexClick` drops it.

On the web the picker is its own lazily loaded chunk (`drawingSheets.web.ts`). The legacy
`DrawingScreen` also loads it on first open, so its react-native-web suites need the React Strict
DOM stand-in (`tools/tests/native-rsd-web-stub.mjs`) only when they open the picker. Not ported: the
100 ms hover ease (the hover state switches at once). Native screen-reader activation and iPad
trackpad hover are unverified.

## Clear Button

The shipping Clear Button (`ClearButton.svelte`) docks to the screen, not the paper.
`NativeDrawingLayout` therefore renders a clear overlay that spans the whole safe-area frame, after
the paper column and under the palette bar (the shipping `--z-palette` stacking), clipped to that
frame. The overlay holds the accept ring, the dock and the coachmark. The clear underlay stays in
the paper area and receives the area's offset inside the layout, so the wash grows from the screen's
top-right corner and the departing page flies into the docked tab.

* `experiments/native-architecture/src/clear/clearDock.ts` projects the dock geometry: the tab's
  10px overhang past the right edge, 90px down and 60px tall in portrait, and 48px down (or 20px
  below a taller safe-area top) and 70px tall in landscape, with the 38px or 40px lid.
  `useClearGesture` exposes it as `dock`.
* `RsdClearFace` draws the tab and the coachmark ghost. The face is a half-disc docked, a full disc
  lifted, and turns alarm red with a glow past the accept ring. Each state names its own background,
  because native RSD resolves a token gradient after a literal one.
* The accept ring wash reaches 100% at the corner of the ring's square box, which is what CSS
  `radial-gradient(circle, …)` means.
* `RsdClearCoachmark` and `RsdClearUnderlay` paint nothing until a press on Clear. The web export
  loads each from its own chunk once the screen mounts (`clearSurfaces.web.ts`), keeping them off
  the startup budget; the native apps import them directly (`clearSurfaces.ts`).
* `tools/tests/native-clear-projection.test.mjs` reads every dock size, finish, ring ink and stroke
  width back from the shipping stylesheets. `tools/migration/tests/rsd-native-clear.test.mjs` mounts
  the resolved rest and drag states.
