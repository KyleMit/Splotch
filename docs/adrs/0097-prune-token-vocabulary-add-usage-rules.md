# ADR-0097: Prune the token vocabulary and attach a usage rule to every token

**Status:** Active — the "kept deliberately" carve-outs for `--surface-warm-hover` and
`--float-shadow-flyout` are superseded by [ADR-0098](0098-second-token-prune-consolidated-ramps.md),
which also folded `--radius-xl`, `--font-size-2xl`, `--slider-track`, `--icon-muted-hover`, and
`--success-accent` into their nearest neighbors. **Date:** 2026-08

## Context

Publishing the styleguide (ADR-0096) exposed the design system's real problem: the vocabulary was
roughly twice the size of its usage, and nothing told a contributor what to reach for. A usage audit
found a dead token (`--brand-tint-filter`, zero consumers), five elevation tokens with nine total
call sites, a weight "ramp" adopted in exactly one file against 88 raw declarations, two competing
hover ramps for the one brand accent, a five-step text-gray ramp whose steps were used side by side
in the same files with no discernible rule, and a seven-step type ramp that missed the app's most
common actual size (17 raw `15px` declarations sat in the 14→16 gap). The styleguide rendered every
token value-first, with no "use this when" — so contributors picked by eyeball, and 37% of font-size
declarations bypassed the ramp entirely.

Two of the near-duplicates were guarded by "don't converge without design review" comments in
`tokens.ts` (`--ease-pop` vs `--ease-pop-strong`, `--shadow-sm` vs `--shadow-segment`). By the time
of the audit each pair's "base" member had a single consumer; this ADR is that review.

## Decision

**Prune to what earns its place, then attach a rule to every survivor.**

The pruned vocabulary (same-value merges except where noted):

* **Type: six body steps plus one display tier, one role each** — `--font-size-xs/sm/md/lg/xl/2xl` =
  12/14/16/18/22/28px (fine print · UI chrome · body prose · ledes/section heads · modal titles ·
  page H1s). The old 13px `sm` step folded into 14 (its consumers grew 1px); every other name
  shifted down one slot at the same value. `--input-font-size` keeps carrying the ADR-0076 iOS
  floor, and `--font-size-display` (fluid 34–46px) is the standalone parent pages' PageShell hero
  above the body ramp.
* **Weights: fully tokenized, not reduced** — `--font-weight-medium/semibold/bold` (500/600/700),
  with 400 as the untokenized body default. The audit initially suggested retiring 500, but 500 is
  the app's genuine label weight (19 coherent uses across settings rows); the defect was
  namelessness, not existence.
* **Text grays: three steps** — `--text-strong` · `--text` · `--text-soft`. `--text-soft` takes the
  old `--text-mid` values (#666 light / #b3b1bf dark), the step already pinned to hold 4.5:1 at
  small sizes, so the merge of `--text-mid/-muted/-faint` could only increase contrast.
* **Brand: one hover ramp** — `--brand-hover` and `--brand-tint-filter` deleted. A labeled brand
  fill rests on `--brand-solid` and hovers to `--brand-solid-hover`; a textless `--brand` fill
  hovers to `--brand-solid`. This also fixed a real WCAG failure: the controls chips carried white
  labels on `--brand` (3.4:1).
* **Elevation: one small-control shadow** — `--shadow-sm` and `--shadow-segment` merged into
  `--shadow-control` at the segment value (the modal close disc's lift tightened slightly). The
  themed `--float-shadow` pair and `--shadow-pop` stand.
* **Easing: two curves** — `--ease-pop-strong`'s springier curve became the one `--ease-pop`;
  anything that pops in or celebrates shares it, `--ease-glide` covers settles and exits. The old
  softer pop had one consumer (the dialog fly-in, now slightly springier).
* **Radius: no xs step** — inline chips round at `--radius-sm`; controls md, cards lg, sheet-scale
  surfaces xl.
* **Kept deliberately** despite low counts: the warm family (`--border-warm/-warm-strong`,
  `--surface-warm-hover`) — it is themed (a local custom property cannot flip with the theme) and
  carries the paper-adjacent chrome aesthetic; and `--float-shadow-flyout`, the flyout's stronger
  themed lift.

**Every token now carries a one-line usage rule** in `web/src/lib/design/tokenUsage.ts`, typed as
complete `Record`s over the token key unions so the compiler rejects an undocumented token. The
styleguide renders the rule beside each specimen, and `/design`'s Foundations opens with a defaults
callout ("Not sure? Start here"). The rules live in a separate module, imported only by the
styleguide partials, so the guidance strings never enter the drawing route's bundle.

## Consequences

* Visible changes accepted as deliberate tightening: 13px UI text grew to 14px; the old
  `--text-muted`/`--text-faint` consumers darkened to the AA-safe soft step; selected chips deepened
  to `--brand-solid` (the a11y fix); the modal close disc's shadow tightened; the dialog fly-in
  gained a touch of spring; small code chips round at 8px.
* The two "don't converge" comments in `tokens.ts` are superseded by this review.
* Adding a token now has one more gate: no usage rule in `tokenUsage.ts`, no compile. The vocabulary
  table in the `design` skill and the `/design` page remain the other two registration points.
* The audit's remaining findings were downstream work, not part of this decision; the follow-up
  passes have since landed them — the light-only pages' design pass (weights included), the
  PageShell family's move onto the ramp (which added the display tier above the six body steps), and
  the duration reconciliation. Primitive adoption beyond the Settings subtree remains open.
