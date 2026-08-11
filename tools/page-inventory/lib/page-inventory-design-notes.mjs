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
 * GENERAL_DESIGN_NOTES reach every capture. SURFACE_DESIGN_NOTES reach only the
 * surface named by their `group/surface_id` key and become that capture's
 * `surface_intent`; a key naming no captured surface fails
 * tools/page-inventory/tests/page-inventory.test.mjs rather than silently
 * delivering nothing.
 */

export const GENERAL_DESIGN_NOTES = [
  'The trash-can button is docked against the edge of the screen on purpose, not clipped or cut off by it; pressing it undocks it.',
  'The expander chevron and the settings button are deliberately low contrast so they stay quiet next to the drawing canvas.',
  'A soft gradient blur along the edge of a scrolling region is this app’s intended scroll cue, and is sufficient on its own.',
  'On the activity bar, the undo, AI, and camera buttons are deliberately low contrast while they are disabled, and gain full contrast as soon as one stroke is on the canvas. Their contrast is correct as shown.',
];

export const SURFACE_DESIGN_NOTES = {
  'controls/clear-coachmark':
    'This coachmark is the intended design. It is carried by an animation that a still frame cannot show, so assess only whether what is here is legible.',
  'controls/clear-drag-preview':
    'The faint icons washed over the canvas are the intended effect: they signal that clearing the drawing is underway.',
};

export function designNoteKey(group, surfaceId) {
  return `${group}/${surfaceId}`;
}

export function surfaceDesignNote(group, surfaceId) {
  return SURFACE_DESIGN_NOTES[designNoteKey(group, surfaceId)];
}
