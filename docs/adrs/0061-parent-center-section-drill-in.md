# ADR-0061: Settings — One Section List, Two Responsive Shells (Drill-In / Sidebar)

**Status:** Active **Date:** 2026-07

## Context

The modal had grown to four top tabs (Settings, AI, Setup, About) rendered through a horizontal
scroll-snap pager (`TabPager.svelte`). Two problems compounded:

* **The former Settings tab was one long scroll** — appearance, sounds, save-on-delete, folder,
  rotation lock, advanced controls, a button-size slider, and a stack of six per-button toggle rows
  all lived on a single panel. Finding one control meant scrolling past all the others.
* **The tab pager fought its own hosts.** Its programmatic tab nav (`scrollTo` on a scroll-snap-x
  container) is a no-op in the iOS WKWebView, so the native smoke test had to drive About with
  manual horizontal swipes, and a vertical drag on a panel could be misread as a sideways tab
  change.

Adding a fifth destination (the new Submit Feedback form, ADR-0060 — which landed as a *section
inside the About tab* precisely to avoid a fifth tab) would have made the tab bar more crowded
still.

We wanted: no giant scroll, room to grow the destination list, and a shape that works in a phone
modal and on a tablet/desktop where there's horizontal room to spare.

A later physical-iPad action sweep found one cold-path exception: the first What's New render called
`Date.prototype.toLocaleDateString` for five release cards. MobileSafari lazily initialized its
locale machinery on the first call, so one of ten focused opens took 42 ms to present while the
other nine took 9–11 ms. No canvas or drawing-engine work occurred.

A subsequent cross-target sweep found a second cold path after date formatting was removed. The
section still instantiated up to five cards from runtime `{@html}` strings. Android Chrome reached a
66.7 ms post-action frame, and desktop WebKit took 90 ms to present the current-release-only variant
on its first open. Rendering older cards one per animation frame merely split the work across
blocking presentation frames; it did not remove HTML parsing and DOM construction from the
interaction.

## Decision

Replace the tabs with **one flat, ordered list of sections**, rendered through **two shells chosen
by viewport width** — both reading the same section definitions, so the layouts can't drift.

* **Single source of sections** — `web/src/lib/components/settings/sections.ts` exports the ordered
  `SECTIONS` list (`id`, `label`, `icon`) and a `sectionSubtitle(id)` helper (the live one-line
  status shown under each hub row). The order is: Appearance & Display, Sound, Saving, Controls &
  Buttons, AI Art, Setup Guide, What's New, Submit Feedback, About.
* **One section, one component** (`settings/`): `AppearanceSection` (theme + rotation lock + force
  landscape, merged as "how the app looks/orients"), `SoundSection`, `SavingSection`,
  `ControlsSection`, `AiKeyManager`, `SetupInstructions`, `WhatsNewSection` (release notes, split
  out of About), `ReportForm`, `AboutSection` (identity, links, version). `SettingsModal.svelte` is
  a thin shell that renders the active section's component into whichever layout is active.
* **Phone (`< 700px`): hub + full-page drill-in.** A scrollable list of rows (icon, title, status
  subtitle, chevron); tapping one opens that section as its own page with a back arrow (`‹`).
* **Tablet/desktop (`≥ 700px`): sidebar + content pane.** A persistent left nav (all sections, the
  selected one highlighted in brand purple) that never scrolls, beside a content pane that does. The
  breakpoint is a `matchMedia('(min-width: 700px)')` read, seeded synchronously on mount (the modal
  first mounts on the opening tap, so there's no narrow-then-wide flash) and kept live for rotation.
* **The per-button on/off list became a 2-column chip grid** ("Show these buttons") in Controls &
  Buttons, replacing the stack of six toggle rows.
* **Release notes split into their own What's New section**; About now holds only identity, links,
  and version. Submit Feedback is promoted from an About sub-section to a top-level section. The
  build generates metadata JSON plus a Svelte component containing the current release's compiled
  markup. The section renders only that current release and links to GitHub for full history. The
  generator validates the hand-authored ISO date and emits its UTC `en-US` display label, preserving
  the same `July 28, 2026` presentation without constructing `Date` objects, shifting across time
  zones, initializing `Intl`, or parsing HTML on the response frame. The generator splits the
  current note at its level-two headings; the first compiled section renders with the card and the
  remaining sections appear one per presentation frame. No frame has to construct and lay out the
  entire note at once, and no work is added to app boot.

`TabPager`/`TabPagerTab`/`tabPagerContext` are deleted — the pager was Settings-only.

Alternatives considered:

* **Keep the tabs, just split the former Settings panel into more tabs** — more tabs is exactly the
  crowding we were trying to escape, and it doesn't fix the WKWebView pager quirks.
* **An accordion of collapsible sections on one scroll** — avoids a second layout, but re-creates
  the long-scroll problem on a phone and wastes the horizontal room a tablet has.
* **A single responsive component with CSS-only layout switching** — the two shells differ in
  structure (a hub has no persistent nav; the pane always shows a section), not just in CSS, so a
  small `wide` branch in the shell is clearer than contorting one DOM to serve both.
* **`content-visibility: auto` on release cards** — Android still produced a 66.8 ms maximum frame
  because the browser had to parse and construct the DOM even when layout and paint were deferred.
* **Reveal historical cards over successive animation frames** — the browser performs each callback
  before paint, so runtime HTML parsing still consumed presentation frames. Keeping the complete
  history behind the existing release link removes that low-value work entirely.
* **Keep only the current release but retain runtime `{@html}`** — Android improved to a 33.4 ms
  maximum frame, but desktop WebKit still showed a 90 ms cold response. Compiling the same markup as
  Svelte eliminates the runtime parser path without changing the visible current-release content.
* **Prewarm the compiled note in a detached element during boot idle** — this reduced the iPad
  simulator's cold response to 10 ms and added no mount-profile long task, but detached DOM does not
  perform visible layout or font shaping. Two of three desktop WebKit samples retained a 43–47 ms
  cold response. Progressive compiled sections address the remaining visible work and avoid another
  boot responsibility.

## Consequences

* \+ No more one-giant-scroll settings page; each concern is a focused page/pane, and the list has
  clear room to grow.
* \+ One `SECTIONS` list drives both shells, so a new section is added once and appears correctly in
  phone and tablet layouts.
* \+ Navigation is plain button clicks (drill-in or sidebar select), so the native smoke test taps
  "About" directly instead of driving fragile horizontal swipes, and the WKWebView pager no-op is
  gone.
* \+ The locale-free date path reduced the original physical-iPad sample from 42 ms first-frame P95
  to 16 ms, with a 25 ms maximum post-action frame.
* \+ Compiled, progressive current notes reduced the iPad simulator's later cold response from 72 ms
  to 13 ms first-frame P95, with 17 ms post-action P95 / maximum. Android measured 9.5 ms
  first-frame P95 and 16.8 ms post-action P95 / maximum. Two ten-run desktop WebKit samples measured
  25 ms and 23 ms first-frame P95, with 19 ms maximum post-action frames. These pass the shared 20
  ms post-action P95 and 33.5 ms first-frame / maximum gates with the same complete current-release
  content, filled in over two subsequent frames.
* \+ A 4× CPU tablet mount trace remained at 74/89 ms for its two pre-existing long tasks, matching
  the no-prewarm 76/89 ms baseline. The persistent 89 ms task is the sound preload; release-note
  work no longer runs during boot.
* − The in-app section shows only the current release. Older notes remain available through “See all
  releases,” trading embedded history for consistently responsive navigation.
* − Two layouts to keep in mind when styling a section, and a viewport-width branch in the shell
  (mitigated by every section rendering the same component in both).
* − Deep-linking to a specific section still isn't a URL (Settings is a client-only modal);
  reopening always lands on the hub / first section. Acceptable for a settings modal.

Supersedes the tab-based Settings. The Submit Feedback placement note in ADR-0060 (a section within
the About tab) is superseded here — it is now its own top-level section.

ADR-0094 later renamed the shell to Settings and separated the surface's branding from the
operation-level parental gates required by app-store policy; this responsive structure is unchanged.

## Amendment (2026-08)

The Decision's sidebar "never scrolls" — one scroller, the pane. Growing the section icons to the
size the illustrations actually read at pushed the nine rows past the column, and the clipping
`overflow: hidden` hid the last sections with no gesture that brought them back.

The nav is now `overflow-y: auto` with `overscroll-behavior: contain`, plus scroll-position edge
shades (paired `background-attachment: local`/`scroll` layers, so no scroll listener) as the
affordance — a row clipped at a gap leaves the column looking finished, and touch overlay scrollbars
don't paint until the flick starts.

**The second scroller is not rare.** The eleven 50px rows and ten 2px gaps make the list exactly
570px. The 85vh card gives the nav 412px at the 600px viewport floor (158px overflow), 446px at
640px (124px), 534px at 744px (36px), and 555px at 768px (15px); the full list first fits at a 787px
viewport. A landscape iPad in Safari starts from 744–834 CSS px of device height and loses roughly
70–95px to browser chrome, so it routinely lands below that threshold. "One scroller" therefore
describes roomy desktop and portrait-tablet layouts rather than every tablet.

Because the dialog is closed rather than unmounted, the nav also has to be scrolled back to the top
whenever Settings reopens: the section resets to the first one, so a nav left scrolled would reopen
with the selected row above the visible top and no highlight in view. `flows-settings.spec.ts` holds
both invariants at the 600px floor — the column either fits or scrolls, and a reopen leaves the
active row inside the column.

The section labels and their order also changed (Appearance, Sound, Buttons, Saving, Coloring, AI
Art, Parent Center, Install, Feedback, What's New, About) — additions and wording/order changes
within the same structure, listed here because the Decision names the original order. Parent Center
uses the same section navigation but gates entry at its own operation boundary under ADR-0094;
Settings and the other sections remain directly accessible.

## Amendment (2026-08): the wide shell is a table of contents over one continuous scroll

The Decision's wide shell swapped one section's content into the Pane per Sidebar click. Sections
differ enormously in length, so a light one (Sound is a switch and a slider) left most of an 860px
card empty and read as broken rather than short.

The wide Pane now stacks **every** section in nav order in one scroller, each behind its own pane
title, separated by whitespace alone (`--section-gap`, 60px — deliberately past the `--space-8`
ceiling, so no divider rule is needed). The card fills to its existing `max-height` cap and the Pane
is the scroller it already was. The phone hub/drill-in shell and the compact landscape-phone shell
are unchanged, which is why the wide shell moved to its own `settings/WideShell.svelte` and both
shells now render a section through the shared `settings/SectionBody.svelte`.

The Sidebar becomes a scrollspy-driven table of contents: same rows, icons, and order, but the
highlight follows a reading line 130px past the Pane's top edge (last section wins at the scroll
end), a click smooth-scrolls that section's heading to `SECTION_JUMP_INSET_PX` (12px) below the top
edge, and a deep link scrolls rather than swaps. The Sidebar also **scrolls the spied row back into
its own column**: a click can only ever highlight a row already on screen, but the Pane's scroll
elects rows the parent never scrolled the column to, and the column overflows on every viewport
shorter than ~800px — without it the table of contents simply shows no highlight for the bottom of
the Pane. The glide honours `prefers-reduced-motion`, which Chrome does not apply to programmatic
smooth scrolls on its own. That jump is **arithmetic on the Pane's own `scrollTop`, never
`scrollIntoView`** — the latter scrolls every scrollable ancestor, and both the card and the
`<dialog>` are `overflow: hidden` boxes, so it dragged the Settings header and the close button
clean out of the top of the card on every open. Dividing the rect delta by the Pane's visual scale
keeps the arithmetic in layout pixels under the fly-in transform and a pinch-zoomed pane alike. The
spy re-reads live rects on scroll *and* on a `ResizeObserver` of the Pane content, because a
conditional reveal inside a section (the volume slider, advanced controls, the force-landscape row,
the AI toggles) moves every section below it. Because the highlight is now an indicator rather than
a page state — several sections can be on-screen at once — the active row softened from the solid
`--brand-solid` pill to a `--brand-wash`/`--brand-text` fill with a `--brand` left rail, and carries
`aria-current="location"` instead of `"page"`.

Two consequences of "everything is mounted at once" are load-bearing:

* **Parent Center can no longer be protected by not navigating to it.** ADR-0094 puts the gate at
  the operation boundary, and in this shell reaching those controls *is* that boundary — so
  `ParentCenterLock.svelte` stands in for the section's body until the gate is solved, and the
  Sidebar's Parent Center row still runs the gate before it jumps.
* **A spec that proved navigation by asserting the other sections were absent now passes
  vacuously.** Such assertions were rewritten to measure the heading's offset from the Pane's top
  edge (`headingOffsetFromPaneTop`/`SECTION_LANDED_MAX_PX` in `tests/helpers.ts`) or scoped to one
  `.settings-section`.

The whole suite sailed past the ancestor-scroll defect above, because every spec read section
content rather than the card's own chrome; `settings-toc.spec.ts` now holds that invariant directly
("a jump scrolls the pane and never the card itself"), alongside the scrollspy band, the bottom
election, the nav reveal, and the glide.

A third consequence is a cost rather than a hazard, and is accepted rather than solved here. Eleven
section bodies mount on the first open instead of one. On the production build under a `longtask`
observer that is a single 329 ms task at 4x CPU throttle against 93 ms for the phone hub (same modal
chrome, eleven rows, no section bodies) — roughly 240 ms of section construction, first-open only
and off the drawing hot path that ADR-0049 protects. `content-visibility: auto` does not help, for
the reason this ADR already records for the release cards: the browser still parses and constructs
the DOM. A deferred mount would also have to preserve each section's true height, since the
scrollspy's live offsets and the jump arithmetic both read it. Tracked as issue 910.

The reopen reset from the previous amendment also had to move a frame later. A closed `<dialog>` is
`display: none`, so both the nav and the Pane report `scrollTop` 0 and ignore a `scrollTo` — and the
browser restores the offsets it kept the moment the card gets a layout box. Both resets now run in
the `requestAnimationFrame` after `open` flips, which is what makes them stick.

Pinch-text-zoom (ADR-0076) is unchanged on the phone shell, where drilling into a section still
resets it. The wide Pane deliberately drops that reset: a table-of-contents jump stays inside one
continuous document, so only closing the overlay returns the text to its normal size.

Superseded from the original Consequences: "reopening always lands on the hub / first section" now
reads "the hub (phone) / the top of the Pane, or the deep-linked section scrolled into place".

## Amendment (2026-08): the wide Pane fills a section per frame

The cost the amendment above accepted — eleven section bodies constructed in the one task that opens
the dialog — is now paid a frame at a time. The Pane mounts the run of sections from the first up to
whichever one this open lands on (one, for a default open; a deep link pays for its own prefix,
since a section's offset depends only on what stacks above it), and a `requestAnimationFrame` pump
appends the rest in nav order. This is the same shape as the idle overlay pump ADR-0049 established,
for the same reason: batching the work only relocates the long task.

Nothing is mounted at a fake height. Every section is either absent or laid out in full, so the
scrollspy's live offsets and the jump arithmetic stay exact for whatever exists — which is why
`content-visibility: auto` and a placeholder-height scheme were both still rejected. Three
adjustments make that hold while the Pane is filling:

* The scroll-end fallback that elects the last section is gated on the Pane being whole. Until then
  the end of the scroll is merely the end of what has arrived, and electing About there would strobe
  the highlight down the column on open.
* A table-of-contents row is live from the first frame, so a click mounts through the section it
  names before scrolling to it — never a silent no-op.
* Because that click can raise the watermark past where the pump had reached, the pump asks each
  frame for one more than the watermark currently holds rather than counting up privately, which
  would leave every section below a jumped-to one stranded.

**The fill waits for the card to land.** The dialog flies in over its own run of frames, and the
first version of this spent them — the one section body too big to construct inside a frame dropped
one of the animation's, ~120 ms into an open. The pump now starts on the card's
`Animation.finished`, so the fill and the fly-in never contend. Nothing may read the Pane before
then in any case, which is what `aria-busy` states.

The Pane carries `aria-busy` until the last section is in. That is what `tests/helpers.ts`'s
`openSettingsModal` and `gen-page-inventory.mjs` wait on before reading an offset or taking a shot;
the fly-in is no substitute, since it is wall-clock and this is frames.
`scripts/tests/perf-actions.test.mjs` guards the token, and `npm run perf:settings`
(`scripts/perf/settings-open.mjs`) is the measurement, scoring both shells on the production build
under a `longtask` observer, with both timings taken in the page — read from the driver, a
`waitForSelector` plus a round trip lands ~150 ms of its own polling on numbers this small.

Median of five, this host, production build. The phone hub is the floor: same modal chrome, same
eleven rows, no section bodies.

| viewport, CPU     | before                | after                                     |
| ----------------- | --------------------- | ----------------------------------------- |
| wide 1280x800, 1x | 53 ms on the tap      | none over 50 ms                           |
| wide 1280x800, 4x | **281 ms** on the tap | **89 ms** on the tap, 60 ms at ~475 ms in |
| phone hub, 4x     | 67 ms                 | 67 ms — untouched                         |

The tap's own task is within ~22 ms of that floor; the residue is the Sidebar plus the first
section. The one task still over the threshold at 4x is a *single* section body — Install, the
longest in the app — that does not fit in one frame on its own, and splitting a section is a
separate change.

The trade is wall clock. Click to all-eleven-attached goes 287 ms → 798 ms at 4x (53 ms → 549 ms at
1x), of which ~460 ms is the fly-in the fill now waits out rather than works through; the fill
itself is one frame per section either way. That buys a card that is interactive on its first
painted frame and an open animation nothing competes with, at the price of the *bottom* of a
settings list nobody has scrolled to yet arriving half a second later.
