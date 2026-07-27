# Clearing the canvas is pointer-only — no keyboard or AT path

**Priority/category:** P3[accessibility] · **Cluster:** C03 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/ClearButton.svelte:103-137` — pinned at SHA f934d43
**Draft patch:** none

## Verdict

**OPTIONS — real tradeoffs.** The gap is real and undocumented, but the fix shape depends on a
product call: does a keyboard/AT clear need the same commitment friction the drag deliberately
imposes on toddlers?

## Original finding (condensed)

`#clearButton` is a real `<button>` with `aria-label="Clear drawing"`, so keyboard and screen-reader
users can focus and activate it — but all behavior is wired through `use:dragToClear` (pointer
events only). Enter/Space fire a `click` nothing listens to, so the clear is unreachable without a
pointer drag, and the label advertises an action the control can't perform for those users.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still fully present. `ClearButton.svelte` and `dragToClear.ts` were heavily refactored since the pin
(exit choreography moved to CSS classes, helpers extracted — a dozen commits), but the interaction
surface is unchanged: `dragToClear` listens only to `pointerdown/move/up/cancel/transitionend`
(`web/src/lib/actions/dragToClear.ts:300-304`), and the button
(`web/src/lib/components/ClearButton.svelte:39-73`) has no `onclick`/`onkeydown`. Keyboard
activation still does nothing.

Product context that frames the decision:

* The drag gesture is deliberate toddler-proofing — a tap must never clear; multi-tap or a 500 ms
  hold shows the coachmark tutorial instead (`registerTap`, `HOLD_DURATION`).
* **No ADR records drag-only clear as an accessibility tradeoff.** The repo's precedent is the
  opposite: ADR-0041/0076 document the zoom lock as the *one* deliberate a11y deduction (and later
  clawed it back), and ADR-0038's `scribbleTap` explicitly keeps `click` with `detail === 0` "for
  keyboard/assistive-tech activation" (same pattern in `ColorPicker.handleHexClick` and
  `modalDialog`). `docs/COMPATIBILITY.md` says nothing about the gesture. This gap looks like an
  omission, not a decision.
* The stakes of an accidental keyboard clear are low: `clearCanvas` is its own undoable command
  (`web/src/lib/drawing/engine.ts:1097` — undo restores the pre-clear snapshot in one blit), and
  `saveDrawingIfEnabled()` snapshots before the wipe.
* A `detail === 0` click is unreachable from touch or mouse (real taps produce `detail >= 1`, and a
  toddler on a touch device can't focus-then-Enter), so a keyboard path gated on it does not weaken
  the toddler-proofing.
* Known limitation of any `click`-based fix: mobile screen readers (VoiceOver/TalkBack) synthesize
  real touch/pointer sequences on double-tap, which land as a zero-distance drag → still no clear. A
  `detail === 0` path covers keyboard and desktop AT; mobile-SR coverage would need more.

## Options considered

1. **`detail === 0` click clears immediately (lean).** Add a `click` listener inside `dragToClear`
   that, when `e.detail === 0`, runs the same commit path as a threshold release
   (`onTutorialDismiss` → `onClear` → `playClearExit`). Pros: ~10 lines in the action that already
   owns the button's behavior; exactly the ADR-0038 house pattern; unreachable by toddler touch;
   recoverable via undo + save-on-delete. Cons: keyboard users skip the drag's commitment friction
   (mitigated by undo); does not help mobile screen readers (synthesized touch, see above).

   ```ts
   function onClick(e: MouseEvent) {
     if (e.detail !== 0 || activePointerId !== null) return;
     const o = getOptions();
     o.onTutorialDismiss();
     o.onClear();
     playClearExit(node, o);
   }
   ```

2. **Two-step keyboard confirm.** First `detail === 0` activation arms the delete-ready state
   (accept zone + red button, an `aria-live` announcement like "press again to clear"); a second
   activation within a timeout clears; Esc/blur cancels. Pros: preserves the confirm semantics for
   every modality. Cons: a new state machine in an already intricate 330-line action; needs
   `aria-live` plumbing to be non-mysterious to AT users; the friction it recreates guards against
   keyboard users, who are not the toddlers the friction was designed for.

3. **Document-and-demote.** Write an ADR recording drag-only clear as a deliberate tradeoff (à la
   ADR-0041) and stop advertising the action to AT. Cons: unlike the zoom lock there is no
   engineering cost forcing the tradeoff — option 1 is cheap and conflicts with nothing; a focusable
   button labeled "Clear drawing" that does nothing still fails honest semantics, and hiding it from
   AT removes information without gaining anything.

Ranked 1 > 2 > 3.

## Recommendation

Lean **option 1**. The drag friction exists to stop toddlers on touch devices from wiping a drawing
by mashing; a `detail === 0` path is physically outside their reach, and undo + save-on-delete make
the worst case recoverable. Option 2 is the right shape only if the maintainer decides *any*
single-activation clear is unacceptable regardless of modality — that is the one tradeoff to weigh.
Whichever lands, note the mobile-SR limitation in the code comment, and add a unit test in
`dragToClear.test.ts` dispatching `new MouseEvent('click', { detail: 0 })` (clears) and
`{ detail: 1 }` (ignored).

## Suggested next step

File as a `type:audit` GitHub issue proposing option 1, flagging the option-1-vs-2 friction question
for the maintainer; if the drag-only design is instead reaffirmed, that decision belongs in an ADR.
