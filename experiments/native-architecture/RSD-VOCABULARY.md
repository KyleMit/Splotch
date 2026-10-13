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
bar measures its own length and shows as many swatches as fit, trimming by the shipping trim order
(`PALETTE_TRIM_ORDER`, drift-guarded by `tools/tests/native-drawing-tokens.test.mjs`); remembered
custom paints go first, and the selected paint always keeps a swatch. Compact paint radios retain
their full accessible names, checked state, visible selected treatment and actual paint colors.
Paint radios are round, text-free swatches whose selected state is a ring in the paint's color,
matching the shipping Color Swatch. Toolbar actions are icon buttons drawn from the shipping icon
set through `RsdIcon` (react-native-svg `SvgXml` on every platform, fed by the generated
`icons.generated.ts`); each keeps its former text as its accessible name. The Drawing tools sheet in
the drawer keeps the brush and width choices and the less frequent actions. Their touch size imports
the drawing control owner. Status messages have a separate 25% bounded viewport below the paper area
so long messages cannot consume the entire drawing workspace. `NativePaper` fills the paper area
behind the floating edge controls and contain-fits the fixed logical paper into it, centered, the
way the shipping app presents a rotation-locked paper (ADR-0050); the paper keeps its fixed aspect,
so a portrait phone shows it full width with margins above and below. These allocations require
native geometry and visual verification; source flex bounds alone do not establish usable paper
space. The recovery viewport preserves individual actionable children, names itself “PNG recovery”
with the `rsd-png-recovery-viewport` identity, and retains clipped child views. Recovery state and
scrolling stay settled while contacts are drawing. An empty recovery state allocates no viewport. No
new PNG writer, queue capacity, persistence policy or Dismiss owner is introduced.

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

| Group                                     | Web                                     | Android and iOS                                                                                                                   |
| ----------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `colors` / `darkTheme`                    | every themed color, plus `floatShadow`  | the same strings; slash-alpha `rgb(r g b / n%)` is emitted as `rgba(r, g, b, a)`, the only alpha form React Native's parser reads |
| `brandColors`, `fixedColors`              | unthemed colors and `clearGradientRest` | the gradient reaches React Native as `experimental_backgroundImage`                                                               |
| `shadows`, `colors.floatShadow`           | `box-shadow` lists                      | React Native `boxShadow` strings, rgba colors                                                                                     |
| `motion`                                  | durations and `cubic-bezier()` curves   | RSD parses `s`/`ms` and turns `cubic-bezier()` into `Easing.bezier`                                                               |
| `dimensions` spacing, radii, type, layout | `px` lengths                            | the same lengths                                                                                                                  |
| `dimensions.radiusBlobN{Corner}`          | one percentage per corner               | React Native corners take one radius, so each elliptical shipping corner keeps the mean of its two radii                          |
| `dimensions.fontSizeDisplayMin/Max`       | the `clamp()` bounds                    | no `calc()`/`clamp()`: `fontSizeDisplayFluid` carries the viewport term for a caller to evaluate against the window width         |
| `dimensions.modalGutterMin`               | the gutter floor                        | the safe-area term is the caller's, from `react-native-safe-area-context`                                                         |
| `fonts` weights                           | the variable face's 500/600/700         | `fontTheme.native.ts` swaps in one static face per weight; medium takes the regular face, since no 500 face is bundled            |

Shipping tokens with no projection — `color-mix()` strengths, bare RGB channels, the Skia-drawn
paper effects, the iOS input-zoom floor and the mono stack — are listed with their reasons in
`RSD_UNPROJECTED_TOKENS`. `tools/migration/tests/rsd-drawing-tokens.test.mjs` fails when a shipping
token is added or changed without regenerating, or when a projected value stops parsing in React
Native.
