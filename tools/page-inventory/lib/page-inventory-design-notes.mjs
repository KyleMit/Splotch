/**
 * Design intent handed to the page-inventory reviewers.
 *
 * This file is the one place a human edits to stop a reviewer reporting a settled
 * decision as a defect. Nothing here is capture plumbing: every entry is a sentence
 * that ships verbatim inside a capture's `review_description`.
 *
 * A reviewer sees one image and that description and nothing else — no repository,
 * no other capture, no earlier finding. So each note has to stand on its own, name
 * what is visible, and read as a decision already made rather than an instruction
 * to look away from the picture.
 *
 * Three rules earned by a review of the first draft, which found notes that would
 * have suppressed real findings across all 672 paid reviews:
 *
 * 1. **State intent, never a verdict.** "This is correct as shown" and "this is
 *    sufficient" decide the finding for the reviewer. Describe the decision and let
 *    them judge the image against it.
 * 2. **Bound every note to the state and the element it covers.** A note about a
 *    disabled control must say "while disabled", or it silently waives the enabled
 *    captures too. A note about one component must not re-scope the whole frame.
 * 3. **Name elements the way a stranger can find them in a picture**, using the
 *    glossary term in `docs/ARCHITECTURE.md` plus a visual description. An invented
 *    name ("activity bar") either gets ignored or lands on the wrong control.
 *
 * Note that general notes reach the night-mode reviewers too, whose entire remit is
 * contrast and legibility. A general note that puts an element's contrast
 * off-limits blinds that rubric completely, so a note about deliberately quiet
 * styling has to leave a visibility floor the reviewer can still fail.
 *
 * GENERAL_DESIGN_NOTES reach every capture. SURFACE_DESIGN_NOTES reach only the
 * surface named by their `group/surface_id` key and become that capture's
 * `surface_intent`; a key naming no captured surface fails
 * tools/page-inventory/tests/page-inventory.test.mjs rather than silently
 * delivering nothing.
 */

export const GENERAL_DESIGN_NOTES = [
  'The round trash button that clears the drawing is docked against the edge of the screen on purpose, with part of it deliberately past the edge; it is not being clipped or cut off by the viewport. Pressing it undocks it.',
  'The chevron that expands and collapses the bottom-corner button panel, and the settings button in the screen corner, are deliberately styled quieter than the drawing tools so they recede next to the child’s artwork. They are still meant to be plainly visible, so report them if they are genuinely hard to make out against what is behind them.',
  'Where a scrolling region continues past its edge, this app marks it with a soft gradient fade along that edge, and deliberately ships no arrow, scrollbar, or second indicator beside it. The fade is the intended affordance rather than a rendering artifact.',
  'In the bottom-corner panel of round buttons (the Actions Panel), the undo, AI, and screenshot buttons are drawn at reduced contrast whenever they are disabled, which is how this app marks them unavailable until at least one stroke is on the canvas. That reduced contrast is intended for those three buttons while they are in that disabled state; it is not a claim about their contrast once they are enabled.',
];

export const SURFACE_DESIGN_NOTES = {
  'controls/clear-coachmark':
    'The clear-gesture coachmark drawn over the canvas is the intended design, and it is carried by an animation that a single frame cannot convey. Judge the coachmark itself on whether what is drawn here is legible, rather than on whether it explains the gesture. Everything else in the frame stays in normal scope.',
  'controls/clear-drag-preview':
    'The faint icons washed over the canvas are the intended effect: they signal that clearing the drawing is underway.',
};

export function designNoteKey(group, surfaceId) {
  return `${group}/${surfaceId}`;
}

export function surfaceDesignNote(group, surfaceId) {
  return SURFACE_DESIGN_NOTES[designNoteKey(group, surfaceId)];
}
