# ADR-0061: Parent Center — One Section List, Two Responsive Shells (Drill-In / Sidebar)

**Status:** Active **Date:** 2026-07

## Context

The Parent Center had grown to four top tabs (Settings, AI, Setup, About) rendered through a
horizontal scroll-snap pager (`TabPager.svelte`). Two problems compounded:

* **The Settings tab was one long scroll** — appearance, sounds, save-on-delete, folder, rotation
  lock, advanced controls, a button-size slider, and a stack of six per-button toggle rows all lived
  on a single panel. Finding one control meant scrolling past all the others.
* **The tab pager fought its own hosts.** Its programmatic tab nav (`scrollTo` on a scroll-snap-x
  container) is a no-op in the iOS WKWebView, so the native smoke test had to drive About with
  manual horizontal swipes, and a vertical drag on a panel could be misread as a sideways tab
  change.

Adding a fifth destination (the new Submit Feedback form, ADR-0060 — which landed as a *section
inside the About tab* precisely to avoid a fifth tab) would have made the tab bar more crowded
still.

We wanted: no giant scroll, room to grow the destination list, and a shape that works in a phone
modal and on a tablet/desktop where there's horizontal room to spare.

## Decision

Replace the tabs with **one flat, ordered list of sections**, rendered through **two shells chosen
by viewport width** — both reading the same section definitions, so the layouts can't drift.

* **Single source of sections** — `web/src/lib/components/parent/sections.ts` exports the ordered
  `SECTIONS` list (`id`, `label`, `icon`) and a `sectionSubtitle(id)` helper (the live one-line
  status shown under each hub row). The order is: Appearance & Display, Sound, Saving, Controls &
  Buttons, AI Art, Setup Guide, What's New, Submit Feedback, About.
* **One section, one component** (`parent/`): `AppearanceSection` (theme + rotation lock + force
  landscape, merged as "how the app looks/orients"), `SoundSection`, `SavingSection`,
  `ControlsSection`, `AiKeyManager`, `SetupInstructions`, `WhatsNewSection` (release notes, split
  out of About), `ReportForm`, `AboutSection` (identity, links, version). `ParentCenter.svelte` is a
  thin shell that renders the active section's component into whichever layout is active.
* **Phone (`< 700px`): hub + full-page drill-in.** A scrollable list of rows (icon, title, status
  subtitle, chevron); tapping one opens that section as its own page with a back arrow (`‹`).
* **Tablet/desktop (`≥ 700px`): sidebar + content pane.** A persistent left nav (all sections, the
  selected one highlighted in brand purple) that never scrolls, beside a content pane that does. The
  breakpoint is a `matchMedia('(min-width: 700px)')` read, seeded synchronously on mount (the modal
  first mounts on the opening tap, so there's no narrow-then-wide flash) and kept live for rotation.
* **The per-button on/off list became a 2-column chip grid** ("Show these buttons") in Controls &
  Buttons, replacing the stack of six toggle rows.
* **Release notes split into their own What's New section**; About now holds only identity, links,
  and version. Submit Feedback is promoted from an About sub-section to a top-level section.

`TabPager`/`TabPagerTab`/`tabPagerContext` are deleted — the pager was Parent-Center-only.

Alternatives considered:

* **Keep the tabs, just split the Settings panel into more tabs** — more tabs is exactly the
  crowding we were trying to escape, and it doesn't fix the WKWebView pager quirks.
* **An accordion of collapsible sections on one scroll** — avoids a second layout, but re-creates
  the long-scroll problem on a phone and wastes the horizontal room a tablet has.
* **A single responsive component with CSS-only layout switching** — the two shells differ in
  structure (a hub has no persistent nav; the pane always shows a section), not just in CSS, so a
  small `wide` branch in the shell is clearer than contorting one DOM to serve both.

## Consequences

* \+ No more one-giant-scroll settings page; each concern is a focused page/pane, and the list has
  clear room to grow.
* \+ One `SECTIONS` list drives both shells, so a new section is added once and appears correctly in
  phone and tablet layouts.
* \+ Navigation is plain button clicks (drill-in or sidebar select), so the native smoke test taps
  "About" directly instead of driving fragile horizontal swipes, and the WKWebView pager no-op is
  gone.
* − Two layouts to keep in mind when styling a section, and a viewport-width branch in the shell
  (mitigated by every section rendering the same component in both).
* − Deep-linking to a specific section still isn't a URL (the Parent Center is a client-only modal);
  reopening always lands on the hub / first section. Acceptable for a settings modal.

Supersedes the tab-based Parent Center. The Submit Feedback placement note in ADR-0060 (a section
within the About tab) is superseded here — it is now its own top-level section.
