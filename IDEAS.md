# Ideas

A menu of scoped, ready-to-start work items for Splotch. Each entry is written to hand to a coding
session: it says **what** to build, **why** it matters, **where** the code lives, and **how you'll
know it's done**. Grouped by theme. The order within a group is **not** a priority ranking — pick by
value-to-effort for your context and reprioritize freely.

Many of these expand items already sketched in `docs/BACKLOG.md` into implementable specs. When you
pick one up, move the corresponding backlog bullet along (or delete it) so the two don't drift.

Conventions to respect on every item: Svelte 5 runes only, TypeScript everywhere, no comments unless
the WHY is non-obvious, `CAPACITOR=true` is the only web-vs-native build signal, and agent
instruction files are generated from `.ruler/` (edit sources, run `npm run ruler:apply`). Consult
the relevant skill (`architecture`, `api`, `mobile`, `testing`, `profiling`, `adrs`) before
starting.

Items marked **Brief. / Rough implementation.** came from a second, engineering-leaning exploration
pass and carry a lighter spec — investigate and firm them up (and usually create or update an ADR)
before starting significant work.

---

## Toddler-facing features

### Stamps tool

A third tool alongside pen and eraser: tap the canvas to plop a shape (star, heart, dog, dinosaur,
flower) with a satisfying sound and a small scale-bounce animation. This unlocks the youngest users
who can tap long before they can draw a stroke.

* **Where:** add a `stamp` tool mode next to pen/eraser in `DrawingCanvas.svelte` and the engine
  (`web/src/lib/drawing/engine.ts`); record each stamp as a command op in the command log so undo
  works for free (`undoHistory.ts`, ADR-0033 command-replay-undo). Reuse the `Icon.svelte` SVG set
  or add dedicated stamp SVGs under `web/src/lib/icons/`.
* **Tool switching UI:** the pen/eraser control lives in `ActionsPanel.svelte` /
  `ColorPalette.svelte` — add a stamp affordance there.
* **Done when:** tapping places a stamp at the tap point in the current color, it animates in, plays
  a sound (`web/src/lib/audio/drawingSound.ts` pattern), and undo/redo removes/re-adds it. Unit test
  the new command op serialization; add an E2E that switches to stamps and taps.

### Tap-to-fill (paint bucket)

Flood-fill enclosed regions — the "I colored the whole elephant!" payoff when staying inside the
lines is still motorically hard. Works on coloring-book pages and on the child's own drawn shapes.

* **Where:** new fill algorithm in `web/src/lib/drawing/` (scanline flood fill over the canvas
  ImageData, tolerance-based on the target color). Add a `fill` tool mode; record fills as command
  ops for undo. Careful interaction with the two-layer storage model (ADR-0005 dual-layer storage)
  and the coloring-book overlay layer (`overlay.ts`).
* **Perf:** flood fill on a full-DPR canvas is expensive — cap to the logical resolution and profile
  with the `profiling` skill (`npm run perf:web`).
* **Done when:** tapping inside a bounded region fills it; fills are undoable; a large fill stays
  under the frame budget on a mid-tier phone. Unit-test the fill on a small fixture bitmap.

### In-app gallery ("the fridge door")

Let kids revisit saved masterpieces inside the app — big thumbnails, tap for full screen, optional
slideshow. Adds pride-of-ownership and a reason to come back, and pairs with save-on-delete which
already captures art (`web/src/lib/drawing/saveOnDelete.ts`).

* **Where:** new route or overlay; persist thumbnails in IndexedDB (`web/src/lib/idb.ts`,
  `storage.ts`). Reuse `screenshot.ts` for capture and `exportDrawing.ts` for full-res export from a
  gallery entry.
* **Done when:** saved drawings appear as a grid, tap opens full-screen, and a gallery entry can be
  re-exported/shared. Cap stored count with LRU eviction so IndexedDB doesn't grow unbounded. Add an
  ADR if the storage schema is non-trivial.

### Photo → coloring page

Parent snaps a photo (family dog, the kid's bike); the existing Gemini pipeline turns it into line
art that drops into the coloring-book overlay slot. Personalization families will share, and it
sidesteps the coloring-book IP concern on iOS.

* **Where:** extend the AI pipeline (`web/src/lib/server/ai/gemini.ts`, provider adapter
  `provider.ts`, ADR-0047 provider-agnostic-ai-adapter) with a "photo to line art" prompt; wire a
  camera/file input in `ParentCenter.svelte` and drop the result into `ColoringBook.svelte` /
  `overlay.ts`.
* **Safety:** run through the existing safety layer (`geminiSafety.ts`, ADR-0023 redteam) — reject
  photos with people/faces per store kids-compliance rules.
* **Done when:** a parent-supplied photo produces usable line art in the coloring overlay, gated
  behind the Parent Center, and covered by an API smoke test.

### Left-handed layout flip

Parent Center setting that mirrors the landscape layout so the palette column moves to the right
edge (a lefty's drawing arm covers a left-side palette).

* **Where:** add a toggle to `SettingsToggles.svelte` / `SettingsToggles` state; drive layout with a
  CSS custom property or `data-hand` attribute on the root so the palette/actions columns swap
  sides. Persist via the settings store used by the other toggles.
* **Done when:** flipping the setting mirrors landscape layout live (no reload), persists across
  sessions, and portrait is unaffected. Add an E2E asserting palette side.

### Immediate AI retry on failure

When an AI generation fails, let the user retry instantly instead of restarting the flow.

* **Where:** `AiImageResult.svelte` / `AiImagePrompt.svelte` and the client caller in `lib/api.ts`.
  Keep the last request params in state; show a "try again" button on the error state that re-fires
  the same request.
* **Done when:** a simulated failure surfaces a retry affordance that re-submits with identical
  inputs, and the loading UI resumes. Unit-test the retry state machine.

### Resizable color palette tied to button size

Make the color palette scale with a global button-size control so it works on small phones and iPad
Pro alike.

* **Where:** `ColorPalette.svelte`, `ColorPicker.svelte`; introduce a button-size scale token (see
  the global button-size control under Parent Center & settings) consumed via CSS custom property.
  Coordinate with the hex grid container-query layout (`hexPickerLayout.ts`).
* **Done when:** changing the size token rescales palette + swatches without layout breakage in
  portrait and landscape at the compatibility floor (`docs/COMPATIBILITY.md`).

### Drag a color straight onto the canvas

Allow dragging from a color swatch directly onto the canvas to start drawing in that color — a more
discoverable, tactile interaction for toddlers.

* **Where:** pointer handling in `ColorPalette.svelte` + `DrawingCanvas.svelte`; coordinate with
  `scribbleGuard.ts` (ADR-0038) so the drag doesn't get cancelled as a stray stylus/touch stream.
* **Done when:** press-drag from a swatch selects that color and begins a stroke on
  release-over-canvas; taps still behave as today. E2E for the drag path.

### Brush impact ring + rainbow magic-brush ring

Show the area-of-impact ring while drawing with the pen; give the magic brush a rainbow-gradient
ring so its special behavior is legible.

* **Where:** cursor/overlay rendering in `DrawingCanvas.svelte`; magic-brush logic in
  `web/src/lib/drawing/magicBrush.ts` (ADR-0043 magic-brush color-sheet reveal). Ring radius tracks
  brush size.
* **Done when:** pen shows a subtle sizing ring under the pointer; magic brush shows the rainbow
  ring; neither adds measurable jank (profile with `perf:web`).

### Sound effects on delete / clear

Add a satisfying sound when deleting or clearing (drag-to-clear already exists via
`dragToClear.ts`).

* **Where:** hook the clear/delete completion in `ClearButton.svelte` + `dragToClear.ts` into the
  audio module (`web/src/lib/audio/drawingSound.ts` pattern; add a distinct clear sound). Respect
  the existing sound on/off setting.
* **Done when:** completing a clear plays the sound when sounds are enabled and is silent when
  disabled.

### Redo the Last Undo

**Brief.** Let a child reverse an accidental Undo instead of permanently losing the last gesture.
ADR-0033 already calls redo a near-trivial follow-up to the command-replay history.

**Rough implementation.** Retain commands popped by `undoHistory.popCommand()` in a bounded redo
stack, clear that stack when a fresh command commits, and add `redo()` plus `canRedo` to the engine
and `canvasState`. Show a Redo button in `ActionsPanel.svelte` only while it is useful, and exercise
normal strokes, clears, erasers, magic strokes, keyframes, and rotations in the engine harness.

### Recent and Favorite Custom Colors

**Brief.** Turn the custom picker from one remembered hex value into a tiny personal palette for a
child who repeatedly wants “my blue” or “the dinosaur green.”

**Rough implementation.** Persist a deduplicated recent-color ring and a short parent-managed
favorites list in a new color state module. Render the list above the honeycomb in
`ColorPicker.svelte`, and optionally let favorite colors occupy bonus swatch slots when space
allows. Preserve the existing trim priority so core colors never disappear unexpectedly.

### Sensory Color and Music Modes

**Brief.** Extend drawing audio beyond pencil scratch: announce color names for pre-readers, add a
small haptic when a swatch changes, or turn drawing into music where hue selects a note family and
vertical position selects pitch.

**Rough implementation.** Expand the engine's sound callback from speed-only data to a typed sensory
event carrying color and position. Add offline voice clips or Web Audio oscillators beside
`audio/drawingSound.ts`, reuse `haptics.ts`, and expose separate Parent Center toggles. Keep the
current pencil loop as the default and respect reduced-motion/quiet presets.

### Offline "What Should I Draw?" Spinner

**Brief.** Offer lightweight prompts such as “a red balloon,” “a sleepy dinosaur,” or “three wiggly
lines” without calling AI or requiring connectivity.

**Rough implementation.** Ship a small typed prompt deck assembled from existing book thumbnails,
palette labels, and icon assets. Add an optional Actions Panel button that opens a large, visual
prompt card and can speak it through the sensory-audio mode. Keep prompts local, translatable, and
free of scoring so the feature encourages invention rather than evaluating it.

### Mirror and Kaleidoscope Drawing

**Brief.** Add playful symmetry modes that mirror a gesture across one axis, four quadrants, or
radial slices.

**Rough implementation.** Transform each dot/path op into sibling ops in paper coordinates before
both live rendering and history recording. Extending the shared op path means undo, resize,
rotation, export, erasing, and magic brush can inherit the behavior. Add a simple mode state beside
`state/tool.svelte.ts` and start with one vertical mirror before attempting radial geometry.

### Two-Child Duet Canvas

**Brief.** Turn Splotch's unusually strong multi-touch support into a cooperative same-device mode,
with separate colors or tools on the left and right halves.

**Rough implementation.** Add a duet setup surface with two compact palettes. Capture a participant
and style on each pointer-down, which fits the per-pointer state already in `drawing/engine.ts`.
Keep simultaneous fingers as one undo group initially, then test whether separate per-player undo is
worth the added command-boundary complexity.

### Pressure-Sensitive Stylus Strokes

**Brief.** Use Apple Pencil and compatible pen pressure for natural thick-and-thin strokes. The
engine recognizes pen pointers today but uses one fixed width for the whole contact.

**Rough implementation.** Map `PointerEvent.pressure` through a gentle curve around the selected
base width and split path ops when width changes beyond a small threshold. Update simplification so
style boundaries remain intact and add a Parent Center opt-out for predictable thickness. Validate
on real iPad and Android hardware because synthetic browser pressure is not representative.

### Palm Rejection and Stylus-Only Mode

**Brief.** Reduce accidental marks when a child rests a hand on the screen while using a pencil,
without weakening the default multi-finger experience.

**Rough implementation.** Offer an explicit “Pencil only while drawing” setting and, optionally,
ignore unusually broad touch contacts while a pen is active using pointer width/height. Keep the
heuristic disabled by default and instrument it in the `/dev/engine` harness. Avoid blanket touch
suppression, because multi-touch drawing is a deliberate feature.

### Paper Playground

**Brief.** Let children choose warm paper, colored construction paper, chalkboard, graph paper, or a
square postcard instead of coupling paper appearance entirely to light/dark theme.

**Rough implementation.** Create one paper-style descriptor that drives CSS tokens,
`exportDrawing.ts`, texture loading, and optional aspect ratio. Reuse `paperView.ts` for contained
square/portrait/landscape sheets and migrate the current light/dark colors into the descriptor.
Coloring-page compatibility and night fills need explicit validation for every style.

---

## AI art

### Rename default AI mode to "Magical" and retire "Pixel"

Rename the default style to "Magical" and replace the "pixel" style with something more appealing.

* **Where:** style registry `web/src/lib/ai/styles.ts` and any UI referencing style ids
  (`AiDial.svelte`, `AiImagePrompt.svelte`). Update prompt templates in `web/src/lib/ai/prompt.ts`.
* **Done when:** the default reads "Magical", pixel is gone/replaced, style-cover generation
  (`gen:style-covers`) is refreshed, and tests referencing style ids are updated.

### Custom AI style buttons with generated cover art

Each AI style button uses a custom cover image, and the pipeline generates corresponding output for
that style. Foundation for parent-authored prompts (the parent-authored custom AI prompts item
below).

* **Where:** `styles.ts` gains per-style cover assets; `gen:style-covers` script produces them under
  `artifacts/` (ADR-0059). `AiDial.svelte` renders the covers.
* **Done when:** every style shows its own cover, covers are committed run artifacts, and the dial
  reflects them.

### Parent-authored custom AI prompts

Let a parent build a custom prompt in the Parent Center, generate a logo/cover for it from the base
style, and enable it as a selectable style. Save the logo locally.

* **Where:** Parent Center UI (`ParentCenter.svelte`, new tab component); persist custom styles +
  generated logo in IndexedDB (`idb.ts`); merge custom styles into the `styles.ts` registry at
  runtime. Route generation through the existing `/api/generate-image` + safety layer.
* **Done when:** a parent can create, name, preview, and enable a custom style that then appears in
  the child-facing dial; it persists and can be deleted. Guard with the same content-safety checks.

### Bigger AI preview with pinch-to-zoom

The returned AI preview should be much larger and allow pinch-to-zoom.

* **Where:** `AiImageResult.svelte`, preview helpers in `web/src/lib/components/aiPreview.ts` (has
  tests — keep them green). Note the global toddler zoom-lock (ADR-0041) — the zoom must be scoped
  to the preview surface only, not the document.
* **Done when:** the preview fills more of the screen and supports pinch-zoom within its own bounds
  while the rest of the app stays zoom-locked. Extend `aiPreview.test.ts`.

### Richer AI loading experience

Escalating loading feedback: a fun loading sound, a longer default timer, larger pulsations when
overtime, progressively crazier animations the longer it takes, plus sparkles on the AI
customization screen.

* **Where:** the loading/timer UI in `AiDial.svelte` / `AiConfetti.svelte` and the AI timer dev page
  (`web/src/routes/dev/ai-timer/`) which already exists for tuning this. Audio via the sound module.
* **Done when:** loading escalates visually and audibly over time, the default timer is longer, and
  the dev/ai-timer harness demonstrates each stage. Respect the sound setting.

### "Keep overlaid" tiny-improvement mode

Add an AI instruction path for tiny marginal improvements to the current drawing that stays overlaid
on the child's art rather than replacing it.

* **Where:** prompt construction in `web/src/lib/ai/prompt.ts`; result compositing in
  `web/src/lib/drawing/aiImageResponse.ts` / `overlay.ts` so the AI output blends with, not
  replaces, the canvas.
* **Done when:** a "gentle enhance" option returns art overlaid on the existing drawing; original
  strokes remain in the command log. Unit-test the compositing path.

---

## Coloring book

### Favorites book + scrollable, expandable selection

Make the book-selection screen scrollable, add more book selections, and make pages favoritable with
the first book being "Favorites".

* **Where:** `ColoringBook.svelte`, thumbnail/prefetch logic (ADR-0045 coloring-picker thumbnails).
  Persist favorites in IndexedDB (`idb.ts`). Ensure the selection grid scrolls on short viewports.
* **Done when:** the picker scrolls, pages can be toggled as favorites, and a Favorites book
  aggregates them. Add fixtures/tests for the favorites store.

### Delete/clear wipes the coloring page

Delete should wipe the current page; the first book (or a dedicated action) should clear the
coloring background back to blank.

* **Where:** clear flow (`ClearButton.svelte`, `dragToClear.ts`) needs to distinguish "clear my
  strokes" from "remove the coloring overlay" (`overlay.ts`, dual-layer storage ADR-0005).
* **Done when:** clearing removes the child's strokes but keeps the line art by default, with an
  explicit action to also remove the overlay; behavior is covered by tests.

### Coloring-book export / import / save-to-device + user bundles

Let users save colored pages to device and export/import coloring-book bundles; allow uploading
custom bundles (with IP hidden from the iOS store release, per store rules — see `mobile` skill).

* **Where:** bundle format + (de)serialization in `web/src/lib/drawing/` and `storage.ts`; save via
  `folderSave.ts` / `exportDrawing.ts` (platform save targets, ADR-0037). Gate user-uploaded bundles
  behind a build/runtime flag so store builds ship without third-party IP.
* **Done when:** a page saves to the device photo target, a bundle round-trips through
  export/import, and custom-bundle upload is behind a flag off by default in store builds. Document
  in an ADR.

### Surprise Me Coloring Page

**Brief.** Add a single tile that selects a random platform-safe coloring page without making a
toddler choose a book and then a page.

**Rough implementation.** Flatten `booksForPlatform()` into eligible pages, avoid the immediately
previous selection, choose the current paper orientation, and preload the overlay/fill before
closing the picker. `state/books.ts` already centralizes platform eligibility and all required asset
paths, so the randomizer should not infer filenames independently.

### Coloring Page Completion Celebration

**Brief.** Celebrate effort when a meaningful portion of a coloring page has been painted, without
requiring precise inside-the-lines behavior.

**Rough implementation.** At stroke end, compare a low-resolution fillable-area mask with opaque
canvas coverage using a scratch canvas similar to `drawing/emptyScan.ts`. Trigger broad milestones
only once per page and reuse `AiConfetti.svelte` or a page-character animation. Keep the progress
approximate and private; it should be a delight signal, not a score.

### Modular Downloadable Coloring Packs

**Brief.** Coloring assets dominate `web/static` and every current catalog ships inside native.
Future books will keep increasing install, update, and PWA cache size.

**Rough implementation.** Keep a generous starter set bundled for the fully offline promise, then
publish additional packs behind a signed/versioned manifest. Cache packs with Cache Storage on web
and Capacitor Filesystem on native, with parent-controlled download/delete and clear storage
estimates. `state/books.ts` should consume one catalog model for bundled and installed packs.

---

## Dark mode

Dark mode has theme tokens already (ADR-0052 `web/src/lib/theme.ts`); these finish the experience.

### Dark-mode color defaults + dark painter's palette

In dark mode, default the "black" swatch to white, give the painter's palette a dark background, and
consider a dark-mode-specific palette.

* **Where:** `theme.ts`, `ColorPalette.svelte`, `ColorPicker.svelte`, `colorRing.ts`. Swap the
  default drawing color based on the active theme; restyle the palette surface with dark tokens.
* **Done when:** entering dark mode flips the default color to white and darkens the palette
  surface; switching back restores light defaults. Unit-test the default-color selection.

### Fun kid-facing light/dark toggle

A playful theme toggle kids can flip themselves (sun/moon, day/night scene) rather than only
following the system theme.

* **Where:** new toggle component using `theme.ts`; place it where it's reachable but not too easy
  to fumble mid-drawing. Animate the transition.
* **Done when:** the toggle switches themes with a delightful animation, persists the choice, and
  still respects system default on first run. E2E for toggle + persistence.

### Dark-mode-aware AI generation

Regenerate/test AI images in dark mode and make sure the dark canvas layer is passed to AI
generation (so results match the dark background).

* **Where:** the canvas-snapshot that feeds generation (`aiImage.ts`, `screenshot.ts`) must capture
  the themed background; prompt tuning in `prompt.ts`. Re-run `model-eval` fixtures under dark mode.
* **Done when:** generation input includes the dark background, output composites correctly on dark
  canvas, and model-eval covers a dark case.

### Dark-mode coloring variants

Finish generating night-time coloring variants; handle the fact that large black regions don't
translate to white well.

* **Where:** the coloring asset-generation pipeline (`tools/asset-gen/`, `gen:coloring-*` scripts,
  fills/outlines). Add a night-variant generation path and an audit for large-black-region failures.
* **Done when:** night variants generate, the audit flags/handles large black areas, and results
  land as committed artifacts.

---

## Saving, sharing & recovery

### Crash-Safe Drawing Recovery

**Brief.** Preserve the one drawing currently in progress across a browser refresh, WebView
eviction, process kill, crash, or dead battery. This is a single emergency draft, distinct from the
multi-drawing gallery already in the backlog.

**Rough implementation.** After each committed stroke, schedule an idle checkpoint containing a
flattened baseline PNG plus the active coloring page, paper orientation, theme, and minimal tool
state. Store it in IndexedDB on web and Capacitor Filesystem on native, then teach
`drawing/undoHistory.ts` and `DrawingCanvas.svelte` to offer or automatically restore it at boot.
Clear or replace the checkpoint only after an intentional new-page action.

### Masterpiece Time-Lapse

**Brief.** Give parents a replay of how a picture emerged, with an optional short animation export.
The existing replayable op vocabulary is unusually well suited to this.

**Rough implementation.** Record committed commands and relative timestamps in a session timeline
separate from the ten-command undo window, because old undo commands currently fold into a raster
baseline. Replay the timeline through `strokeOps.renderOp()` on an isolated canvas, with speed and
pause controls. Start with an in-app replay; later add WebM or GIF encoding behind the parent-facing
save flow.

### Share a Masterpiece

**Brief.** Add a parent-facing Share action alongside saving, so a finished PNG can go directly to
Messages, AirDrop, email, or another installed app.

**Rough implementation.** Reuse `engine.exportCanvasBlob()` and pass a `File` to
`navigator.share({ files })` where Web Share Level 2 is supported. Use a tree-shaken Capacitor Share
plugin on native and retain `drawing/screenshot.ts`'s gallery, folder, and download paths as
fallbacks. Keep all outbound sharing behind the Parent Center's adult gate and re-check Kids
Category external-action requirements.

---

## UX polish & layout

### iPhone top/bottom layout efficiency + notch band

Fix inefficient layout at the top and bottom on iPhone; the top status bar should carry a notch band
and the iPad landscape bottom row should sit flush.

* **Where:** `NotchBand.svelte` (ADR-0026 safe-area CSS), root layout `+layout.svelte`,
  `safeArea.ts`. Use env(safe-area-inset-\*) to reclaim space and band the notch.
* **Done when:** no wasted dead space around the notch/home indicator on iPhone, iPad landscape
  bottom row is flush, verified against the compatibility device floor. Screenshots in the PR
  (`pr-screenshots` skill).

### Stable Parent Center height

The Parent Center window bounces in height as content changes between tabs — set a min-height so it
stays stable.

* **Where:** `ParentCenter.svelte`, `TabPager.svelte` / `TabPagerTab.svelte`. Measure the tallest
  tab and pin a min-height (or animate height changes smoothly).
* **Done when:** switching tabs no longer jumps the window height; content still scrolls when it
  overflows.

### Warn when screenshot save is blocked

If the browser blocks saving screenshots, update the UI to warn the user and offer a reset.

* **Where:** save path in `screenshot.ts` / `folderSave.ts` (ADR-0037); surface a non-blocking
  warning banner (reuse `InstallBanner.svelte` styling) with a reset action.
* **Done when:** a blocked/failed save shows a clear warning and a way to retry/reset; success is
  silent. Unit-test the failure branch.

### Extra color rows for very tall / extra-tall landscape

Add more colors when there's vertical room in landscape (and extra-tall landscape views).

* **Where:** `ColorPalette.svelte` layout with container queries; expand the visible swatch set when
  height allows, drawing from the 88-color curated set.
* **Done when:** tall landscape shows additional color rows without overflow; short screens are
  unchanged. Verify layout math in `hexPickerLayout` tests if touched.

### Multi-tap color-change reliability bug

Fix that color changes sometimes don't register on tap.

* **Where:** pointer/tap handling in `ColorPalette.svelte` / `ColorPicker.svelte`; likely a
  scribble-guard (ADR-0038) or pointer-capture interaction. Reproduce, then add a regression test.
* **Done when:** rapid taps reliably change color; a regression test guards it. This is a bug — prio
  accordingly.

---

## Parent Center & settings

### Global button-size control

Parent Center control to increase button/icon size (bigger targets for the very young or for large
tablets like iPad Pro).

* **Where:** add a slider/stepper to `SettingsToggles.svelte` (reuse `Slider.svelte`); drive a
  global `--button-scale` custom property consumed by `Icon.svelte`, palette, and action buttons.
  Persist with other settings. Pairs with the resizable color palette and extra-landscape-color-rows
  items.
* **Done when:** the control rescales interactive controls app-wide, persists, and doesn't break
  landscape/portrait layouts at the size extremes.

### "Check for updates" button + version display

Add a "Check for updates" button on the About/Parent-Center tab, using the existing PWA update
machinery.

* **Where:** `AboutTab.svelte`; call into `web/src/lib/pwa/updates.ts` (has tests) to trigger a
  service worker update check (ADR-0022 PWA service worker). Show current version (ADR-0030
  git-derived version).
* **Done when:** the button checks for and applies a waiting update (or reports "up to date"), and
  the current version is visible. Extend `updates.test.ts`.

### Native download links + /about marketing page

Once the native apps ship, add an `/about` marketing page with download links, and link to native
downloads from the Parent Center.

* **Where:** new `web/src/routes/about/+page.svelte` (SSG per ADR-0040 per-route render modes); link
  from `AboutTab.svelte`. Store badges/links behind a flag until the apps are live.
* **Done when:** `/about` renders statically with store links, Parent Center links out to them, and
  the links are flag-gated until release.

### Parent Center Adult Gate

**Brief.** Prevent random toddler taps from changing AI credentials, orientation, save behavior, or
control visibility. Today `ParentHelpButton.svelte` opens every parent setting with one tap.

**Rough implementation.** Add an optional, accessible adult gesture such as a long press followed by
holding two illustrated corners. Keep a keyboard/switch-control alternative and avoid knowledge
questions that exclude some adults. Put the gate in front of `openParentCenter()` and any future
external share/link actions, with the preference stored through `settings.svelte.ts`.

### Gentle Drawing Session Timer

**Brief.** Offer parents a calm 5-, 10-, or 15-minute session boundary instead of an abrupt device
lock. This pairs naturally with the app's wake lock, which can otherwise keep a drawing session
alive indefinitely.

**Rough implementation.** Add a Parent Center duration setting, track foreground time using
`visibilitychange`, and show a subtle final-minute sky or color transition. At the end, save a crash
checkpoint and cover child controls with an “All done for now” scene that only the adult gate can
dismiss. The default remains unlimited.

### One-Tap Control Presets

**Brief.** Make the growing settings list approachable through presets such as “Little Hands,”
“Coloring Time,” “Quiet Time,” and “Everything.”

**Rough implementation.** Define typed preset records over the existing setters in
`state/settings.svelte.ts`. `SettingsToggles.svelte` can apply a preset atomically and show “Custom”
once an individual value diverges. Include control visibility, sound level, button scale, coloring
books, AI, and orientation, but never credentials or saved content.

### Versioned Settings Schema and Safe Import/Export

**Brief.** Settings are many independent storage keys with ad hoc legacy migration. A schema would
make future renames, device moves, bug reports, and resets safer.

**Rough implementation.** Define a versioned, validated settings document and explicit migrations,
while retaining synchronous boot reads if measurements require them. Add parent-facing export,
import, and reset actions that exclude AI keys, access codes, admin sessions, drawings, and folder
handles. Test upgrades from every supported schema version and corrupt/partial documents.

### Privacy-Safe Parent Diagnostics Bundle

**Brief.** Splotch deliberately has no analytics or crash SDK, which is excellent for privacy but
makes remote troubleshooting depend on verbal descriptions.

**Rough implementation.** Add an adult-gated About/Diagnostics view showing app version/build,
platform and WebView version, online state, storage availability, plugin health, asset/catalog
version, and a short ring of local error codes. Provide copy/export after filtering drawings,
prompts, tokens, keys, file paths, and other identifying data. Make collection local and opt-in.

---

## Access, admin & security

### First-Class AI Access Grants

**Brief.** Replace the server's array of arbitrary plaintext access strings with grants that can be
labeled, expired, paused, and understood in the admin console.

**Rough implementation.** Introduce a versioned record with an internal ID, generated secret hash,
label, creation/expiry dates, status, and optional quota. Migrate current strings on read in
`server/tokens.ts`, reveal new secrets once, and key usage by grant ID. Update both web and native
front doors through the shared `AdminConsole.svelte` contract.

### One-Time Invite Redemption

**Brief.** Stop putting the same reusable generation credential in an invite URL forever. The app
scrubs the query string, but anyone retaining the link retains the secret.

**Rough implementation.** Generate a short-lived, single-use nonce in a separate store. A new
redemption endpoint atomically consumes it and returns a per-device grant, which the client stores
securely before removing the URL parameter. Creating access for another device produces another
invite rather than copying a shared long-lived credential.

### Protect Managed Codes Like BYOK Keys

**Brief.** Managed access codes can spend project quota, yet `settings.svelte.ts` currently keeps
them in plaintext localStorage while Gemini keys and admin sessions use secure storage.

**Rough implementation.** Add a managed-code slot to `secureStorage.ts`, migrate and scrub the
legacy localStorage value during hydration, and hold only the hydrated value in live state. URL
capture should await secure persistence before scrubbing the query parameter so a failed write does
not silently discard the invitation.

### Durable Quotas and Spend Budgets

**Brief.** Convert the current per-function-instance burst guard into real hourly/daily protections
for managed model spend and credential guessing.

**Rough implementation.** Put rate limiting behind an adapter, keep the in-memory implementation for
local development, and use an atomic durable backend for production. Separate short per-IP oracle
limits from per-grant generation budgets, show remaining allowance in admin, and optionally
auto-pause a grant at a hard ceiling. Netlify Blobs CAS may be sufficient at low traffic, but this
needs contention tests before committing to it.

### Expiring, Per-Device Admin Sessions

**Brief.** Every admin login currently receives the same deterministic HMAC; the web cookie lasts
about ten years, and rotating the global secret is the only revocation mechanism.

**Rough implementation.** Issue random session credentials, store only hashes server-side, and
record creation, expiry, last-used time, and a device label. Let an admin revoke one session or all
sessions. Preserve the existing cookie transport on web and bearer transport on native while
replacing the shared deterministic value inside `server/admin.ts`.

### Append-Only Admin Audit Trail

**Brief.** Preserve who changed access, when, through which console, and whether the operation
succeeded. Token removal currently deletes usage and leaves only the new current state.

**Rough implementation.** Write privacy-minimized events to a separate append-only store for logins,
grant creation, pause/revocation, quota changes, persistence fallback, and CAS conflicts. Record a
hashed grant/session ID, timestamp, deploy environment, action, and result. Add a compact
history/export view to the shared admin component.

### Minimize and Expire Usage Records

**Brief.** Usage blobs are keyed by the raw access code and retain `lastPrompt`. The prompt is
server-defined today, but future custom prompts would make that field more sensitive.

**Rough implementation.** Key usage by an HMAC-derived grant ID, store style and outcome categories
instead of complete prompt text, and define a retention window. After revocation, keep only an
aggregate tombstone if operationally useful. Update the privacy page and tests with the exact
retention and deletion behavior.

### Isolate Deploy Preview Data from Production

**Brief.** Deploy previews currently share site-wide Netlify Blobs with production, so preview admin
actions and smoke tests can modify real access data.

**Rough implementation.** Namespace token, usage, audit, and invite stores by deployment
environment, or bind previews to one explicit staging namespace. Seed only test grants there, show
an environment badge in admin, and reject preview origins that attempt to open the production
namespace. Update the Blobs smoke workflow to assert isolation as well as persistence.

### Privacy-Safe Operations Dashboard

**Brief.** Bring build version, storage health, request latency, refusal/error rates, and provider
status into one operator view without adding child analytics.

**Rough implementation.** Attach a request ID and structured fields to API logs, recording route,
build, latency, status category, and provider outcome—but never drawings, prompts, keys, or raw
tokens. Add an admin-only diagnostics snapshot backed by small aggregates and configuration
booleans. Keep product usage analytics explicitly out of scope.

### Content Security and Capability-Limiting Headers

**Brief.** Deployment currently sends frame, MIME-sniffing, and referrer protections but no Content
Security Policy or Permissions Policy.

**Rough implementation.** Start with report-only CSP, accounting for SvelteKit inline boot code,
blob image previews, fonts, and the hosted API. Move to nonces/hashes once reports are clean. Add a
restrictive Permissions Policy for unused camera, microphone, geolocation, and payment features;
consider HSTS only after confirming every relevant hostname is permanently HTTPS.

---

## AI safety & model operations

### Scheduled AI Safety Drift Canary

**Brief.** Provider behavior can change without a code deploy, while the encrypted red-team suite is
currently manual. A small recurring canary could reveal a safety regression earlier.

**Rough implementation.** Select a tiny budget-capped safe/block subset, run it weekly or through a
manually approved scheduled workflow against staging, compare expected allow/refuse categories, and
publish a private summary artifact. Keep the full sensitive corpus manual and require explicit
secret/cost approval before enabling the schedule.

### Deliberate AI Model Canary and Failover

**Brief.** The provider seam reduces migration effort, but one hard-coded active model still makes
an outage or retirement urgent.

**Rough implementation.** Extend `server/ai/provider.ts` with configuration-selected adapters or
model revisions and route a small, stable canary percentage to a candidate. Compare latency,
refusal, error, and reviewed quality. Fail over only on genuine upstream errors—not safety
refusals—and define how BYOK behaves if a fallback cannot accept a Gemini key. Record the final
policy in an ADR.

---

## Performance

Use the `profiling` skill and the `perf:*` harness (ADR-0032) for anything here; capture
before/after.

### Flood-fill / large-op frame budget audit

If the tap-to-fill or brush-ring items land, run a focused profiling pass to keep drawing under the
frame budget on a mid-tier phone.

* **Where:** `npm run perf:web`, `perf:sweep`, `perf:analyze`; engine hot paths in `engine.ts`,
  `strokeOps.ts`, `strokeMath.ts`. Compare against the desynchronized-canvas low-latency path
  (ADR-0051).
* **Done when:** a profiling report shows the new op within budget, committed under `artifacts/`
  (ADR-0059), with a summary in the PR.

### Mount / cold-start budget check

Verify idle-mount of hidden overlays (ADR-0049) and boot cost haven't regressed as features are
added.

* **Where:** `perf:mount`, `bootHiddenOverlays.ts`; the Lighthouse audit skill for page-load
  (`lighthouse-audit`, first vs repeat visit).
* **Done when:** mount/boot numbers are captured and compared to a baseline; any regression from
  recent features is called out or fixed.

---

## Testing & CI

### Test the PWA as an Offline Product

**Brief.** The E2E suite builds the service worker but does not prove offline navigation, critical
asset caching, or the drawing-preserving update lifecycle.

**Rough implementation.** Build a production-only Playwright harness that waits for service-worker
control, reloads offline, opens core drawing/coloring features, then stages a second build. Verify
the update waits while ink exists and activates on a blank canvas. A purpose-built two-build harness
will likely be more reliable than ordinary test-server reuse.

### Build the Native Static Target on Every Pull Request

**Brief.** Normal CI exercises only the Netlify adapter; native smoke runs after a release tag. A
change can break `CAPACITOR=true`, prerendering, or asset stripping much earlier.

**Rough implementation.** Add the relatively cheap `npm run build:cap` to pull-request CI and assert
that `200.html` exists, mobile coloring assets exist, web-only/server/dev routes are absent, and no
secret/env file was emitted. Keep emulator and simulator jobs tag-only unless their cost becomes
justified.

### Cross-Browser E2E Matrix

**Brief.** The compatibility floor includes Firefox and Safari/iOS, but the regular Playwright suite
runs Chromium only. Several existing workarounds are specifically for WebKit.

**Rough implementation.** Define a smaller engine/UI contract suite that runs under Chromium,
Firefox, and WebKit on every PR, while keeping expensive or Chromium-specific specs in their current
project. Cover drawing, modal gestures, palette selection, theme, export, and PWA-adjacent
navigation. Preserve real-device tests for Apple Pencil and WebView-only behavior.

### Visual Regression Matrix

**Brief.** Many layout risks live at combinations of phone/tablet, portrait/landscape, light/dark,
safe-area insets, open drawers, and modal states that behavioral assertions do not catch.

**Rough implementation.** Add deterministic screenshot fixtures for the main canvas, Actions Panel,
color picker, coloring books, Parent Center tabs, AI states, and admin. Mask genuinely dynamic
regions and review baselines through the existing artifact publishing workflow. Start with high-risk
small viewports rather than snapshotting every pixel permutation.

### Bundle and Performance Budgets in CI

**Brief.** Splotch has strong profiling tools but no automatic guard against entry-chunk growth, new
long tasks, or a large native package.

**Rough implementation.** Record reviewed budgets for initial JS/CSS/font bytes, largest lazy chunk,
PWA precache size, native archive size, and a small set of stable `perf:mount`/engine metrics. Run
cheap size checks on PRs and scheduled performance captures for noisier timing data. Report trends
before making timing thresholds blocking.

---

## Native / mobile

Read the `mobile` skill first for the toolchain and store/kids-compliance checklists.

### Fastlane store-deploy automation

Set up Fastlane to automate Android + iOS store deployments.

* **Where:** `android/`, `ios/`, and root `scripts/`; keep cross-platform (ADR-0017) and don't leak
  secrets into the repo. Coordinate with the `release`/`build` skills and ADR-0012/0020 toolchains.
* **Done when:** a documented Fastlane lane builds and uploads a signed artifact per platform
  (dry-run in CI without publishing), with secrets sourced from env. Add/adjust an ADR for the
  release pipeline.

### More store screenshots + fun store shots

Generate a fresh, richer set of store screenshots (the `gen:shots` script exists).

* **Where:** `gen:shots` / `gen:style-covers`; commit outputs under `artifacts/` (ADR-0059). Cover
  both orientations and key features (magic brush, coloring book, AI art).
* **Done when:** an updated screenshot set is generated and committed, ready for store listings.

### Explicit Native Staging API Builds

**Brief.** Native development builds call `https://splotch.art` because `__NATIVE_API_BASE__` is
hard-coded, so testing AI or native admin can touch production.

**Rough implementation.** Accept a validated build-time API base with production as the release
default, add clearly named staging build/sync scripts, and render an unmistakable staging marker in
debug admin surfaces. A release verification step should fail if a shipping bundle points anywhere
except production. Keep the selection compile-time in line with ADR-0010.

### Versioned API Capabilities for Old Native Apps

**Brief.** Installed native releases can outlive several hosted API revisions, but requests carry no
client contract version and the server exposes no capability negotiation.

**Rough implementation.** Add a small client wrapper around `apiUrl()` that sends app version,
platform, and API version headers. Publish a capability/compatibility response and define a support
window before changing response shapes. An unsupported client can hide AI or show a parent-facing
update message instead of falling into a generic error.

### Scheduled Native Support-Floor Matrix

**Brief.** Splotch promises Android API 24 and iOS 16.4, while CI tests Android API 33 and the
newest installed iPhone runtime.

**Rough implementation.** Add a weekly/manual matrix covering oldest-supported and current runtimes,
phone and tablet viewports, and both orientations. Reuse the existing Maestro flow and keep the
matrix out of ordinary PRs. Make failure reports identify OS, device, WebView/runtime, and
orientation so compatibility drift is actionable.

### Native Capability Journey Tests

**Brief.** A native app can boot while offline behavior or a registered plugin is broken; current
Maestro coverage mostly proves first paint and the static admin route.

**Rough implementation.** Add a development-only diagnostics route and Maestro journeys that toggle
offline state, draw and undo with a bundled page, verify the AI control disappears, and call
DeviceLock, PencilEraser subscription, Preferences, secure storage, orientation, haptics, and media
registration. Assert native implementations respond rather than silently taking web fallbacks.

---

## Release & deployment

### Full Hosted Deploy Contract Check

**Brief.** The deployment workflow proves Blobs persistence but not static routes, CORS, cache and
security headers, version freshness, or the broader API auth contract.

**Rough implementation.** Add a remote mode to `scripts/api-smoke.mjs` and check `/`, `/privacy`,
`version.json`, both Capacitor-origin preflights, unauthenticated response shapes, headers, and an
admin persistence round-trip without making a paid model call. Run it after preview and production
deploys and on a modest production schedule.

### Pre-Tag Release Candidate Gate

**Brief.** `scripts/release.mjs` commits, tags, and pushes before the tag-triggered native smoke
workflows run, so a bad native release is discovered after the release already exists.

**Rough implementation.** Add `release:verify` to run quality checks, all local tests, web and
native builds, asset gates, version parity, and native smoke where the host supports it. Require a
fresh successful verification receipt before the release script may tag, while retaining an explicit
reviewed escape hatch for unavailable native toolchains.

### Verify Final Release Artifact Freshness and Contents

**Brief.** The release script can attach any existing AAB without proving it matches the new
version, and source-tree checks do not inspect the APK/AAB/IPA that users receive.

**Rough implementation.** Have each release build emit a manifest containing version name/code,
commit SHA, build time, and SHA-256. Refuse stale attachments. Inspect final archives for required
pages/assets, forbidden server routes, source maps, env files, permissions, and size budgets, then
upload a readable package inventory as a CI artifact.

### Exercise Native Release Configurations

**Brief.** Current native smoke workflows use debug builds, missing Android R8/resource-shrinking
failures and iOS Release-only compiler/config differences.

**Rough implementation.** Build an unsigned or test-signed Android release artifact and run it
through `bundletool` or an installable release APK. Compile an iOS Release simulator app without
store signing. Keep real signing material local, but ensure production optimization and resource
rules compile before a tag is considered healthy.

---

## Infrastructure & dev tooling

### Include GHA versions in the update-dependencies flow

Extend the dependency-update workflow/skill to also bump GitHub Actions versions, not just npm deps.

* **Where:** the update-dependencies skill/script and `.github/workflows/`. Parse `uses:` pins and
  surface newer tags.
* **Done when:** running the update flow reports/updates outdated Action pins alongside npm
  packages.

### Document icon source + move toward hand-drawn icons

Document Google Material Symbols (Rounded) as the icon source, then begin replacing with hand-drawn
icons for a warmer, kid-friendly feel.

* **Where:** icon set under `web/src/lib/icons/`, `Icon.svelte`, `icon-names.d.ts`, `gen:icons`. Add
  a short doc (or ADR) recording the source and the hand-drawn direction.
* **Done when:** the icon source is documented and at least one icon is replaced with a hand-drawn
  version through the existing icon pipeline, types regenerated.

### Clear the audit backlog

Work through outstanding findings in `docs/AUDIT.md` (performance, readability, maintainability,
architecture) using the `fix-audits` skill — one commit per item — and vet them first with
`vet-audits`.

* **Where:** `docs/AUDIT.md`, `docs/AUDIT-LOG.md`, `.claude/audit-conventions.md`.
* **Done when:** vetted findings are fixed with per-item commits and the audit log is updated. If
  `AUDIT.md` is empty, run `code-audit` / `extract-audit` first to populate it.

### Localization and RTL Readiness

**Brief.** UI labels, setup instructions, privacy copy, book names, release notes, and store copy
are English-only and mostly embedded directly in components.

**Rough implementation.** Introduce a typed message catalog with a small first translation, move
book/prompt display names to message keys, and read the platform/browser locale with a Parent Center
override. Add pseudo-localization and RTL screenshot tests early so fixed widths, tab paging,
gestures, and palette orientation do not harden around English assumptions.

### Machine-Checkable Privacy and Permission Inventory

**Brief.** Store privacy claims, Android permissions, iOS usage strings, plugin dependencies, and
outbound hosts currently live in separate files that can drift—especially risky for a kids app.

**Rough implementation.** Create one reviewed inventory of permissions, data categories, purposes,
retention, SDKs, and hosts. Generate or verify store declarations, Android manifest entries, iOS
usage descriptions/privacy manifests, and privacy-page facts from it. Fail CI when a dependency or
native change adds an undeclared capability.

### Toolchain Manifest and `npm run doctor`

**Brief.** Node, JDK, Android, Xcode, Maestro, Netlify, and signing requirements are scattered, and
the repository does not pin a Node version in `package.json` or a standard version file.

**Rough implementation.** Add `engines`, a checked-in Node version file, and a cross-platform Node
doctor that reports Node/npm, JDK/JAVA_HOME, Android SDK/build tools, Xcode/runtime, Maestro,
Netlify CLI, signing-file presence, and version-floor consistency without printing secrets. Link all
setup docs to the doctor rather than duplicating detection logic.

### Asset Provenance and Derived-Asset Freshness

**Brief.** Accepted AI art lacks a durable receipt tying it to model, prompt revision, inputs,
attempts, gates, and cost; deterministic manifests also do not prove every thumbnail/punch was
rebuilt from current sources.

**Rough implementation.** Have `tools/asset-gen` generators write resumable run ledgers with input
hashes, model/config, gate scores, request count, and accepted candidate. Add request/cost ceilings.
For deterministic punches and thumbnails, regenerate into a temporary directory in `--check` mode
and byte-compare outputs, or store explicit source-hash-to-derived-hash relationships in the asset
manifest.

---

## Notes for whoever picks these up

* Prefer the smallest ADR-worthy decision: if an item changes architecture, testing, infra, or build
  tooling, run `/create-adr` (see the `adrs` skill).
* Every UI-visible change needs screenshots in the PR (`pr-screenshots` skill) and, where it makes
  sense, an E2E or unit test — this repo runs a three-tier strategy (ADR-0008).
* Keep the two build targets in mind: server routes (`/api/*`, `/admin`) don't exist in the native
  static export; branch on `CAPACITOR=true` at build time, never at runtime.
