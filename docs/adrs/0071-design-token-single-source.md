# ADR-0071: Design Tokens from One Generated Source (In-Repo Design System)

**Status:** Active. **Date:** 2026-07. Amended 2026-07-22: `/admin` and `/privacy` are light-only —
**reversed 2026-08-10**, see the last amendment. Amended 2026-08-03: the styleguide is now the
public `/design` route (ADR-0096) — see the amendment at the end. Amended 2026-08-04: the selection
controls now share the `SegmentedPicker` primitive — see the amendment at the end. Amended
2026-08-04: `/admin` left the light-only set — the console redesign moved it onto the themed tokens
— see the amendment at the end. Amended 2026-08-06: `Button`'s `ghost` variant was removed — see the
amendment at the end. Amended 2026-08-08: `/changelog` adopted the pinned light-only reading
palette. Amended 2026-08-10: **no page opts out of night mode** — the light-only set is empty and
the concept retired; see the amendment at the end.

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

> **Fully superseded.** `/admin` left by the 2026-08-04 admin-redesign amendment below; `/privacy`,
> `/android-beta` and `/changelog` by the 2026-08-10 night-mode amendment at the end, which reverses
> this one outright. Kept for the record — do not act on it.

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
  `SegmentedPicker` grew an opt-in `inputName` prop that renders each option as a real `<input
  type="radio">` under that name inside the same track/option chrome. The last hand-rolled picker
  migrated without losing the no-JS post.

## Amendment (2026-08-03): the styleguide moved to public `/design`

The living styleguide left the dev harness: it now lives at the public `/design` route, extended
with the brand half of the design language (voice & copy, mascot/wordmark, paper, the crayon
palette, the icon set) — see ADR-0096 for the decision and the alternatives (a static
scrapbook-published copy was rejected as a drift hazard). Everything this ADR says about
`/dev/design` — token registration renders there, primitives demo there, PR screenshots come from
there — now applies to `/design`.

## Amendment (2026-08-04): `/admin` is themed

The admin console redesign (owner decision, 2026-08) reversed the 2026-07-22 amendment for `/admin`
only: the console's components — `AdminConsole` with its ledger `InviteLedger` and per-row
`InviteRowActions` (the row-action owners since PR #950 replaced the original `InviteMenu` overflow
modal with an in-place row expansion) — style themselves from the themed tokens (`--brand-wash`,
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
* `/privacy`, `/android-beta`, and `/changelog` remained light-only at the time of this amendment;
  the 2026-08-10 amendment below moved them onto the themed defaults too, emptying the set.

## Amendment (2026-08-06): `Button`'s `ghost` variant is removed

`ghost` — a quiet bordered action, meant for any surface — shipped in the original decision but
never gained a production caller: the only reference was `/design`'s `PrimitiveSections` iterating
the variant union for its specimen row, not a real use of the "quiet bordered" treatment. Its box
model also diverged from its siblings (`.btn` sets `border: none`; `.ghost` was the only variant
adding a real border), so a `ghost` button in a row with `brand`/`wash`/`danger` rendered taller by
`2 × var(--border-width)`. Per the root convention that a variant needs a production caller to
justify its surface, `ghost` is deleted: `Button`'s `variant` prop is now `brand`/`wash`/`danger`,
and the specimen row lists only those three.

## Amendment (2026-08-10): no page opts out of night mode

The 2026-07-22 light-only amendment is **fully reversed** (owner decision, 2026-08-10). Its last
three holdouts — `/privacy`, `/android-beta`, `/changelog` — each pinned every one of `PageShell`'s
`--page-*` properties to a light ground, so a parent with Night Mode on still got a white sheet on
the pages a store listing and a Settings link hand out. All three now run on the shell's themed
defaults, as `/feedback`, `/admin` and `/design` already did, and `pinnedPalette.test.ts` — the
drift guard over the shared `--page-shadow` those pins had to agree on — is deleted with them.

No new tokens were needed; the light appearance is preserved by the tokens the pins already
approximated (`--app-bg`, `--surface`, the text ramp, `--border`, `--brand-text`, `--brand-solid`).
Three details are worth carrying forward, because each one is a place where "just delete the pin"
was not enough:

* **`--page-link-hover` is deleted, not themed.** It existed so a pinned page could point at a
  deeper shade of its own link color; the themed ramp has no such step, and left in place it would
  have resolved to `--page-link` and turned four `:hover { color }` rules into silent no-ops. Links
  now signal hover with their underline — the treatment `/feedback` already used.
* **Per-item accents are mixed against themed tokens rather than tabulated.** `StepLedger`'s four
  crayon steps needed a wash and an ink each; eight themed token pairs with one consumer apiece
  would have failed the "earn its place" bar the ADR-0097 pruning set. Instead each `<li>` carries
  its palette hue and the CSS derives both with `color-mix()` against `--page-sheet` and
  `--page-ink` — one declaration that darkens the hue on the light sheet and lightens it on the dark
  one. One mix strength has to clear WCAG AA for four crayons on two grounds (the tightest is green
  at 4.8:1), which is why `android-beta.spec.ts` now measures every numeral and callout label under
  both color schemes instead of assuming the light reading covers both.
* **A derived color computes in a different notation.** `getComputedStyle` returns `color(srgb r g
  b)` with 0-1 channels for a `color-mix()` and `rgb(r g b)` with 0-255 ones for a plain token. The
  contrast helper in that spec scaled everything by 255 and so read every derived ink as near-black
  — passing at a ratio just above 1. It reads its channels off a 1x1 canvas fill now, which is
  notation-agnostic.

The `<meta name="theme-color">` tag was the last holdout and closed the same day. It shipped as
`THEME_COLORS.light` on every route except `/`, because `lib/state/appearance.svelte.ts` — the one
owner of the resolved-theme subscription that repaints it — is imported only by the drawing route,
so a dark `/privacy` rendered under a white address bar and PWA status bar. Of the two ways to fix
it, pulling those state modules into the marketing-page bundles was rejected: a static import into a
startup-path module re-partitions Rollup's chunks, and it would have done so for pages that need
none of that state. Instead `app.html`'s pre-paint script resolves the theme itself — the explicit
`splotch-theme` value when there is one, `prefers-color-scheme` otherwise — paints the tag before
first paint, and in system mode keeps a `matchMedia` listener so the chrome follows an OS switch
made while the page is open. That listener stands down whenever `data-app-surface` is present: on
the drawing route `NotchBand` tints the same tag with the active drawing color, and the two must not
fight over it. Taking the tag is also what obliges `NotchBand` to hand it back — an `$effect`
cleanup restores `THEME_COLORS[resolvedTheme()]` when it unmounts, because a client-side navigation
to a standalone page runs no boot script and would otherwise leave that page under an address bar
still wearing the drawing color. The script's copies of the colors and of `resolveTheme`'s
three-state rule are guarded the way the rest of that script is — `app.html.test.ts` now runs the
shipped script against the shipped tag for every preference under both OS preferences.
