# Duplicated 6-line mask gradient in AiConfetti

**Priority/category:** P5[readability] · **Cluster:** C03 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/AiConfetti.svelte:44-55` — pinned at SHA f934d43
**Draft patch:** none

## Verdict

**FIX — clear winner.** Hoist the gradient into one CSS custom property consumed by both the
prefixed and unprefixed mask declarations.

## Original finding (condensed)

`-webkit-mask-image` and `mask-image` on `.confetti-layer` each carry a byte-identical six-line
`radial-gradient(...)`. The vendor-prefix pair is required, but the full gradient body is
copy-pasted, so any tweak to the mask shape must be made twice and kept in sync by hand.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still present, now at `web/src/lib/components/AiConfetti.svelte:73-84`. The gradient has since been
*edited* — it went from literal `31%/41%` radii to
`ellipse var(--confetti-rx, 31%)
var(--confetti-ry, 41%)` fed by the parent (`AiImageResult.svelte`
sets both vars on `.ai-stage`) — and that edit had to be applied identically to both copies, which
is exactly the sync hazard the finding describes. The two blocks remain byte-identical.

Both declarations are still required at the compatibility floor (Chrome 111 / Safari 16.4,
`docs/COMPATIBILITY.md`): Chrome shipped unprefixed `mask-image` only in 120, so the floor build
needs `-webkit-mask-image`, and dropping either copy is not an option — deduplicating the *value*
is.

## Options considered

Only one shape seriously competes: a custom property holding the gradient. The alternative — leaving
it and relying on care — already cost one dual edit since the finding was filed. A Svelte `style:`
directive or JS-set property would trade a pure-CSS concern for template noise. Custom properties
are universal at the floor, and a `var()` nested inside the stored gradient
(`var(--confetti-rx, 31%)`) resolves normally at use time.

## Recommendation

On `.confetti-layer`, define the gradient once and reference it twice:

```css
.confetti-layer {
  --confetti-mask: radial-gradient(
    ellipse var(--confetti-rx, 31%) var(--confetti-ry, 41%) at 50% 50%,
    transparent 0,
    transparent 95%,
    #000 100%
  );
  -webkit-mask-image: var(--confetti-mask);
  mask-image: var(--confetti-mask);
}
```

Keep the existing comment block explaining the dial hole and the `--confetti-rx`/`--confetti-ry`
contract. Verification is unchanged from the finding: the mask hole renders identically in WebKit
and Blink/Gecko, and the `webkit-smoke` E2E path stays green.

## Suggested next step

Re-stage in `docs/AUDIT.md` as-is (with the updated line numbers) — a five-minute mechanical change
whose payoff was already demonstrated by the parameterization edit that had to be made twice.
