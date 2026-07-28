# Audit comments — Design tokens & accessibility

11 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### 1a296ddb6d4f — [P3][design-tokens] Hardcoded active-segment shadow `0 1px 4px rgba(0,0,0,0.18)` — no token, duplicated

**Issue**

Both active segmented-control states use the raw literal
`box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);`. The design skill forbids raw shadow literals where a
token exists; `--shadow-sm` (`0 2px 6px rgba(0,0,0,0.12)`) is the intended elevation token. The
literal is also duplicated, so the two "identical" controls could drift.

**Fix**

Minted a new neutral elevation token `--shadow-segment` (`0 1px 4px rgba(0, 0, 0, 0.18)`) in
`web/src/lib/design/tokens.ts`, regenerated `tokens.css`, and pointed `.theme-option.active` and
`.orient-opt.active` at it. Deliberately a new token rather than the suggested `--shadow-sm` — that
one is `0 2px 6px rgba(0, 0, 0, 0.12)`, so reusing it would have visibly restyled both segmented
toggles instead of leaving pixels byte-identical. Note that the literal still appears in `tokens.ts`
and the generated `tokens.css` (it is the token's definition); the acceptance grep is clean across
all component/`.svelte` call sites.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Correct and gated: both original sites (AppearanceSection.svelte:131 and the relocated segmented
  control now at parent/CompactShell.svelte:212) reference var(--shadow-segment); the token is
  byte-identical, lives in the unthemed :root block with no dark override, and tokens.css is
  imported in +layout.svelte:9 — computed box-shadow is unchanged in both themes. Verified by me:
  gen:tokens:check, lint:tokens, ruler:check, npm run check (924 files, 0 errors), npm run test:unit
  (579 tests pass), npx eslint on the three changed files (clean). No stragglers: grep for '1px 4px'
  in web/src returns only the token definition.
* INCOMPLETE — web/src/routes/dev/design/+page.svelte:34:
  `const shadowKeys = ['shadowSm', 'shadowPop'] as const` is a hardcoded list (siblings
  spaceKeys/radiusKeys/fontSizeKeys derive from Object.keys(scale)), so --shadow-segment never
  renders on /dev/design. This contradicts the page's own stated invariant at line 56 ('If it's not
  on this page, it's not part of the visual language') and the design skill's claim that the
  styleguide renders every token group from the real source objects and is where you 'check what
  already exists before inventing a new value.' Add shadowSegment to the list (or derive it via
  Object.keys(scale).filter(k => k.startsWith('shadow'))).
* INCOMPLETE — .ruler/skills/design/SKILL.md:42: the Elevation row of the token vocabulary table
  still lists only `--shadow-sm`, `--shadow-pop` (neutral). That table is the canonical list agents
  consult before picking a shadow; omitting the new neutral token leaves it undiscoverable and
  invites the exact re-duplication this finding is about. Edit the .ruler source (never the
  generated .claude/skills/ and .agents/skills/ copies) and run `npm run ruler:apply`.
* SCOPE NOTE — the verifier's acceptance criteria are mis-scoped: they check the grep, the two
  generators, types, and pixel-identity, but nothing about registering the minted token in its two
  documented discovery surfaces. The commit satisfies every listed criterion while only
  half-resolving the finding's actual complaint ('no token' — i.e. no discoverable home for the
  value).
* NOT RAISED (out of scope, informational): web/src/lib/components/parent/ToggleRow.svelte:115 holds
  a different literal `0 2px 4px rgba(0, 0, 0, 0.2)` on the toggle-switch thumb — a distinct control
  with a distinct value, not part of this finding. No change wanted in this commit.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075747980) · 2026-07-25
00:10:49 UTC</sub>

### 343174592f88 — [P3][design-tokens] `slide={{ duration: 220 }}` magic number repeated across six sections

**Issue**

The section reveal transition uses the bare literal `220` in eight places (and ReportForm uses
ad-hoc `180`/`160`). `220` is not a motion token (`--duration-fast/base/slow` = 150/200/350ms), so
the "standard section expand" timing is an unnamed magic number scattered across the tree; changing
it means editing eight call sites, and ReportForm has already diverged.

**Fix**

Added a `SECTION_SLIDE` constant to `web/src/lib/components/parent/sections.ts` (the existing home
for shared Parent Center metadata) and pointed all seven settings-block `transition:slide` call
sites in AppearanceSection, SoundSection, ControlsSection, and AiKeyManager at it, so the reveal
timing has one definition instead of seven copies. The value is unchanged at 220ms and ReportForm's
distinct 180/160ms nested-disclosure timings were left alone. It lives in TS rather than tokens.css
because `transition:slide` needs a JS number, not a `var(--duration-*)` string; the only remaining
`duration: 220` in that directory is that single definition.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748059) · 2026-07-25
00:10:50 UTC</sub>

### 7e0fbad4d312 — [P3][accessibility] `ToggleRow` help text isn't associated with the switch (`aria-describedby` missing)

**Issue**

When `help` is provided, it renders as a sibling `<p class="setting-help">` (`:40-42`) with no `id`,
and the `role="switch"` button (`:27-38`) has no `aria-describedby` pointing to it. A screen-reader
user focusing the switch hears the label but never the explanatory help (e.g. "Saves the current
drawing each time the page is cleared"). The component already threads a unique `id`, so wiring the
description is cheap. This is a maintainability smell too: the `help` prop looks fully supported but
is only half-wired.

**Fix**

Wired `ToggleRow`'s optional help line to its switch: the help `<p>` now carries `id="{id}-help"`
and the `role="switch"` button gets `aria-describedby` pointing at it, so a screen reader announces
the explanatory text along with the label. The attribute stays `undefined` when no `help` prop is
passed, so help-less toggles get no dangling reference — verified in a real browser that
`saveOnDeleteToggle` resolves its description and `soundToggle` has no `aria-describedby` at all.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/a11y.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748217) · 2026-07-25
00:10:51 UTC</sub>

### 331e7d51f917 — [P4][design-tokens] Sub-`--font-size-xs` magic sizes: WhatsNew `15px`, ReportForm `11px`

**Issue**

`.whats-new-date { font-size: 15px }` sits between `--font-size-md` (14) and `--font-size-lg` (16)
with no token, and `.report-device-note { font-size: 11px }` is below the smallest token
(`--font-size-xs` = 12) — an off-ramp value with no name. Both are raw px where the type ramp is
meant to be authoritative.

**Fix**

Replaced the two raw px font-sizes with design tokens: `.whats-new-date` in WhatsNewSection.svelte
now uses `var(--font-size-md)` (matching the sibling `.appearance-title` pattern) instead of `15px`,
and `.report-device-note` in ReportForm.svelte now uses `var(--font-size-xs)` instead of `11px`,
which was below the smallest defined token.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748353) · 2026-07-25
00:10:53 UTC</sub>

## PR [\#542](https://github.com/KyleMit/Splotch/pull/542) — Cut the audit burndown over to run cloud-native (+ 7 findings) (2026-07-25)

### 298d12244201 — [P2][design-tokens] InstallBanner uses off-scale font sizes, radius, and an ad-hoc shadow

**Issue**

`.install-copy strong` and `.install-cta` set `font-size: 15px` (241, 259) — 15 is not on the type
scale (`--font-size-md:14`, `--font-size-lg:16`). `.install-cta` uses `border-radius: 14px` (257),
off the radius scale (`--radius-md:12`, `--radius-lg:16`). `.install-banner` uses
`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18)` (160), a one-off instead of
`--shadow-pop`/`--shadow-sm`. Mixed in are legitimate token usages, which makes the off-scale values
look intentional when they're likely drift.

**Fix**

Swapped the three off-scale literals in `InstallBanner.svelte` for their nearest design tokens: the
15px font sizes on `.install-copy strong` and `.install-cta` become `var(--font-size-lg)`, the 14px
CTA radius becomes `var(--radius-lg)`, and the hand-rolled banner shadow becomes
`var(--shadow-pop)`. Pure value substitution — each replacement is within 1–2px of the literal it
replaces, so the banner renders effectively unchanged while staying on the token scale.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note — the "renders effectively unchanged" claim is only true of the two lengths.** The
font sizes (15→16px) and radius (14→16px) are within 1–2px as described, but the shadow is not a
near-match: `0 10px 30px rgba(0, 0, 0, 0.18)` → `--shadow-pop` = `0 8px 32px rgba(0, 0, 0, 0.3)`,
i.e. roughly 65% more opaque as well as a different offset and blur. Snapping it to the scale is
what the finding asked for, so the change stands, but the banner's drop shadow *is* visibly heavier
now and this commit went through with no screenshot or E2E gate (the verifier named no specs). Worth
an eyeball before this PR merges.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078507710) · 2026-07-25
12:38:06 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### b638def4f791 — [P3][design-tokens] NotchBand hardcodes a 250ms transition off the duration scale

**Issue**

`transition: background-color 250ms ease;` — 250ms isn't a token (`--duration-base:0.2s`,
`--duration-slow:0.35s`). A one-off duration in an otherwise token-driven codebase.

**Fix**

Replaced the one-off `250ms` literal in `.notch-band`'s `transition` with `var(--duration-base)`,
putting the band's background-color transition back on the shared motion scale like every other
component. The brief deliberately picks `--duration-base` (200ms) over the finding's suggested
`--duration-slow` because it is the closer token and nothing indicates 250ms was intentional —
implemented as the brief specifies.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079049364) · 2026-07-25
15:26:07 UTC</sub>

### cf55a8f2b72d — [P5][design-tokens] ErrorScreen uses bare off-scale sizes for its heading and blob

**Issue**

The crash fallback deliberately uses `var(--token, literal)` fallbacks so it renders even if
`tokens.css` failed to load (documented intent, 1-3) — that part is fine. But
`h1 { font-size: 32px }` (44) and the `.error-blob` `96px` box (35-36) are bare literals with no
token and no fallback rationale; `--font-size-3xl` is 28 and there's no 32 token. Low stakes given
the standalone nature, but it's untokenized sizing that could reference the scale where the
component still has token access.

**Fix**

Changed the ErrorScreen `h1` font-size from the bare `32px` literal to `var(--font-size-3xl, 32px)`,
matching the crash-safe token-with-fallback pattern already used elsewhere in the component, and
left `.error-blob`'s `96px` as an intentionally untokenized literal with a short comment since no
sizing token exists for it (per the brief, no new token was added).

*Revised before approval:* Addressed the adversarial review's two points in a new commit
fb0d0ffe1563bf023110245235589a79d3b5872d: deleted the ErrorScreen finding from docs/AUDIT.md via
`node scripts/audit-burndown/pop.mjs --delete` (confirmed it was entry \#1), and added a comment on
the h1 rule in ErrorScreen.svelte documenting that the 32px fallback deliberately diverges from the
token's 28px value to preserve today's crash-path rendering size. Re-ran `npm run check` and
`npm run format:check` (which covers dprint on AUDIT.md) — both green.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The finding's entry was not deleted from docs/AUDIT.md — it is still present at docs/AUDIT.md:10
  ("[P5][design-tokens] ErrorScreen uses bare off-scale sizes..."), unlike neighboring burndown
  commits 86b98e5 and 6ee1fd4 which excise the entry in the same commit as the fix.
* In web/src/lib/components/ErrorScreen.svelte, `font-size: var(--font-size-3xl, 32px)` changes the
  rendered heading from 32px to 28px whenever tokens.css loads, because --font-size-3xl is 28px
  (web/src/tokens.css:39); every other fallback in this file mirrors its token value exactly
  (--brand/#ab71e1, --text-strong/\#333, --on-brand/#fff), so either set the fallback to 28px or add
  a comment stating the 32px crash-path divergence is deliberate.

> [!NOTE]
> First point: the f389dd39 bug, third occurrence — complying with it destroyed the
> `[P5][readability] Slider snap-band` finding. Second point is a real catch, and a good one: the
> "fix" silently shrank the crash-screen heading from 32px to 28px in every non-crash render.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079053875) · 2026-07-25
15:27:25 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 58a085feef84 — [P2][design-tokens] `app.css` uses raw px/seconds where tokens exist and is outside the token ratchet

**Issue**

The `design` skill's hard rule \#2 is "no raw values where a token exists," and the same file
already uses tokens elsewhere (`var(--duration-base)` in `.modal-close-btn`'s transition,
`:169-172`). Yet a few lines down the icon-fill transitions are raw:

```css
.modal-close-icon svg { transition: fill 0.2s ease; }      /* :189 */
.corner-button        { transition: opacity 0.2s ease; }   /* :213 */
.corner-button-icon svg { transition: fill 0.2s ease; }    /* :226 */
```

`0.2s` is exactly `--duration-base`. Likewise `.modal-close-btn` hardcodes `top/right: 12px`
(`--space-3`), `padding: 10px`, `.corner-button { padding: 8px }` (`--space-2`). The `lint:tokens`
ratchet only scans **hex** in **`.svelte`** `<style>` blocks (`lint-token-styles.mjs:76`), so …

**Fix**

Swapped five raw values in `web/src/app.css` for their existing tokens — the three `0.2s`
transitions on `.modal-close-icon svg`, `.corner-button`, and `.corner-button-icon svg` become
`var(--duration-base)`, `.modal-close-btn`'s `top`/`right: 12px` become `var(--space-3)`, and
`.corner-button`'s `padding: 8px` becomes `var(--space-2)`. Each token resolves to the identical
value, so this is a zero-visual-diff refactor that brings the file in line with `.modal-close-btn`'s
transition, which already used the token.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5079905094) · 2026-07-25
18:28:15 UTC</sub>

### 39fe6752f6e0 — [P3][design-tokens] `Button` hardcodes `font-weight: 600` and a `1px` border with no system token

**Issue**

```css
.btn { ... font-weight: 600; ... }
.ghost { ... border: 1px solid var(--border); }
```

`600` and `1px` are raw. The token vocabulary has no font-weight or border-width scale at all, so
the same magic weight/hairline reappears uncontrolled across components (parent buttons, admin,
etc.). For a design system whose stated rule is "no raw values where a token exists," the gap is
that the tokens *don't* exist for two of the most-repeated values.

**Fix**

Added `borderWidth: '1px'` and `fontWeightSemibold: '600'` to the `scale` object in
`web/src/lib/design/tokens.ts`, regenerated `web/src/tokens.css` via `npm run gen:tokens`, and
switched `Button.svelte`'s `.btn` weight and `.ghost` border to `var(--font-weight-semibold)` /
`var(--border-width)`. Values are unchanged, so rendering is pixel-identical — only the authority
moves from literals into the token scale, which now has a home for the other ~48 raw sites a later
sweep can adopt.

*Revised before approval:* Addressed both review points on 47e6bbb489522e12eb7a685f3e7593b8fcad8fd3
in follow-up commit 470878fe933ea17fdd4f0c5df933a1c238a45183. (1) Added a `Border` row
(`--border-width`) and extended the `Type` row (`--font-weight-semibold`) in
`.ruler/skills/design/SKILL.md`, regenerating `.claude/skills/` and `.agents/skills/` via
`npm run ruler:apply` — `ruler:check` passes. (2) `/dev/design` now renders both tokens explicitly
(a font-weight row in the Type scale, a "Border width" subsection under Radius), following the
existing pattern for the other non-ramp scale keys. While writing the table I verified the weight
claim rather than asserting it: `web/src` has 32 `600`, 19 `700`, and 12 `500`, so the cell says 600
is the only weight with a token instead of the only non-normal weight. Gates: svelte-check 0 errors,
638 unit tests pass, eslint and format:check clean; no E2E spec covers /dev/design.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The design skill's "Token vocabulary" table (`.ruler/skills/design/SKILL.md:33-52`) still lists no
  font-weight or border-width group, so the two newly minted tokens are invisible to the one
  document agents consult before styling — the exact "the same magic weight/hairline reappears
  uncontrolled across components" gap the finding is about. Add `--font-weight-semibold` (Type row)
  and `--border-width` (its own row or Radius/Border row) to the table in
  `.ruler/skills/design/SKILL.md` and run `npm run ruler:apply` to regenerate `.claude/skills/` and
  `.agents/skills/`.
* `/dev/design` does not render the new tokens: `web/src/routes/dev/design/+page.svelte:31-35`
  selects scale keys by prefix (`space`/`radius`/`fontSize`/`shadow`/motion), so `borderWidth` and
  `fontWeightSemibold` fall through to nothing — contradicting the skill's claim that the styleguide
  "renders every token group and primitive from the real source objects" and its stated purpose of
  checking what exists before inventing a new value. Add rows for both to the styleguide page.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080097003) · 2026-07-25
18:46:08 UTC</sub>

## PR [\#549](https://github.com/KyleMit/Splotch/pull/549) — Continue audit burndown with Codex (2026-07-26)

### cc84909fd7cf — [P3][design-tokens] Honeycomb offset `31px` and picker paddings are un-tokenized repeated literals

**Issue**

`margin-left: 31px` is restated in every trim breakpoint (the honeycomb interlock offset) — over a
dozen copies of the same magic number. The `16px` picker padding equals `--space-4`;
`15px`/`-15px`/`-18px` row overlaps are geometry literals with no name. Changing the honeycomb
offset means editing ~15 lines.

**Fix**

Centralized the honeycomb indent in component-local `--hex-offset` and replaced the picker’s raw
padding with `--space-4`. Updated the geometry contract test to resolve the local offset and global
spacing token, preserving its CSS/TypeScript drift guard.

*Revised before approval:* Named the distinct 15px first-row and 18px later-row overlap magnitudes
as local custom properties, using the first value for both the picker cancellation and first-row
pull. Extended the geometry contract reader to resolve negated custom-property values so it
continues guarding the unchanged row pitch.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `ColorPicker.svelte` still leaves the picker’s `15px`, first-row `-15px`, and later-row `-18px`
  geometry as unnamed literals. The original finding explicitly includes these row overlaps; define
  the appropriate `--hex-row-overlap` custom property/properties and use them for all three
  declarations while preserving the distinct first-row and later-row geometry.

**E2E gate** — `tests/picker-trim.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/549#issuecomment-5083438807) · 2026-07-26
12:20:43 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### fdf1101b106e — [P4][design-tokens] Hardcoded brand RGB `171,113,225` fallback will silently drift from `--brand`

**Issue**

The tile-hover shadow carries the documented pre-`color-mix` fallback pattern —
`box-shadow: … rgba(171, 113, 225, 0.25)` before
`box-shadow: … color-mix(in srgb, var(--brand) 25%,
transparent)` — but the fallback bakes
`--brand`'s literal RGB into the component. Retune the brand token and below-floor browsers keep the
old color, with nothing linking the two. Proposed centralizing a `--brand-shadow`/`--brand-rgb`
token, or dropping the fallback if the compat floor no longer needs it; also flagged the raw
`4px`/`12px` offsets.

**State at triage (2026-07-27):** Unchanged at HEAD except line drift: the pair now sits at
`ColoringBook.svelte:294-295`. The literal appears at **seven** sites, every one an …

**Fix**

Derived `--brand-rgb` from the brand hex and rewired every brand-shadow fallback to use it, keeping
modern `color-mix()` rules intact. Updated compatibility and design-token guidance so fallback
behavior stays synchronized with brand retunes.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** —
`tests/flows-coloring-book.spec.ts tests/flows-ai.spec.ts tests/flows-palette-brush.spec.ts tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100296807) · 2026-07-28
05:23:45 UTC</sub>
