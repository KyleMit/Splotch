# ADR-0071: Design Tokens from One Generated Source (In-Repo Design System)

**Status:** Active. **Date:** 2026-07. Amended 2026-07-22: `/admin` and `/privacy` are permanently
light-only — see the amendment at the end.

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

`/admin` and `/privacy` will **not** get a dark theme — a dark theme was considered and declined
(owner decision, 2026-07-22). Both keep self-contained, WCAG-tuned light palettes that are exempt
from the themed color tokens: themed tokens flip with `data-theme` / `prefers-color-scheme`, so
using them on these pages would half-dark-theme surfaces that are meant to stay light. The raw-hex
ratchet (`scripts/lint-token-styles.mjs`) allowlists both files for exactly this reason. Don't
re-open the question, and don't "fix" their raw palettes by migrating them to themed tokens.

## Amendment (2026-07-25): `Button` is adopted, and where it isn't

`Button.svelte` shipped with the original decision but had no production consumers for its whole
life — only `/dev/design` rendered it, so the primitive documented a convention that no real surface
followed. It is now adopted by the text-labeled actions on the parent surfaces: Send report
(`ReportForm`), Save / Forget (`AiKeyManager`), Install Splotch (`SetupInstructions`), and Choose
folder (`SavingSection`). Each call site keeps only its **placement** (`align-self`, `flex-shrink`,
the folder pill's radius) through a forwarded `class` styled via `:global()` — the same seam
`Disclosure` uses — and hands the chrome (fill, hover, disabled, radius, padding, press scale) to
the primitive.

Three surfaces stay hand-rolled **on purpose**, and this is the carve-out to check before "finishing
the migration":

* **`/admin`** — light-only per the amendment above. `Button` is built from themed washes
  (`--brand-wash`, `--danger-wash`), which flip with `data-theme`, so adopting it there would
  half-dark-theme a page that must stay light.
* **Selection controls** — `AppearanceSection`'s theme picker and `ReportForm`'s report-kind row are
  `role="radiogroup"` segments with an `active` state. They are pickers that look like buttons, not
  actions; `Button` has no selected variant and shouldn't grow one for two call sites.
* **`ParentCenter`'s own chrome** — the close button, sidebar nav items, hub rows, and back arrow
  are navigation, mostly icon-only, and already share `.modal-close-btn` / their own scoped rules.

So the rule is narrower than "modal/parent/admin surfaces use `Button`": **text-labeled actions on
parent/modal surfaces use `Button`**. Canvas-floating controls keep bespoke paper treatments, as
before.
