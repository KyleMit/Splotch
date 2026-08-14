# ADR-0117: A Waiting Picture Is a Polaroid, and It Comes Back Finished

**Status:** Active **Date:** 2026-08

## Context

[ADR-0116](0116-minimize-a-waiting-generation.md) made a still-generating result dismissable and put
a chip in the bottom-right corner as the only way back. It was written against a fifty-second worst
case; the OpenAI path ([ADR-0113](0113-openai-responses-api-image-tool.md)) settled at around
twenty-five seconds, which is short enough that a child will actually wait it out and long enough
that they will do something else first. That turned three things from theoretical into daily:

* **The corner element is looked at, not glanced at.** A pill reading "Making…" is chrome; it
  announces that a process is running. What is running is a *picture*, and the app's audience cannot
  read either word on the chip.
* **The chip's corner is the contested one.** Bottom-right is the Settings Button's, and the Install
  Banner's, which is why `zWaitingChip` existed at all — a tie the banner won on DOM order had
  already stranded a paid run behind it once.
* **Progress died with the modal.** `AiDial.svelte` owned the `requestAnimationFrame` loop that
  filled it, so minimizing threw the run's progress away and restoring started the fill from zero. A
  child who had waited twenty seconds was told their picture was just beginning, and the dial then
  "caught up" over a picture that had, in the worst case, already arrived.

The alternatives considered were the ones the handoff prototyped. **Keeping the chip** and only
fixing the progress plumbing leaves the smallest, least legible version of the thing being waited
for. **Boomerang** — reopening the modal by itself when the picture lands — was rejected outright:
it takes the canvas back from a toddler mid-stroke, which is precisely the interruption ADR-0116
exists to avoid.

## Decision

**The corner element is a polaroid, pinned to the top-left of the canvas**
(`AiWaitingPolaroid.svelte`, renamed from `AiWaitingChip.svelte`). It shows the child's own drawing
dimmed behind a spinner while it waits, with the run's progress as the caption strip, and swaps to
the finished picture, a wand-stars badge and "Ready!" when it lands. Arrival is three passes of a
wiggle — about five seconds of asking to be noticed — and then rest.

Two placement constraints, both load-bearing:

* **That corner belongs to the Color Palette in both orientations** (the layout note in
  `docs/ARCHITECTURE.md` warns about exactly this). The print is offset past it — by
  `--palette-landscape-width` in landscape, by the new `--palette-portrait-height` in portrait — so
  the tilt and shadow graze the palette's edge without covering a swatch, guarded by a spec that
  checks the print's box against every visible swatch.
* **It paints over that edge rather than under it**, so `zWaitingPolaroid` sits above `zPalette`
  (1003, moving the screenshot flight's `zPolaroid` to 1004) — not the old `zBanner`-plus-one.

**The progress loop moved above both surfaces** into `state/aiProgress.svelte.ts`, which follows the
generation machine rather than a mounted component. The dial, the stage's sharpening blur, and the
polaroid's caption bar read one value, so minimizing does not pause a run and restoring does not
restart it. The polaroid quantizes its bar to whole percent: it is the only consumer while the child
is drawing, and a per-frame style write over the canvas is not worth a hundredth of a pixel.

**A picture that arrives while minimized is revealed outright, not ramped.** Nothing is watching a
dial nobody can see, so `complete(minimized)` snaps rather than animating, and the modal that opens
on the next tap is already showing the picture. This is the invariant the whole change turns on: the
corner promises "Ready!", and the tap that follows must not put a progress dial back in front of a
picture that has been finished for a minute.

**The pacing tells the truth.** `AI_ESTIMATE_MS` is 30s and lives beside the fill curve
(`lib/ai/dialProgress.ts`); `AI_LOADING_SUBTITLE` is *derived* from it, so the caption and the dial
cannot promise different durations. The overrun phase still covers everything past the estimate — up
to `GENERATION_POLL_TIMEOUT_MS`, not the old synchronous deadline, since
[ADR-0115](0115-background-generation-jobs.md) moved collection to a poll.

**The way out is written down.** A "Keep drawing while you wait" pill sits under the loading
caption. The X and the backdrop have minimized since ADR-0116, but both read as *cancel* — the one
thing this must never be mistaken for when the run behind it is already paid for. It shows only
while the picture is still being made: offering to minimize a finished result would be offering to
lose it.

## Consequences

* **\+** What is waiting looks like what is waiting. A print developing in the corner needs no
  reading age, and the finished picture is visible in it before anything is tapped.
* **\+** Restoring is honest in both directions — mid-run it resumes where the run actually is, and
  after arrival it lands on the picture.
* **\+** One progress value for every surface, and one estimate for the dial and the copy, so the
  two classes of drift this area had are now structural impossibilities rather than conventions.
* **−** The print is bigger than the chip and sits over the canvas rather than beside it. It covers
  a corner of the drawing the child may still be working on; the tilt keeps it clear of the palette
  but not of the paper.
* **−** The card owes the keep-drawing pill room while it is up. Because a generated picture is the
  shape of the canvas it came from, its height is usually what binds the card, so in practice the
  picture opens up into that room at the reveal — a size change at the moment of arrival that
  ADR-0116's card deliberately did not have. `ai-result.spec.ts` now pins the direction and the
  magnitude of that change rather than asserting it away.
* **−** A polaroid is print-white on both themes, like every other polaroid in the app, so at night
  it is the brightest thing on the canvas. `--polaroid-paper`/`--polaroid-ink` make that a stated
  decision in one place instead of three hand-copied hexes, but it is still a bright rectangle in a
  dark room.
* **−** ADR-0116's "the chip persists until tapped, and there is no timeout that tidies it away" is
  inherited unchanged, now with a larger element doing the persisting.
