# ADR-0071: Design Tokens from One Generated Source (In-Repo Design System)

**Status:** Active. **Date:** 2026-07. Amended 2026-07-22: `/admin` and `/privacy` are permanently
light-only — see the amendment at the end. Amended 2026-08-03: the styleguide is now the public
`/design` route (ADR-0096) — see the amendment at the end. Amended 2026-08-04: the selection
controls now share the `SegmentedPicker` primitive — see the amendment at the end. Amended
2026-08-04: `/admin` left the light-only set — the console redesign moved it onto the themed tokens
— see the amendment at the end. Amended 2026-08-06: `Button`'s `ghost` variant was removed — see the
amendment at the end. Amended 2026-08-08: `/changelog` adopted the pinned light-only reading
palette.

> **Path note ([ADR-0108](0108-unified-tools-tree.md)):** the `scripts/…` paths below moved under
> `tools/`, folded by capability. The decision itself is unchanged.

## Context

The visual language lived in three loosely-coupled places. `app.css` held ~40 hand-written color
custom properties (ADR-0052) in **three blocks that had to be kept manually identical** — the light
`:root`, the explicit `data-theme='dark'` block, and its `prefers-color-scheme` twin (CSS can't
share a declaration block between an attribute selector and a media query at our browser floor).
`lib/theme.ts` **mirrored** two of those values by hand (`PAPER_COLORS`, the dark theme-color meta)
with "keep in sync" comments. And component `<style>` blocks carried whatever raw values each
session invented: ~100 hardcoded hex colors, 15 distinct border radii, 15+ font sizes (including a
`12.5px`), and repeated shadow/easing literals.

The color tokens themselves were the right architecture — custom properties pierce Svelte's style
scoping, theme for free, and cost nothing at runtime. But nothing defined the rest of the vocabulary
(spacing, radius, type, elevation, motion), and nothing stopped drift: every new component, human-
or agent-authored, picked its own values because no source said otherwise.

External design systems (Skeleton, shadcn-svelte, Tailwind) were considered and rejected: Splotch's
tactile aesthetic (paper texture, polaroids, blob radii) would fight a generic library, and all of
them add dependency weight and churn to a perf-sensitive toddler app whose vanilla-CSS approach
already works.

## Decision

**One TypeScript source of truth, one generated CSS file.** All design tokens live in
`web/src/lib/design/tokens.ts`: the brand block, theme-independent scales (spacing `--space-1..8`,
radius `--radius-xs..xl/pill`, type `--font-size-xs..3xl` — named after the CSS property it feeds so
the ramp can't collide with the themed `--text*` color family — motion durations/easings, neutral
shadows), and the themed colors as `themes.light` / `themes.dark` — both typed by one `ThemeTokens`
interface, so the compiler enforces the structural identity the CSS comments used to beg for.

`npm run gen:tokens` (`scripts/gen-tokens.mjs`) emits `web/src/tokens.css` — the `:root` block plus
the dark block **twice** (attribute selector + media query), guaranteed identical by generation. The
file is committed, imported before `app.css`, prettierignored like other generated files, and
guarded in CI by `npm run gen:tokens:check` (same pattern as `ruler:check`).

**JS consumers import the source, not a mirror.** `theme.ts` now derives `PAPER_COLORS` and the dark
theme-color from `themes.*` — the hand-synced copies are gone.

**Primitives grow in `lib/components/design/`**, styled entirely from tokens; `Button.svelte`
(variants `brand`/`wash`/`danger`/`ghost`) is the first. Extraction rule: at the third duplicate,
not before. Canvas-floating controls keep their bespoke paper treatments.

**A living styleguide at `/dev/design`** (dev-harness-gated like the other `routes/dev/*` routes)
renders every token group and primitive from the real source objects with a theme toggle, so
visual-language changes are reviewable in one place and screenshot-able for PRs.

**The `design` skill** documents the vocabulary and the rules (never edit generated CSS; no raw
values where a token exists; JS never mirrors a token). Existing components migrate to tokens
opportunistically — when a file's styles are touched, its raw values move to tokens as same-value
swaps.

## Alternatives considered

* **Status quo** (hand-maintained blocks + comments) — the "MUST stay identical" invariant and the
  `theme.ts` mirrors were bugs waiting to happen, and gave agents no vocabulary to follow.
* **Adopt an external design system / Tailwind** — rejected above: aesthetic mismatch, dependency
  weight, wholesale churn across ~30 components for no runtime benefit.
* **CSS as the source, generate TS from it** — inverts the dependency but loses the `ThemeTokens`
  compile-time guarantee and makes value docs harder to attach; parsing CSS is flimsier than
  serializing objects.
* **`light-dark()` to collapse the dark blocks** — needs Chrome 123 / Safari 17.5, above the
  supported floor (`docs/COMPATIBILITY.md`); generation solves the duplication without moving the
  floor.

## Consequences

* Light/dark structural parity and the JS/CSS agreement are now compile-time/CI facts, not
  discipline.
* The token vocabulary is discoverable (`/dev/design`, the `design` skill) and enforceable in
  review; new UI has one obvious place to get its values.
* Zero runtime cost: same custom-property mechanism as before, no new dependencies, and the
  generated CSS is byte-equivalent in values to the hand-written blocks it replaced.
* One more drift gate in CI (`gen:tokens:check`) and one more generated-file convention to know
  about — mitigated by matching the existing `ruler:check` / `img:audit:check` pattern.
* The ~100 legacy raw values remain until touched; migration is deliberately incremental to keep
  diffs reviewable and avoid a big-bang visual-regression risk.

## Amendment (2026-07-22): light-only surfaces

> Superseded for `/admin` by the 2026-08-04 admin-redesign amendment below; still in force for
> `/privacy` (plus `/android-beta` and `/changelog`, which adopted the same pinned palette).

`/admin` and `/privacy` will **not** get a dark theme — a dark theme was considered and declined
(owner decision, 2026-07-22). Both keep self-contained, WCAG-tuned light palettes that are exempt
from the themed color tokens: themed tokens flip with `data-theme` / `prefers-color-scheme`, so
using them on these pages would half-dark-theme surfaces that are meant to stay light. The raw-hex
ratchet (`scripts/lint-token-styles.mjs`) allowlists both files for exactly this reason. Don't
re-open the question, and don't "fix" their raw palettes by migrating them to themed tokens.

## Amendment (2026-07-25): `Button` is adopted, and where it isn't

`Button.svelte` shipped with the original decision but had no production consumers for its whole
life — only `/dev/design` rendered it, so the primitive documented a convention that no real surface
followed. It is now adopted by the text-labeled actions on the Settings surfaces: Send report
(`ReportForm`), Save / Forget (`AiKeyManager`), Install Splotch (`SetupInstructions`), and both
folder controls (`SavingSection` — Choose folder as `brand`, the selected-folder pill as `wash`).
Each call site keeps only its **placement** (`align-self`, `flex-shrink`, the pill radius, the
folder pill's `max-width` + ellipsis) through a forwarded `class` styled via `:global()` — the same
seam `Disclosure` uses — and hands the chrome (fill, hover, disabled, radius, padding, press scale)
to the primitive. A call site that forwards a `class` and then styles nothing through it is a bug,
not a convention: drop the attribute.

Three surfaces stay hand-rolled **on purpose**, and this is the carve-out to check before "finishing
the migration":

* **`/admin`** — light-only per the amendment above. `Button` is built from themed washes
  (`--brand-wash`, `--danger-wash`), which flip with `data-theme`, so adopting it there would
  half-dark-theme a page that must stay light.
* **Selection controls**, whichever ARIA pattern they use — the `role="radiogroup"` segments
  (`AppearanceSection`'s theme picker, `ReportForm`'s report-kind row) *and* the `aria-pressed`
  toggle segments (`ControlsSection`'s `.chip` grid, `CompactShell`'s orientation segment). All four
  are text-labeled buttons on a Settings surface, so the distinction is not how they are marked up:
  a control that renders a **selected state** is a picker, not an action. `Button` has no selected
  variant and shouldn't grow one — a `selected` prop would have to fight every variant's fill, and
  these four already carry their own `on`/`active` rules.
* **`SettingsModal`'s own chrome** — the close button, sidebar nav items, hub rows, and back arrow
  are navigation, mostly icon-only, and already share `.modal-close-btn` / their own scoped rules.

So the rule is narrower than "modal/parent/admin surfaces use `Button`": **text-labeled actions on
parent/modal surfaces use `Button`**. Canvas-floating controls keep bespoke paper treatments, as
before.

## Amendment (2026-08-04): the pickers share a primitive (`SegmentedPicker`)

The 2026-07-25 amendment's selection-control carve-out said the selected-state controls stay
hand-rolled, each carrying its own `on`/`active` rules. That held until the pattern crossed this
ADR's own extraction rule — a fourth hand-rolled copy appeared as `/design`'s theme toggle — so the
picker pattern got an owner (issue 748): **`SegmentedPicker.svelte`** in `lib/components/design/`.
What changed, and what stands:

* **The `Button` half of the carve-out stands unchanged.** A control that renders a **selected
  state** is a picker, not an action — `Button` still has no selected variant and must not grow one.
  What's gone is the "each hand-rolled" part: the theme picker (`AppearanceSection`), the
  orientation segment (`CompactShell`), the controls chips (`ControlsSection`), and `/design`'s own
  theme toggle all render through `SegmentedPicker`. `mode` carries the ARIA pattern (`radio` =
  radiogroup/`aria-checked`, `toggle` = `aria-pressed`), `variant` the skin (`segment` track with
  the `--shadow-control` raised thumb, `chip` bordered grid); selection *semantics* — deselection,
  multi-select — stay with the caller, which is why one primitive can serve both the orientation
  segment's tap-to-release and the chips' independent toggles.
* **`/admin` stays excluded**, per the light-only amendment above: the primitive is built from
  themed tokens (`--slider-track`, `--surface`, `--brand-solid`), which would flip on the
  permanently light console.
* **The report-kind row (`ReportFields`) migrated onto the primitive too.** The `/feedback` page
  must submit with JavaScript unavailable, which `<button role="radio">` markup cannot — so
  `SegmentedPicker` grew an opt-in `inputName` prop that renders each option as a real
  `<input type="radio">` under that name inside the same track/option chrome. The last hand-rolled
  picker migrated without losing the no-JS post.

## Amendment (2026-08-03): the styleguide moved to public `/design`

The living styleguide left the dev harness: it now lives at the public `/design` route, extended
with the brand half of the design language (voice & copy, mascot/wordmark, paper, the crayon
palette, the icon set) — see ADR-0096 for the decision and the alternatives (a static
scrapbook-published copy was rejected as a drift hazard). Everything this ADR says about
`/dev/design` — token registration renders there, primitives demo there, PR screenshots come from
there — now applies to `/design`.

## Amendment (2026-08-04): `/admin` is themed

The admin console redesign (owner decision, 2026-08) reversed the 2026-07-22 amendment for `/admin`
only: `AdminConsole` and `InviteMenu` now style themselves from the themed tokens (`--brand-wash`,
`--brand-solid`, `--surface-2`, the text ramp, the semantic washes), so the console follows
light/dark like the rest of the app. `adminPalette.css` and its `--admin-*` vocabulary are deleted,
along with the console's `--page-*` pins — `PageShell` runs on its themed defaults there, like
`/design`. Consequences:

* The parts of the earlier amendments that excluded `/admin` from `Button` / `SegmentedPicker` on
  light-only grounds no longer apply; the console still hand-rolls its controls because its shapes
  (ledger table actions, the standalone-page CTA) aren't ones the primitives offer.
* The one raw-hex survivor is the persistence banner's warning amber (no warn token pair exists — it
  is the product's only warning surface); it stays light-pinned on both themes with its own
  self-contained contrast, allowlisted in the ratchet.
* `/privacy`, `/android-beta`, and `/changelog` remain light-only per the 2026-07-22 amendment;
  their shared `--page-shadow` drift guard (`pinnedPalette.test.ts`) covers all three pages.

## Amendment (2026-08-06): `Button`'s `ghost` variant is removed

`ghost` — a quiet bordered action, meant for any surface — shipped in the original decision but
never gained a production caller: the only reference was `/design`'s `PrimitiveSections` iterating
the variant union for its specimen row, not a real use of the "quiet bordered" treatment. Its box
model also diverged from its siblings (`.btn` sets `border: none`; `.ghost` was the only variant
adding a real border), so a `ghost` button in a row with `brand`/`wash`/`danger` rendered taller by
`2 × var(--border-width)`. Per the root convention that a variant needs a production caller to
justify its surface, `ghost` is deleted: `Button`'s `variant` prop is now `brand`/`wash`/`danger`,
and the specimen row lists only those three.
