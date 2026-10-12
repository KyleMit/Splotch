# ADR-0176: The Drawing Route Holds Its First Paint Until the Toolbar Is Parsed

**Status:** Active — amends [ADR-0040](0040-per-route-render-modes-and-ssg-home.md) **Date:**
2026-09

## Context

The drawing route is prerendered (ADR-0040) and inlines all of its CSS and every toolbar icon, so
its document is 178 KB, 51.6 KB compressed. A browser paints a document as it arrives. On a slow
parse or a slow connection the first frame held the palette alone, and the More Colors swatch, the
Clear Button, the drawer toggle and the Settings Button appeared afterwards in markup order. A
screen recording of the installed app launching on a phone showed the toolbar assembling over about
a quarter of a second; a throttled Playwright run reproduced it frame by frame.

Nothing moved while that happened. Cumulative layout shift measured 0.0000 in all twelve runs of the
page-load gate, because the layout is fixed by CSS in the `<head>`. The defect was controls
appearing in place, not a layout shift.

The last control the first frame needs, the Settings Button, sits at 98% of the compressed document.
The `<head>` is 55% of it, and the drawer's tools, hidden while the drawer is closed, are 30% and
precede the drawer toggle and the Settings Button in the markup.

Alternatives considered:

* **Leave the paint progressive.** No cost to first paint, and the visible assembly the recording
  showed.
* **Soften the arrival** with a fade on each control or placeholder shapes drawn from the `<head>`
  CSS. The toolbar still changes after first paint, a fade also plays on launches where everything
  arrives together, and placeholders would have to track button size, count and style.
* **Move the hidden drawer tools after the visible controls** and hold only for those. It shortens
  the wait for a closed drawer and needs the hold's target to follow the saved drawer state, since
  an open drawer shows those tools at launch. Not adopted here; tracked as a follow-up.
* **Inline only critical CSS.** Spiked on 2026-09-28: about 6 KB compressed is reclaimable, and a
  build-time extractor misses 5.5 KB of rules that dark-theme and Flat-toolbar launches use, because
  it cannot see the attributes the boot script stamps.
* **Serve the document from the service worker's cache first.** ADR-0022 chose network-first for
  navigations, and a cached document after a deploy is a stale page whose recovery is a visible
  second load.

## Decision

The drawing route declares `<link rel="expect" href="#settingsButton" blocking="render">` in its
`<svelte:head>` (`web/src/routes/+page.svelte`). The browser blocks rendering until the element with
that id has been parsed, so the first frame carries the whole toolbar.

* The target is `SETTINGS_BUTTON_ID` from `lib/state/ui.svelte.ts`, the last control in the
  prerendered markup. `web/tests/first-paint.spec.ts` fails if a later control is added or the link
  names another target, and it proves the behavior under a throttled connection: the first animation
  frame, which cannot run while rendering is blocked, must already see the Settings Button.
* The link is on the drawing route only. Other routes are documents that read top to bottom, and
  progressive paint serves them.
* `blocking` is not in Svelte's element types; `web/src/app.d.ts` augments `HTMLLinkAttributes`.
* An engine without `rel="expect"` ignores the link: Chrome before 124, Safari before 18.2, and
  Firefox. `docs/COMPATIBILITY.md` records it as an above-floor enhancement.

Three defects the same recording showed were fixed at their source rather than hidden by the hold:
the Black swatch takes its fill from the themed `--black-swatch-ink` token instead of a color
resolved at hydration, the Flat toolbar's rule masks are inlined instead of requested, and the box
behind the paper sheet paints paper while the engine settles a resize.

## Consequences

* \+ The first frame of the drawing route is complete in every theme and toolbar style.
* \+ The complete toolbar arrives no later than before. In every measured profile the held first
  paint lands within 40 ms of the moment the last control is parsed.
* \+ The page-load gate does not separate the two builds: first-visit FCP medians were 1,976 and
  1,904 ms before and 1,902 and 1,977 ms after.
* − First paint is later by the time the rest of the document takes to arrive. Measured in
  Playwright's Chromium with the link as the only difference, medians of 15: 4 to 24 ms in every
  profile but one, and 304 ms on a cold load at 1.6 Mbps. The one real-device sample, the recording,
  puts it near 230 ms on that phone.
* − Desktop CPU throttling is a weak stand-in for a phone's parser, so the measured cost is a lower
  bound for phones.
* − Anything added to the prerendered markup before the Settings Button now delays first paint as
  well as weighing on the document.
* − Browsers without `rel="expect"` keep the progressive paint.

Evidence: `docs/scratchpad/pwa-launch-fouc-2026-09-28/README.md` and
`docs/scratchpad/critical-css-spike-2026-09-28/README.md`.
