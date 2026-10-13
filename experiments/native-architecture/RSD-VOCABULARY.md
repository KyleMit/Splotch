# RSD drawing vocabulary and native adapters

The canonical `src/index.ts` registers `ProbeApp`, which mounts `RsdDrawingScreen`. Shared chrome,
recovery cards, labels, selection groups and actions use React Strict DOM 0.0.54. The behavior,
ordered ink, history, save and export owners remain the drawing candidate owners. This alternative
is unselected and incomplete.

Explicit native boundaries are `NativeFrame` (safe area and window background), `NativePaper`
(drawing surface and measured paper geometry), `NativeDialog` (native modal and bounded action
scroll viewport), `NativeScrollAreas` (bounded drawing-controls and status viewports) and
`RsdRecoveryNotice` (the PNG recovery scroll viewport). Its cards and exact filename actions remain
RSD children; the viewport itself is a React Native `ScrollView`.

The released RSD native renderer implements `html.div` using a native view. Accepting the `overflow`
style does not create a `ScrollView`. The recovery adapter therefore uses the existing drawing
layout owner's 25% feedback height bound and spacing. The native controls viewport reuses the
drawing layout owner's 45% portrait height bound and finite landscape rail. Compact paint radios
retain their full accessible names, checked state, visible selected treatment and actual paint
colors. Their touch size imports the drawing control owner. Status messages have a separate 25%
bounded viewport so long messages cannot consume the entire drawing workspace. `NativePaper`
occupies the flex remainder outside the controls and status scroll containers. These allocations
require native geometry and visual verification; source flex bounds alone do not establish usable
paper space. The recovery viewport preserves individual actionable children, names itself “PNG
recovery” with the `rsd-png-recovery-viewport` identity, and retains clipped child views. Recovery
state and scrolling stay settled while contacts are drawing. An empty recovery state allocates no
viewport. No new PNG writer, queue capacity, persistence policy or Dismiss owner is introduced.

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
