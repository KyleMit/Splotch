# The `.setting-group .setting + .setting { margin-top: 6px }` rule is copied into three sections

**Priority/category:** P3[duplication] · **Cluster:** C05 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/parent/AppearanceSection.svelte:75-77` ·
`web/src/lib/components/parent/SavingSection.svelte:65-67` ·
`web/src/lib/components/parent/ControlsSection.svelte:165-167` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**FIX — clear winner.** Hoist the rule into ParentCenter's existing shared `:global` block —
`.parent-help-content :global(.setting-group .setting + .setting) { margin-top: 6px; }` — and delete
the three copies. Verified zero visual change anywhere.

## Original finding (condensed)

The identical adjacent-sibling spacing rule appears verbatim in three section components, while
ParentCenter already owns the shared `.setting-group`/`.setting` styling globally with a comment
saying the point is to keep these rules "in one place instead of copied into each section
component". The copies contradict that intent.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still true, lines shifted slightly: the rule sits verbatim at `AppearanceSection.svelte:76-78`,
`SavingSection.svelte:70-72`, and `ControlsSection.svelte:162-164`. ParentCenter's shared block
survived the compact-shell refactor and now lives at `ParentCenter.svelte:489-504`
(`.parent-help-content :global(.setting-group)` margins, `:global(.setting)` card padding/surface),
comment intact. `grep -rn "setting + .setting" web/src` returns exactly the three copies.

Blast-radius check for the hoist (why it is safe):

* The only sections with *adjacent* `.setting` siblings are the three that already carry the rule.
  `AiKeyManager.svelte` has two `.setting`s but in exclusive `{#if}/{:else}` branches (lines
  141/195); `SoundSection` and `ReportForm` have one each; `AboutSection`/`WhatsNewSection` none.
* The `.setting-group` scoping in the selector must be kept: `CompactShell.svelte` renders inside
  `.parent-help-content` (`ParentCenter.svelte:131-132`) and its `.quick-toggles` grid cells are
  `.setting` siblings *not* wrapped in a `.setting-group` — a broader `:global(.setting + .setting)`
  would add stray 6px margins inside that grid.

## Options considered

1. **Hoist into ParentCenter's shared block (winner).** One line moves next to the styles it belongs
   with; the comment there already claims this responsibility. No behavior change.
2. **Promote 6px to a spacing token.** Rejected: the ramp is 4px-based (`--space-1` = 4px,
   `--space-2` = 8px — no 6px step), the skill says a token must earn its place with 2-3 semantic
   uses, and the surrounding shared block already uses deliberate raw px. After the hoist there is
   exactly one occurrence; keep it raw.

## Recommendation

In `ParentCenter.svelte`, extend the shared block at lines 489-504:

```css
.parent-help-content :global(.setting-group .setting + .setting) {
  margin-top: 6px;
}
```

Delete the three-line rule from each of the three section components. Verify with
`grep -rn "setting + .setting" web/src` (one hit) and a visual pass over the Appearance, Saving, and
Controls sections — stacked rows keep their 6px gap, CompactShell's grid is untouched.

## Suggested next step

Re-stage in docs/AUDIT.md as-is (a five-minute, zero-risk cleanup). Independent of the Segmented
primitive work in `fix/p1-duplication-segmented-control.md` — can land first or separately.
