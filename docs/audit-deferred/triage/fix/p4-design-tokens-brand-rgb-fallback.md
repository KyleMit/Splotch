# Hardcoded brand RGB `171,113,225` fallback will silently drift from `--brand`

**Priority/category:** P4[design-tokens] · **Cluster:** C14 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/ColoringBook.svelte:296-298` — pinned at SHA f934d43
**Draft patch:**
`docs/audit-deferred/p4-design-tokens-hardcoded-brand-rgb-171-113-225-fallback-will-silently.patch`

## Verdict

**FIX — clear winner.** Mint a `--brand-rgb` triple in `tokens.ts`, *derived programmatically from
the brand hex* so it cannot drift, and rewrite every rgba fallback site as
`rgba(var(--brand-rgb), α)` — the fallback survives (custom-property support long predates
`color-mix`), the drift is killed at all seven sites at once, and both documentation claims the
draft falsified stay true. The draft's direction (delete the fallback) was wrong, not just
incomplete: several of the seven sites are selected-state/focus rings whose below-floor rendering
would vanish entirely.

## Original finding (condensed)

The tile-hover shadow carries the documented pre-`color-mix` fallback pattern —
`box-shadow: … rgba(171, 113, 225, 0.25)` before
`box-shadow: … color-mix(in srgb, var(--brand) 25%,
transparent)` — but the fallback bakes
`--brand`'s literal RGB into the component. Retune the brand token and below-floor browsers keep the
old color, with nothing linking the two. Proposed centralizing a `--brand-shadow`/`--brand-rgb`
token, or dropping the fallback if the compat floor no longer needs it; also flagged the raw
`4px`/`12px` offsets.

## Why it was deferred

Implementer failed to deliver a fix round. The draft simply deleted the rgba line at the one
ColoringBook site. Unresolved objections:

1. `ColoringBook.svelte:293` still hardcodes the `4px` offset and `12px` blur the finding said to
   tokenize against the elevation/spacing scale.
2. The removal falsifies two documented invariants: `docs/COMPATIBILITY.md` (the `color-mix` row:
   "plain-rgba declaration precedes each") and the brand comment in `web/src/lib/design/tokens.ts`
   ("each preceded by a plain-rgba fallback declaration for pre-color-mix engines").

## Current state of the code

Unchanged at HEAD except line drift: the pair now sits at `ColoringBook.svelte:294-295`. The literal
appears at **seven** sites, every one an rgba-before-`color-mix` fallback pair: `app.css:327`
(`.flyout-option.active` selection ring), `AdminConsole.svelte:499` and `AiImagePrompt.svelte:188`
(focus rings), `ActionsPanel.svelte:629,683`, `AiImageResult.svelte:359`, and the ColoringBook tile
hover. The compat floor (`docs/COMPATIBILITY.md`) is Chrome 111 / Safari 16.4, so `color-mix` (111 /
16.2) is within floor and the fallbacks are below-floor graceful degradation only — but the register
documents that degradation as a maintained invariant, and `tokens.ts:23-28` restates it. The finding
is real and untouched; its scope is actually 7×, not 1×.

## Options considered

1. **`--brand-rgb` triple, derived in `tokens.ts` (winner).** One token, seven mechanical rewrites,
   drift becomes impossible (the triple is computed from `brand.brand` at generation time, not
   hand-copied), below-floor behavior is preserved *and improved* (the fallback now tracks a brand
   retune), and the two documentation invariants stay true with a one-line wording touch each.
2. **Whole-shadow tokens (`--shadow-brand-hover` with the color-mix baked in).** Looks cleaner but
   **cannot work**: the two-declaration fallback breaks through `var()` indirection. On a
   pre-`color-mix` engine, a literal `box-shadow: … color-mix(…)` fails at *parse* time and the
   earlier rgba declaration wins; but `box-shadow: var(--shadow-brand-hover)` only fails at
   *computed-value* time, which resets the property to its initial value instead of falling back to
   the earlier declaration. The fallback line would become dead code on every engine.
3. **Delete the fallbacks (the draft, done completely — all 7 sites + doc rewrites).** Defensible
   under "anything older is not supported", but below the floor the flyout selection ring, two focus
   rings, and the hover shadows disappear outright instead of rendering in a stale tint — a strictly
   worse degradation for two lines of CSS per site — and it requires rewriting the COMPATIBILITY.md
   row and tokens.ts comment for negative value. Rejected.

## Recommendation

In `tokens.ts`, beside `brand`:

```ts
const brandHex = '#ab71e1';
const hexToRgbTriple = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

export const brand = {
  brand: brandHex,
  // Pre-color-mix fallback channel triple — derived from brandHex above so the
  // rgba fallbacks (see docs/COMPATIBILITY.md) can never drift from --brand.
  brandRgb: hexToRgbTriple(brandHex), // -> '171, 113, 225', emitted as --brand-rgb
  …
};
```

Run `npm run gen:tokens`, then at all seven sites:

```css
box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.25);
box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
```

What a resurrected attempt must do differently, per objection:

* **Objection 2 (docs falsified): dissolved by not removing the fallback.** Touch both texts anyway
  so they describe the new form: COMPATIBILITY.md's `color-mix` row → "a plain-rgba declaration
  (`rgba(var(--brand-rgb), …)` at the brand sites) precedes each"; the `tokens.ts` brand comment →
  note the fallbacks now derive from `--brand-rgb`. Register `--brand-rgb` in the design skill's
  Brand token row (edit `.ruler/skills/design/SKILL.md`, `npm run ruler:apply`).
* **Objection 1 (raw 4px/12px offsets): overrule it, on the record.** The elevation scale's tokens
  are *complete shadow literals* that embed their own geometry (`--shadow-sm` = `0 2px 6px …`,
  `--shadow-pop`, `--shadow-segment`); no offset ramp exists, minting one for a single hover shadow
  fails the skill's "a token must earn its place" rule, and option 2 above shows why the whole
  shadow can't be tokenized without killing the fallback. `0 4px 12px` is per-site shadow geometry
  exactly like every other brand-shadow site (ActionsPanel uses the same trio) — out of scope for
  this finding. Put a sentence to that effect in the PR so the next adversarial review meets the
  rebuttal instead of rediscovering the objection.

Verification: `npm run gen:tokens:check`; `grep -rn "171, 113, 225" web/src` returns nothing;
`run-splotch` visual check of the tile hover and flyout active ring in both themes (identical —
modern engines take the `color-mix` line, so nothing above the floor changes at all).

## Suggested next step

Discard the draft patch (a one-line deletion in the wrong direction) and re-stage in docs/AUDIT.md
with the `--brand-rgb` approach and the seven-site list above. Small mechanical PR; pairs naturally
with the C14 sibling ([issue \#565](https://github.com/KyleMit/Splotch/issues/565)) since both touch
the same stylesheet.
