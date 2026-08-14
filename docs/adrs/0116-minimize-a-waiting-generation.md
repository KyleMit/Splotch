# ADR-0116: A Waiting Generation Goes to the Corner, Not Away

**Status:** Active **Date:** 2026-08

## Context

The AI result modal blocked dismissal outright while a picture was being made — neither a backdrop
tap nor Esc got past it — because dismissing meant aborting a request the child could not get back.

That was a reasonable trade when a generation took about eight seconds. After the provider migration
the recommended tier takes about fifty (ADR-0113, ADR-0115). Fifty seconds of a modal a two-year-old
cannot dismiss, over a canvas they were in the middle of using, is a long time to hold a toddler
still — and the app's whole proposition is that the canvas is always there.

## Decision

**Dismissing a still-generating result minimizes it instead of cancelling it.** The run is untouched:
`open` stays true, which is exactly what keeps `finishAiGeneration` willing to deliver into it, and a
new `minimized` flag is what the dialog reads. The close button relabels itself to "Keep drawing
while this is made" so the affordance is honest about what it does.

Once there is something to look at — a picture or an error — dismissing means dismissing again.
Minimizing a finished result would be a way to lose it.

**A chip in the corner is the only way back**, and it is always present while a run is minimized.
Minimizing must never become a way to lose a picture that is already being paid for. It shows the
child's own drawing dimmed under a spinner while waiting, and swaps to the finished picture when it
lands.

**Arrival is a pop and a pulse, not a takeover.** The modal does not reopen itself. A dialog that
seizes the screen mid-stroke would interrupt exactly the drawing the child went back to, and on a
canvas app that is worse than a few seconds' delay in noticing. The chip pops, then pulses three
times so a child who was looking elsewhere still finds it, and opens on tap. `prefers-reduced-motion`
turns the animation off and slows the spinner rather than removing the only moving indication that
anything is happening.

## Consequences

- **+** The canvas stays usable through a generation, which is the point of a drawing app.
- **+** The change is small because the state machine already separated "a run is active" from "the
  modal is on screen"; only the dialog's `open` expression and one flag moved.
- **−** A child can now start a generation, minimize it, and forget it. The chip persists until
  tapped or the run is closed, which is the mitigation, but there is no timeout that tidies it away.
- **−** Only one run can be minimized, because only one can be active — starting another while one
  waits aborts the first, as it always did. That is unchanged, but the corner chip makes an
  in-flight run visible in a way that might now invite it.
- **−** Not reopening automatically means a child who wandered off sees a chip rather than their
  picture. That is the deliberate trade against interrupting a stroke, and it is the half of "flashes
  or springs back up" that respects what they are doing.
