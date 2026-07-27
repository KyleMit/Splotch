# Two identical segmented controls use inconsistent ARIA semantics (radiogroup vs group/pressed)

**Priority/category:** P4[accessibility] · **Cluster:** C05 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-45`
(radiogroup/radio) · `web/src/lib/components/ParentCenter.svelte:223-237` (group + aria-pressed) —
pinned at SHA f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** The Segmented primitive (see `p1-duplication-segmented-control.md`)
standardizes on **`radiogroup`/`radio` with roving tabindex and arrow-key selection for mandatory
single-select** (`mode: 'radio'` — theme picker, report-kind picker), and **`role="group"` of
`aria-pressed` toggle buttons for the deselectable case** (`mode: 'toggle'` — the orientation pair).
This finding is a design input to p1, not a separate change; implement them together.

## Original finding (condensed)

The theme picker exposes `role="radiogroup"` with `role="radio"`/`aria-checked` children while the
visually identical orientation selector uses `role="group"` with `aria-pressed` toggle buttons (the
report-kind picker is radiogroup again). Screen-reader users get inconsistent announcements for the
same idiom, and neither radiogroup implements the roving-tabindex/arrow-key navigation the role
implies. Whichever pattern the Segmented primitive standardizes on must be chosen deliberately —
proposed encoding the choice as a `mode: 'radio' | 'toggle'` prop.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

The split persists, one file moved: the theme picker is unchanged (`AppearanceSection.svelte:33-45`,
radiogroup/radio/`aria-checked`); the orientation selector now lives in
`web/src/lib/components/parent/CompactShell.svelte:97-110` (`role="group"` + `aria-pressed`); the
report-kind picker is radiogroup/radio (`ReportForm.svelte:115-127`). Neither radiogroup implements
roving tabindex or arrow keys — every segment is a tab stop, so the role promises keyboard behavior
it doesn't deliver (an APG-pattern violation, not just inconsistency).

One material change strengthens the split-mode decision: the orientation control is now genuinely
deselectable — tapping the active side releases the rotation lock back to free rotation
(`CompactShell.svelte:46-55`), and a null selection ("neither locked") is a designed resting state.

## Options considered

1. **Radio for mandatory single-select, toggle for deselectable (winner).** Matches WAI-ARIA APG
   guidance: the radio-group pattern is the canonical "choose exactly one of a set" idiom — it
   announces position/set-size and checked state, and requires roving tabindex (one tab stop; arrow
   keys move and select), which the primitive implements once. The orientation pair cannot honestly
   be a radiogroup: clicking a checked radio never unchecks it, but tapping the active orientation
   segment must release the lock, and "no segment active" is a legitimate persistent state — that is
   two independent-ish toggle buttons (`aria-pressed`), grouped and labeled. Two of three sites
   already use radio semantics, so this is also the smallest migration.
2. **`aria-pressed` toggles everywhere.** Simpler (no roving tabindex; every segment tabbable).
   Rejected: "pressed" misdescribes a mandatory pick-one set — a screen-reader user hears
   independent toggle buttons with no one-of-N framing, and mutually exclusive auto-unpressing
   buttons are exactly the confusion the radio pattern exists to avoid.
3. **`role="tablist"`.** Rejected: tabs switch visible panels; the theme and report-kind pickers
   select a value, not a panel (the report form's textarea label changes, but the control's meaning
   is a value choice). Misusing tablist would promise panel semantics that don't exist.

## Recommendation

Encode the decision in the primitive's `mode` prop, per the sketch in
`p1-duplication-segmented-control.md`:

* `mode: 'radio'` (theme, report-kind): container `role="radiogroup"` + `aria-label`; options
  `role="radio"`, `aria-checked`, roving `tabindex` (selected option — or first, when none — is `0`,
  the rest `-1`), ArrowLeft/Up and ArrowRight/Down move focus *and* selection with wrap, matching
  the APG radio-group pattern.
* `mode: 'toggle'` (orientation): container `role="group"` + `aria-label`; options are plain buttons
  with `aria-pressed`, all tabbable, no arrow-key handling. The call site keeps its
  deselect-on-reselect logic.

Do not fix the ARIA in place ahead of the extraction — patching roving tabindex into two bespoke
copies is throwaway work that p1 deletes.

## Verification

With a screen reader (VoiceOver/TalkBack): radio-mode segments announce "radio button, x of y,
checked/unchecked" inside a named group; toggle-mode segments announce "toggle button, pressed/not
pressed". Keyboard: radio mode is one tab stop with arrow-key movement+selection; toggle mode tabs
through both segments. Behavior is identical between the theme and report-kind call sites.

## Suggested next step

Fold into the p1 re-staged finding (or `type:audit` issue) as its ARIA/keyboard acceptance criteria
rather than filing separately — the decision here has no standalone implementation.
