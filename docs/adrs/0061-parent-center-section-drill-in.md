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
