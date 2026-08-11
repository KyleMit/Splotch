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
 * Four rules earned by reviews of earlier drafts, which found notes that would have
 * suppressed real findings across all 672 paid reviews — and, in the fourth case, a
 * note that produced them instead:
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
 * 4. **Write the floor as a threshold, not as an invitation.** The first quiet-
 *    controls note ended "report them if they are genuinely hard to make out", and
 *    168 of the 256 non-pass reviews came back reporting the chevron and the
 *    settings button, most of them echoing "genuinely difficult to make out" as the
 *    justification. A clause phrased the way the finding would be phrased hands the
 *    reviewer its wording. Say instead what observation is the styling arriving, and
 *    put the floor at a state that can be checked in the image rather than at a
 *    judgement of degree ("still findable" beats "plainly visible").
 *
 * Note that general notes reach the night-mode reviewers too, whose entire remit is
 * contrast and legibility. A general note that puts an element's contrast
 * off-limits blinds that rubric completely, so a note about deliberately quiet
 * styling has to leave a visibility floor the reviewer can still fail.
 *
 * Editing anything here is a re-review. A checkpoint binds the description it was
 * taken against, so a changed note makes those stored reviews stale — regenerate
 * the inventory, then re-run the review command, which re-queues exactly them. A
 * general note therefore restages all of it.
 *
 * GENERAL_DESIGN_NOTES reach every capture. GROUP_DESIGN_NOTES reach every
 * surface in the named group. SURFACE_DESIGN_NOTES reach only the surface named
 * by their `group/surface_id` key. The matching group and surface notes are
 * joined into that capture's `surface_intent`; a key naming no captured target fails
 * tools/page-inventory/tests/page-inventory.test.mjs rather than silently
 * delivering nothing.
 */

export const GENERAL_DESIGN_NOTES = [
  'The round trash button that clears the drawing is docked against the edge of the screen on purpose, with part of it deliberately past the edge; it is not being clipped or cut off by the viewport. Pressing it undocks it.',
  'The chevron that expands and collapses the bottom-corner button panel, and the settings button in the opposite bottom corner, are drawn as thin low-contrast gray glyphs with no filled button, disc, or outline behind them, so they sit back from the child’s artwork; they are the parent-facing controls on this screen, and a child who never notices them is the point. Seeing them read as quiet, subdued, faint, easy to overlook at a glance, or much weaker than the drawing tools is that styling arriving, in either theme, and is the resting appearance of those two controls rather than a contrast finding about them. The floor they still owe is that the glyph remains findable: report one only when you cannot locate its shape anywhere in this image.',
  'Where a scrolling region continues past its edge, this app marks it with a soft gradient fade along that edge, and deliberately ships no arrow, scrollbar, or second indicator beside it. The fade is painted over the last line, row, or card rather than beside it, so that content thins out toward the edge and can read as blurred, smeared, washed out, grayed, or half-erased. That thinning is the cue itself being drawn — not a rendering artifact, a focus or compression fault, or a legibility problem in the region — so judge a scrolling region on the content that sits clear of its faded strip.',
  'Several overlays here are dialogs that lay one scrim over the whole page behind them — the settings card, the color picker, the coloring-book and AI cards, the parent gate, the admin action sheet — darkening and blurring the canvas, the color palette along the top edge, and the corner buttons together, in both themes, so the open card holds attention. Where you can see that the page behind an overlay has been darkened that way, background content reading dim, gray, soft, or blurred is that scrim rather than the styling of the elements beneath it, and the contrast and legibility to judge are those of the open card — its text, its controls, its close button — together with anything drawn on top of the scrim. The brush and stroke-width flyouts cast no scrim: where the page behind an overlay is still at full brightness, every element in the frame keeps its usual scope.',
  'In the bottom-corner panel of round buttons (the Actions Panel), the undo, AI, and screenshot buttons are drawn at reduced contrast whenever they are disabled, which is how this app marks them unavailable until at least one stroke is on the canvas. That reduced contrast is intended for those three buttons while they are in that disabled state; it is not a claim about their contrast once they are enabled.',
];

export const GROUP_DESIGN_NOTES = {
  settings:
    'When this image shows the compact phone-landscape Settings shell, its Portrait and Landscape orientation segments are both inactive while screen rotation is unlocked. A segment becomes active only after the parent locks rotation to that orientation.',
};

export const SURFACE_DESIGN_NOTES = {
  'controls/clear-coachmark':
    'The clear-gesture coachmark drawn over the canvas is the intended design, and it is carried by an animation that a single frame cannot convey. Judge the coachmark itself on whether what is drawn here is legible, rather than on whether it explains the gesture. Everything else in the frame stays in normal scope.',
  'controls/clear-drag-preview':
    'The faint icons washed over the canvas are the intended effect: they signal that clearing the drawing is underway.',
  'settings/settings-whatsnew':
    "In the wide split-pane Settings shell, What's New and About are the two trailing sections of one continuous pane rather than independently paged views, so this capture records their shared trailing region. The table-of-contents highlight follows the reading position: it remains on What's New while that section is at the reading line and moves to About only at the pane's true scroll end. A viewport tall enough to show the entire trailing region can therefore produce the same capture when opened from either section.",
};

export function designNoteKey(group, surfaceId) {
  return `${group}/${surfaceId}`;
}

export function surfaceDesignNote(group, surfaceId) {
  const notes = [GROUP_DESIGN_NOTES[group], SURFACE_DESIGN_NOTES[designNoteKey(group, surfaceId)]];
  const matched = notes.filter(Boolean);
  return matched.length > 0 ? matched.join(' ') : undefined;
}
