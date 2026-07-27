# Extract a shared segmented-control primitive — it now exists three times with drift

**Priority/category:** P1[duplication] · **Cluster:** C05 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-47,92-138` ·
`web/src/lib/components/ParentCenter.svelte:222-238,443-490` ·
`web/src/lib/components/parent/ReportForm.svelte:112-125,233-267` — pinned at SHA f934d43 **Draft
patch:** none

## Verdict

**FIX — clear winner.** Extract `web/src/lib/components/design/Segmented.svelte` beside
`Button.svelte`, styled once from tokens, with a `variant` for the active treatment and a `mode`
prop carrying the ARIA decision from the companion doc `p4-accessibility-segmented-aria.md`. The
design skill's own rule — "Extract a new primitive at the third duplicate" — was written for exactly
this case, and its Button table already names these three controls as the pickers Button must not
absorb.

## Original finding (condensed)

Three near-identical "iOS-style segmented control" implementations exist (theme picker, orientation
selector, report-kind picker), and the comments admit the copy-paste ("matching the Theme picker",
"mirrors the Appearance theme picker"). They have drifted: container radius `var(--radius-md)` vs
raw `10px`, option radius `9px` vs `var(--radius-sm)` vs `7px`, raised-card vs brand-fill active
treatment, `var(--font-size-sm)` vs raw `12.5px`. Proposed a `Segmented.svelte` primitive with
`options`/`selected`/`onSelect`, a `raised`/`filled` variant, and an allow-deselect flag.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still three sites, still drifted — the finding fully holds, with two updates since f934d43:

* **The orientation selector moved.** ParentCenter's compact layout was extracted into
  `web/src/lib/components/parent/CompactShell.svelte`; the `.orient-seg` control now lives there
  (markup 97-111, styles 162-219), comment still saying "matching the Theme picker in
  AppearanceSection". It also gained real deselect behavior: tapping the active side releases the
  rotation lock (`CompactShell.svelte:46-55`), so the `allowDeselect`/toggle mode is now a hard
  requirement, not a nicety.
* **One axis of drift was fixed by a token.** Both raised sites now share `--shadow-segment`
  (`web/src/lib/design/tokens.ts:101-104`, with a don't-converge comment), replacing the raw
  `box-shadow` the finding cited.

The remaining drift, verified at HEAD:

| Axis             | Theme (`AppearanceSection:93-139`) | Orientation (`CompactShell:169-219`) | Report-kind (`ReportForm:235-270`) |
| ---------------- | ---------------------------------- | ------------------------------------ | ---------------------------------- |
| Container radius | `var(--radius-md)`                 | raw `10px`                           | raw `10px`                         |
| Option radius    | raw `9px`                          | `var(--radius-sm)`                   | raw `7px`                          |
| Track            | `var(--slider-track)`              | `var(--slider-track)`                | `var(--surface)` + 1px `--border`  |
| Active           | surface card + `--shadow-segment`  | surface card + `--shadow-segment`    | `--brand` fill                     |
| Font             | `var(--font-size-sm)`              | raw `12.5px`                         | `var(--font-size-sm)`              |
| ARIA             | radiogroup/radio                   | group + `aria-pressed`               | radiogroup/radio                   |

`web/src/lib/components/design/` still holds only `Button`, `Disclosure`, `StatusMessage` — no
Segmented primitive exists.

## Options considered

1. **Extract a `Segmented.svelte` primitive (winner).** One implementation, token-styled, fixes the
   keyboard/ARIA gaps (p4) in one place. Pros: kills the drift permanently; three call sites shrink
   to a few lines each; the skill's third-duplicate rule and its Button carve-out both point here.
   Cons: small visual normalization to review (below).
2. **Hoist shared rules to `app.css` classes** (the `.flyout-menu` route). Rejected: the skill
   reserves that for unscoped/imperative-DOM needs or canvas chrome that "hasn't earned a primitive
   yet" — these are three structurally identical, component-scoped pickers on modal surfaces, and a
   class can't carry the roving-tabindex behavior p4 requires.
3. **Leave as-is.** Rejected: the drift the shared-styling comment was supposed to prevent has
   already happened, and a fourth copy is likely (any future single-select setting).

## Recommendation

Add `web/src/lib/components/design/Segmented.svelte`:

```svelte
<script lang="ts">
  let {
    options, // { value: string; label: string; icon?: CommonIconName; id?: string }[]
    selected, // string | null (null only meaningful in mode 'toggle')
    onSelect, // (value: string) => void — toggle mode call sites handle deselect themselves
    label, // aria-label for the container
    variant = 'raised', // 'raised' (theme, orientation) | 'filled' (report-kind)
    mode = 'radio', // 'radio' | 'toggle' — see p4-accessibility-segmented-aria.md
  } = $props();
</script>
```

Style once from tokens: `--slider-track` track, `--radius-md` container, `--radius-sm` options,
`--shadow-segment` on the raised active card, `--font-size-sm`, `--duration-fast` transitions, and
always `type="button"` (the theme picker currently omits it). `variant="filled"` changes only the
active treatment to `--brand`/`--on-brand`.

Deliberate normalizations to review in `/dev/design` and PR screenshots (per the `pr-screenshots`
skill), all nudges onto the token ramp: option radius 9px/7px → 8px, container 10px → 12px on two
sites, orientation font 12.5px → 13px, and the report-kind track converges from `--surface`+border
to `--slider-track` (the one visible change; convergence is the point of the primitive — if the
maintainer wants to keep the bordered look, it can ride the `filled` variant instead, but the lean
is full convergence). Don't pre-build a `size` prop for CompactShell's slightly tighter padding;
only add one if the normalized control breaks the 2×2 grid height.

Register the primitive in `/dev/design` and in the design skill's primitives table — edited at its
source `.ruler/skills/design/SKILL.md` (then `npm run ruler:apply`), never the generated copy — and
update Button's "not for pickers" row to point at Segmented.

## Suggested next step

Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with the updated file/line references
above — the ParentCenter citations are stale, the control is in `CompactShell.svelte` now. Implement
together with `p4-accessibility-segmented-aria.md` (the `mode` prop is its decision);
`p3-duplication-setting-spacing-rule.md` is independent and can land separately.
