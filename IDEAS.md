# Ideas

A menu of scoped, ready-to-start work items for Splotch. Each entry is written to hand to a coding
session: it says **what** to build, **why** it matters, **where** the code lives, and **how you'll
know it's done**. Grouped by theme; ordered roughly by value-to-effort within each group.

Many of these expand items already sketched in `docs/BACKLOG.md` into implementable specs. When you
pick one up, move the corresponding backlog bullet along (or delete it) so the two don't drift.

Conventions to respect on every item: Svelte 5 runes only, TypeScript everywhere, no comments unless
the WHY is non-obvious, `CAPACITOR=true` is the only web-vs-native build signal, and agent
instruction files are generated from `.ruler/` (edit sources, run `npm run ruler:apply`). Consult
the relevant skill (`architecture`, `api`, `mobile`, `testing`, `profiling`, `adrs`) before
starting.

---

## Toddler-facing features

### 1. Stamps tool

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

### 2. Tap-to-fill (paint bucket)

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

### 3. In-app gallery ("the fridge door")

Let kids revisit saved masterpieces inside the app — big thumbnails, tap for full screen, optional
slideshow. Adds pride-of-ownership and a reason to come back, and pairs with save-on-delete which
already captures art (`web/src/lib/drawing/saveOnDelete.ts`).

* **Where:** new route or overlay; persist thumbnails in IndexedDB (`web/src/lib/idb.ts`,
  `storage.ts`). Reuse `screenshot.ts` for capture and `exportDrawing.ts` for full-res export from a
  gallery entry.
* **Done when:** saved drawings appear as a grid, tap opens full-screen, and a gallery entry can be
  re-exported/shared. Cap stored count with LRU eviction so IndexedDB doesn't grow unbounded. Add an
  ADR if the storage schema is non-trivial.

### 4. Photo → coloring page

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

### 5. Left-handed layout flip

Parent Center setting that mirrors the landscape layout so the palette column moves to the right
edge (a lefty's drawing arm covers a left-side palette).

* **Where:** add a toggle to `SettingsToggles.svelte` / `SettingsToggles` state; drive layout with a
  CSS custom property or `data-hand` attribute on the root so the palette/actions columns swap
  sides. Persist via the settings store used by the other toggles.
* **Done when:** flipping the setting mirrors landscape layout live (no reload), persists across
  sessions, and portrait is unaffected. Add an E2E asserting palette side.

### 6. Immediate AI retry on failure

When an AI generation fails, let the user retry instantly instead of restarting the flow.

* **Where:** `AiImageResult.svelte` / `AiImagePrompt.svelte` and the client caller in `lib/api.ts`.
  Keep the last request params in state; show a "try again" button on the error state that re-fires
  the same request.
* **Done when:** a simulated failure surfaces a retry affordance that re-submits with identical
  inputs, and the loading UI resumes. Unit-test the retry state machine.

### 7. Resizable color palette tied to button size

Make the color palette scale with a global button-size control so it works on small phones and iPad
Pro alike.

* **Where:** `ColorPalette.svelte`, `ColorPicker.svelte`; introduce a button-size scale token (see
  Parent Center control, item 20) consumed via CSS custom property. Coordinate with the hex grid
  container-query layout (`hexPickerLayout.ts`).
* **Done when:** changing the size token rescales palette + swatches without layout breakage in
  portrait and landscape at the compatibility floor (`docs/COMPATIBILITY.md`).

### 8. Drag a color straight onto the canvas

Allow dragging from a color swatch directly onto the canvas to start drawing in that color — a more
discoverable, tactile interaction for toddlers.

* **Where:** pointer handling in `ColorPalette.svelte` + `DrawingCanvas.svelte`; coordinate with
  `scribbleGuard.ts` (ADR-0038) so the drag doesn't get cancelled as a stray stylus/touch stream.
* **Done when:** press-drag from a swatch selects that color and begins a stroke on
  release-over-canvas; taps still behave as today. E2E for the drag path.

### 9. Brush impact ring + rainbow magic-brush ring

Show the area-of-impact ring while drawing with the pen; give the magic brush a rainbow-gradient
ring so its special behavior is legible.

* **Where:** cursor/overlay rendering in `DrawingCanvas.svelte`; magic-brush logic in
  `web/src/lib/drawing/magicBrush.ts` (ADR-0043 magic-brush color-sheet reveal). Ring radius tracks
  brush size.
* **Done when:** pen shows a subtle sizing ring under the pointer; magic brush shows the rainbow
  ring; neither adds measurable jank (profile with `perf:web`).

### 10. Sound effects on delete / clear

Add a satisfying sound when deleting or clearing (drag-to-clear already exists via
`dragToClear.ts`).

* **Where:** hook the clear/delete completion in `ClearButton.svelte` + `dragToClear.ts` into the
  audio module (`web/src/lib/audio/drawingSound.ts` pattern; add a distinct clear sound). Respect
  the existing sound on/off setting.
* **Done when:** completing a clear plays the sound when sounds are enabled and is silent when
  disabled.

---

## AI art

### 11. Rename default AI mode to "Magical" and retire "Pixel"

Rename the default style to "Magical" and replace the "pixel" style with something more appealing.

* **Where:** style registry `web/src/lib/ai/styles.ts` and any UI referencing style ids
  (`AiDial.svelte`, `AiImagePrompt.svelte`). Update prompt templates in `web/src/lib/ai/prompt.ts`.
* **Done when:** the default reads "Magical", pixel is gone/replaced, style-cover generation
  (`gen:style-covers`) is refreshed, and tests referencing style ids are updated.

### 12. Custom AI style buttons with generated cover art

Each AI style button uses a custom cover image, and the pipeline generates corresponding output for
that style. Foundation for parent-authored prompts (item 13).

* **Where:** `styles.ts` gains per-style cover assets; `gen:style-covers` script produces them under
  `artifacts/` (ADR-0059). `AiDial.svelte` renders the covers.
* **Done when:** every style shows its own cover, covers are committed run artifacts, and the dial
  reflects them.

### 13. Parent-authored custom AI prompts

Let a parent build a custom prompt in the Parent Center, generate a logo/cover for it from the base
style, and enable it as a selectable style. Save the logo locally.

* **Where:** Parent Center UI (`ParentCenter.svelte`, new tab component); persist custom styles +
  generated logo in IndexedDB (`idb.ts`); merge custom styles into the `styles.ts` registry at
  runtime. Route generation through the existing `/api/generate-image` + safety layer.
* **Done when:** a parent can create, name, preview, and enable a custom style that then appears in
  the child-facing dial; it persists and can be deleted. Guard with the same content-safety checks.

### 14. Bigger AI preview with pinch-to-zoom

The returned AI preview should be much larger and allow pinch-to-zoom.

* **Where:** `AiImageResult.svelte`, preview helpers in `web/src/lib/components/aiPreview.ts` (has
  tests — keep them green). Note the global toddler zoom-lock (ADR-0041) — the zoom must be scoped
  to the preview surface only, not the document.
* **Done when:** the preview fills more of the screen and supports pinch-zoom within its own bounds
  while the rest of the app stays zoom-locked. Extend `aiPreview.test.ts`.

### 15. Richer AI loading experience

Escalating loading feedback: a fun loading sound, a longer default timer, larger pulsations when
overtime, progressively crazier animations the longer it takes, plus sparkles on the AI
customization screen.

* **Where:** the loading/timer UI in `AiDial.svelte` / `AiConfetti.svelte` and the AI timer dev page
  (`web/src/routes/dev/ai-timer/`) which already exists for tuning this. Audio via the sound module.
* **Done when:** loading escalates visually and audibly over time, the default timer is longer, and
  the dev/ai-timer harness demonstrates each stage. Respect the sound setting.

### 16. "Keep overlaid" tiny-improvement mode

Add an AI instruction path for tiny marginal improvements to the current drawing that stays overlaid
on the child's art rather than replacing it.

* **Where:** prompt construction in `web/src/lib/ai/prompt.ts`; result compositing in
  `web/src/lib/drawing/aiImageResponse.ts` / `overlay.ts` so the AI output blends with, not
  replaces, the canvas.
* **Done when:** a "gentle enhance" option returns art overlaid on the existing drawing; original
  strokes remain in the command log. Unit-test the compositing path.

---

## Coloring book

### 17. Favorites book + scrollable, expandable selection

Make the book-selection screen scrollable, add more book selections, and make pages favoritable with
the first book being "Favorites".

* **Where:** `ColoringBook.svelte`, thumbnail/prefetch logic (ADR-0045 coloring-picker thumbnails).
  Persist favorites in IndexedDB (`idb.ts`). Ensure the selection grid scrolls on short viewports.
* **Done when:** the picker scrolls, pages can be toggled as favorites, and a Favorites book
  aggregates them. Add fixtures/tests for the favorites store.

### 18. Delete/clear wipes the coloring page

Delete should wipe the current page; the first book (or a dedicated action) should clear the
coloring background back to blank.

* **Where:** clear flow (`ClearButton.svelte`, `dragToClear.ts`) needs to distinguish "clear my
  strokes" from "remove the coloring overlay" (`overlay.ts`, dual-layer storage ADR-0005).
* **Done when:** clearing removes the child's strokes but keeps the line art by default, with an
  explicit action to also remove the overlay; behavior is covered by tests.

### 19. Coloring-book export / import / save-to-device + user bundles

Let users save colored pages to device and export/import coloring-book bundles; allow uploading
custom bundles (with IP hidden from the iOS store release, per store rules — see `mobile` skill).

* **Where:** bundle format + (de)serialization in `web/src/lib/drawing/` and `storage.ts`; save via
  `folderSave.ts` / `exportDrawing.ts` (platform save targets, ADR-0037). Gate user-uploaded bundles
  behind a build/runtime flag so store builds ship without third-party IP.
* **Done when:** a page saves to the device photo target, a bundle round-trips through
  export/import, and custom-bundle upload is behind a flag off by default in store builds. Document
  in an ADR.

---

## Dark mode

Dark mode has theme tokens already (ADR-0052 `web/src/lib/theme.ts`); these finish the experience.

### 20. Dark-mode color defaults + dark painter's palette

In dark mode, default the "black" swatch to white, give the painter's palette a dark background, and
consider a dark-mode-specific palette.

* **Where:** `theme.ts`, `ColorPalette.svelte`, `ColorPicker.svelte`, `colorRing.ts`. Swap the
  default drawing color based on the active theme; restyle the palette surface with dark tokens.
* **Done when:** entering dark mode flips the default color to white and darkens the palette
  surface; switching back restores light defaults. Unit-test the default-color selection.

### 21. Fun kid-facing light/dark toggle

A playful theme toggle kids can flip themselves (sun/moon, day/night scene) rather than only
following the system theme.

* **Where:** new toggle component using `theme.ts`; place it where it's reachable but not too easy
  to fumble mid-drawing. Animate the transition.
* **Done when:** the toggle switches themes with a delightful animation, persists the choice, and
  still respects system default on first run. E2E for toggle + persistence.

### 22. Dark-mode-aware AI generation

Regenerate/test AI images in dark mode and make sure the dark canvas layer is passed to AI
generation (so results match the dark background).

* **Where:** the canvas-snapshot that feeds generation (`aiImage.ts`, `screenshot.ts`) must capture
  the themed background; prompt tuning in `prompt.ts`. Re-run `model-eval` fixtures under dark mode.
* **Done when:** generation input includes the dark background, output composites correctly on dark
  canvas, and model-eval covers a dark case.

### 23. Dark-mode coloring variants

Finish generating night-time coloring variants; handle the fact that large black regions don't
translate to white well.

* **Where:** the coloring asset-generation pipeline (`tools/asset-gen/`, `gen:coloring-*` scripts,
  fills/outlines). Add a night-variant generation path and an audit for large-black-region failures.
* **Done when:** night variants generate, the audit flags/handles large black areas, and results
  land as committed artifacts.

---

## UX polish & layout

### 24. iPhone top/bottom layout efficiency + notch band

Fix inefficient layout at the top and bottom on iPhone; the top status bar should carry a notch band
and the iPad landscape bottom row should sit flush.

* **Where:** `NotchBand.svelte` (ADR-0026 safe-area CSS), root layout `+layout.svelte`,
  `safeArea.ts`. Use env(safe-area-inset-\*) to reclaim space and band the notch.
* **Done when:** no wasted dead space around the notch/home indicator on iPhone, iPad landscape
  bottom row is flush, verified against the compatibility device floor. Screenshots in the PR
  (`pr-screenshots` skill).

### 25. Stable Parent Center height

The Parent Center window bounces in height as content changes between tabs — set a min-height so it
stays stable.

* **Where:** `ParentCenter.svelte`, `TabPager.svelte` / `TabPagerTab.svelte`. Measure the tallest
  tab and pin a min-height (or animate height changes smoothly).
* **Done when:** switching tabs no longer jumps the window height; content still scrolls when it
  overflows.

### 26. Warn when screenshot save is blocked

If the browser blocks saving screenshots, update the UI to warn the user and offer a reset.

* **Where:** save path in `screenshot.ts` / `folderSave.ts` (ADR-0037); surface a non-blocking
  warning banner (reuse `InstallBanner.svelte` styling) with a reset action.
* **Done when:** a blocked/failed save shows a clear warning and a way to retry/reset; success is
  silent. Unit-test the failure branch.

### 27. Extra color rows for very tall / extra-tall landscape

Add more colors when there's vertical room in landscape (and extra-tall landscape views).

* **Where:** `ColorPalette.svelte` layout with container queries; expand the visible swatch set when
  height allows, drawing from the 88-color curated set.
* **Done when:** tall landscape shows additional color rows without overflow; short screens are
  unchanged. Verify layout math in `hexPickerLayout` tests if touched.

### 28. Multi-tap color-change reliability bug

Fix that color changes sometimes don't register on tap.

* **Where:** pointer/tap handling in `ColorPalette.svelte` / `ColorPicker.svelte`; likely a
  scribble-guard (ADR-0038) or pointer-capture interaction. Reproduce, then add a regression test.
* **Done when:** rapid taps reliably change color; a regression test guards it. This is a bug — prio
  accordingly.

---

## Parent Center & settings

### 29. Global button-size control

Parent Center control to increase button/icon size (bigger targets for the very young or for large
tablets like iPad Pro).

* **Where:** add a slider/stepper to `SettingsToggles.svelte` (reuse `Slider.svelte`); drive a
  global `--button-scale` custom property consumed by `Icon.svelte`, palette, and action buttons.
  Persist with other settings. Pairs with items 7 and 27.
* **Done when:** the control rescales interactive controls app-wide, persists, and doesn't break
  landscape/portrait layouts at the size extremes.

### 30. "Check for updates" button + version display

Add a "Check for updates" button on the About/Parent-Center tab, using the existing PWA update
machinery.

* **Where:** `AboutTab.svelte`; call into `web/src/lib/pwa/updates.ts` (has tests) to trigger a
  service worker update check (ADR-0022 PWA service worker). Show current version (ADR-0030
  git-derived version).
* **Done when:** the button checks for and applies a waiting update (or reports "up to date"), and
  the current version is visible. Extend `updates.test.ts`.

### 31. Native download links + /about marketing page

Once the native apps ship, add an `/about` marketing page with download links, and link to native
downloads from the Parent Center.

* **Where:** new `web/src/routes/about/+page.svelte` (SSG per ADR-0040 per-route render modes); link
  from `AboutTab.svelte`. Store badges/links behind a flag until the apps are live.
* **Done when:** `/about` renders statically with store links, Parent Center links out to them, and
  the links are flag-gated until release.

---

## Performance

Use the `profiling` skill and the `perf:*` harness (ADR-0032) for anything here; capture
before/after.

### 32. Flood-fill / large-op frame budget audit

If items 2 (fill) or 9 (rings) land, run a focused profiling pass to keep drawing under the frame
budget on a mid-tier phone.

* **Where:** `npm run perf:web`, `perf:sweep`, `perf:analyze`; engine hot paths in `engine.ts`,
  `strokeOps.ts`, `strokeMath.ts`. Compare against the desynchronized-canvas low-latency path
  (ADR-0051).
* **Done when:** a profiling report shows the new op within budget, committed under `artifacts/`
  (ADR-0059), with a summary in the PR.

### 33. Mount / cold-start budget check

Verify idle-mount of hidden overlays (ADR-0049) and boot cost haven't regressed as features are
added.

* **Where:** `perf:mount`, `bootHiddenOverlays.ts`; the Lighthouse audit skill for page-load
  (`lighthouse-audit`, first vs repeat visit).
* **Done when:** mount/boot numbers are captured and compared to a baseline; any regression from
  recent features is called out or fixed.

---

## Native / mobile

Read the `mobile` skill first for the toolchain and store/kids-compliance checklists.

### 34. Fastlane store-deploy automation

Set up Fastlane to automate Android + iOS store deployments.

* **Where:** `android/`, `ios/`, and root `scripts/`; keep cross-platform (ADR-0017) and don't leak
  secrets into the repo. Coordinate with the `release`/`build` skills and ADR-0012/0020 toolchains.
* **Done when:** a documented Fastlane lane builds and uploads a signed artifact per platform
  (dry-run in CI without publishing), with secrets sourced from env. Add/adjust an ADR for the
  release pipeline.

### 35. More store screenshots + fun store shots

Generate a fresh, richer set of store screenshots (the `gen:shots` script exists).

* **Where:** `gen:shots` / `gen:style-covers`; commit outputs under `artifacts/` (ADR-0059). Cover
  both orientations and key features (magic brush, coloring book, AI art).
* **Done when:** an updated screenshot set is generated and committed, ready for store listings.

---

## Infrastructure & dev tooling

### 36. Include GHA versions in the update-dependencies flow

Extend the dependency-update workflow/skill to also bump GitHub Actions versions, not just npm deps.

* **Where:** the update-dependencies skill/script and `.github/workflows/`. Parse `uses:` pins and
  surface newer tags.
* **Done when:** running the update flow reports/updates outdated Action pins alongside npm
  packages.

### 37. Document icon source + move toward hand-drawn icons

Document Google Material Symbols (Rounded) as the icon source, then begin replacing with hand-drawn
icons for a warmer, kid-friendly feel.

* **Where:** icon set under `web/src/lib/icons/`, `Icon.svelte`, `icon-names.d.ts`, `gen:icons`. Add
  a short doc (or ADR) recording the source and the hand-drawn direction.
* **Done when:** the icon source is documented and at least one icon is replaced with a hand-drawn
  version through the existing icon pipeline, types regenerated.

### 38. Clear the audit backlog

Work through outstanding findings in `docs/AUDIT.md` (performance, readability, maintainability,
architecture) using the `fix-audits` skill — one commit per item — and vet them first with
`vet-audits`.

* **Where:** `docs/AUDIT.md`, `docs/AUDIT-LOG.md`, `.claude/audit-conventions.md`.
* **Done when:** vetted findings are fixed with per-item commits and the audit log is updated. If
  `AUDIT.md` is empty, run `code-audit` / `extract-audit` first to populate it.

---

## Notes for whoever picks these up

* Prefer the smallest ADR-worthy decision: if an item changes architecture, testing, infra, or build
  tooling, run `/create-adr` (see the `adrs` skill).
* Every UI-visible change needs screenshots in the PR (`pr-screenshots` skill) and, where it makes
  sense, an E2E or unit test — this repo runs a three-tier strategy (ADR-0008).
* Keep the two build targets in mind: server routes (`/api/*`, `/admin`) don't exist in the native
  static export; branch on `CAPACITOR=true` at build time, never at runtime.
