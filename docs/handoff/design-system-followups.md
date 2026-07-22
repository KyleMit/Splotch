# Handoff — design-system follow-ups

> 2026-07-22 · branch `feat/design-system` · PR [#464](https://github.com/KyleMit/Splotch/pull/464)
> · After the token-scaffold PR merges: migrate legacy raw style values to tokens, add the raw-hex
> lint gate, extract the next primitives, flip ADR-0071 to Active.

## Objective & non-goals

**Objective.** Finish what PR #464 scaffolded: (1) migrate the ~119 raw color literals (plus
off-ramp radii/font sizes) in component `<style>` blocks to the tokens in
`web/src/lib/design/tokens.ts`, as **same-value swaps with zero visual change**; (2) once the legacy
count is small, add a CI gate against new raw hex in component styles; (3) extract the next
primitive(s) when the third-duplicate rule triggers; (4) flip ADR-0071's status from Proposed to
Active.

**Non-goals.** No visual redesign — migration commits must be pixel-identical. No external
design-system/Tailwind adoption (rejected in ADR-0071). Don't token-ize the genuine one-offs:
polaroid frame chrome (`app.css` `.polaroid-*`), confetti colors (`AiConfetti`), canvas ink,
`ClearButton`'s deliberately unthemed red (see the ADR + `tokens.ts` header comments). Don't touch
`web/src/tokens.css` by hand — ever.

## State

Everything below assumes PR #464 **merged to main**; beyond the scaffold, the branch carries only
this handoff and a clean merge-back of main.

| sha       | what                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `370c44d` | The whole scaffold: tokens.ts + gen-tokens.mjs + tokens.css, Button, /dev/design, skill, ADR-0071, CI gate                                                                                                                                                         |
| `021e19b` | Review fixes (via PR \#467 into the branch): Button class-merge, polaroid `--ease-glide`, `web/src/lib/design/tokens.test.ts` (toCssVarName + var-name shape), styleguide theme-toggle init from `data-theme`, skill note that nothing auto-regenerates tokens.css |
| `22dd134` | This handoff                                                                                                                                                                                                                                                       |
| `4dad04d` | Merge of origin/main (`9b186b2`, the \#468 test-suite changes) back into the branch — **zero conflicts**; CI green on this exact sha                                                                                                                               |

Scaffold files (all in #464): `web/src/lib/design/tokens.ts`, `scripts/gen-tokens.mjs`,
`web/src/tokens.css` (generated), `web/src/app.css` (token blocks removed), `web/src/lib/theme.ts`
(derives from tokens), `web/src/lib/components/design/Button.svelte`, `web/src/routes/dev/design/`
(styleguide), `.ruler/skills/design/SKILL.md` (+ generated copies),
`docs/adrs/0071-design-token-single-source.md`, `.github/workflows/test.yml` (Design-token drift
step), `package.json` (`gen:tokens`, `gen:tokens:check`).

**Migration worklist** — raw color literals (`#hex` + `rgb/rgba(`) inside `<style>` blocks, counted
2026-07-22, total ≈119 hex + assorted rgba; recount with the one-liner in *Reread first*:

| count | file                                                                                                     | notes                                                        |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 52    | `lib/components/admin/AdminConsole.svelte`                                                               | biggest win; admin-only surface, low regression risk         |
| 34    | `lib/components/ClearButton.svelte`                                                                      | mostly the *deliberate* unthemed red — migrate only neutrals |
| 15    | `lib/components/DrawingCanvas.svelte`                                                                    | paper/margin shades — several likely map to existing tokens  |
| 12    | `routes/dev/ai-timer/+page.svelte`                                                                       | dev harness, zero user risk — good warm-up                   |
| 8     | `lib/components/ActionsPanel.svelte`                                                                     | careful: paper-float treatments are intentional one-offs     |
| 7     | `routes/privacy/+page.svelte` · `AiImageResult.svelte`                                                   | —                                                            |
| ≤6    | ErrorScreen, ColorPicker, AiDial, ParentCenter, InstallBanner, ColorPalette, AiConfetti (skip), parent/* | long tail                                                    |

Radii/font-size/easing literals weren't per-file counted — sweep them in the same pass per file
(`grep -E 'border-radius: [0-9]|font-size: [0-9]|cubic-bezier'` inside the style block).

## Decisions made (and why)

All recorded in **ADR-0071** — read it before re-deciding anything. Highlights that bind this work:

* TS is the source, CSS is generated (`gen:tokens`); the `ThemeTokens` interface is the light/dark
  parity guarantee. JS consumers import `$lib/design/tokens` — never paste a hex into TS.
* Migration is **incremental and same-value**: swap what you touch, don't mass-migrate in feature
  PRs; a dedicated migration PR per component-cluster is fine (that's this handoff).
* A raw value that maps to no existing token: prefer snapping to the nearest ramp step **only if
  visually identical intent** (e.g. `10px` radius → decide with the user or keep raw + comment);
  minting a new token needs 2–3 real uses (skill: "Adding a token").
* Primitive extraction waits for the third duplicate. Candidates spotted but *not yet extracted*:
  Card/Surface (setting cards in `parent/*` + admin panels), a text-input/field wrapper
  (`AiKeyManager`, `ReportForm`, admin forms).
* **OPEN — decide before migration starts: `--text-*` naming overlap.** The theme *colors*
  `--text`/`--text-strong`/`--text-muted` share a prefix with the type-scale *sizes*
  `--text-xs..3xl`. Flagged to the user pre-merge (options: keep as-is, or rename the size ramp to
  `--font-*`); no decision was made. Renaming is a 5-minute change while usage is only
  `app.css`/Button/styleguide — settle it in step 1, because every migrated file makes it more
  expensive.

## Unverified assumptions

* **PR #464 is assumed merged — verify first.** If it isn't, this branch is the open PR and the
  follow-up work should stack elsewhere. If it merged, restart the working branch from origin/main
  per the repo's merged-PR rule.
* The per-file counts above are from a quick grep (style blocks only, `#hex|rgba(`) — treat as a
  map, not a spec; some hits are legit one-offs (gradients, canvas chrome).
* "ClearButton red is deliberately unthemed" is asserted by old app.css comments + ADR-0052; the
  exact set of ClearButton literals that should *stay* raw hasn't been audited line-by-line.
* The lint-gate approach (stylelint vs. a grep script in CI) was never prototyped — open choice.
  Repo precedent favors a small Node script + npm `*:check` (like `img:audit:check`).

## Done & verified (this container, 2026-07-22, on the merged result `4dad04d`)

* `npm run gen:tokens:check` ✓ · `npm run check` 0 errors · `npm run lint` 0 errors ·
  `npm run format:check` ✓
* `npm run test:unit` 439 passed · `npm run test:e2e` 152 passed · `npm run build` ✓ (build ran
  pre-merge at `370c44d`; main's incoming changes were test-config only)
* GitHub CI green on `4dad04d` (Quality + Tests jobs) · Codex review at `f47b7fd`: "no major issues"
  · adversarial Claude review already folded in as `021e19b`
* Token parity: parsed every `--*` custom property from pre-change app.css vs generated tokens.css —
  zero missing, zero value drift, 28 additive scale tokens.
* `/dev/design` renders correctly in light + dark (screenshots in PR #464 body; theme toggle
  verified by stamping `data-theme`).
* **Known flake, not this branch:** `picker-trim.spec.ts` "phone portrait keeps all 9 families
  (390×844 → 9×4)" failed once in a full-suite run, then passed in isolation and on a full rerun.
  The spec was just modified on main (\#468). If it fails again, suspect suite parallelism there —
  don't burn time blaming the token diff.

## Risks & next 3 steps

Risks: silent visual drift during migration (mitigate: per-component commits + before/after
screenshots via `run-splotch`, and eyeball `/dev/design` + the touched surface in both themes);
near-miss values wrongly snapped to a ramp step (when in doubt keep the raw value and flag it);
`ClearButton`/`ActionsPanel` intentional one-offs getting "fixed".

1. **Verify #464 merged**, restart the branch from origin/main, then in the first commit: flip
   ADR-0071 to Active (index row in `docs/adrs/README.md` too) and **settle the `--text-*` naming
   question** (see the OPEN decision above — ask the user if they haven't said).
2. **Migrate in risk order:** `routes/dev/ai-timer` (warm-up) → `AdminConsole` → the long tail →
   `DrawingCanvas`/`ActionsPanel`/`ClearButton` last (each needs the one-off audit). One commit per
   file/cluster, before/after screenshots for user-facing surfaces.
3. **Add the raw-hex gate** once counts are near zero: `scripts/` Node script +
   `npm run
   lint:tokens`-style `*:check` wired into the Quality job, with an explicit allowlist
   for the documented one-offs; then update the `design` skill's Migration-status section (it
   currently says "older components still carry raw values") via `.ruler/` + `ruler:apply`.

## Reread first

* `.claude/skills/design/SKILL.md` — the rules this work must follow (esp. Hard rules + Adding a
  token).
* `docs/adrs/0071-design-token-single-source.md` — decisions + rejected alternatives.
* `web/src/lib/design/tokens.ts` — the vocabulary; per-token doc comments name the intentional
  one-offs.
* `.claude/rules/svelte.md` — scoped-style rules; `web/src/app.css` header — what stays global.
* Recount worklist:
  `for f in $(find web/src/lib/components web/src/routes -name '*.svelte'); do n=$(sed -n '/<style/,/<\/style>/p' "$f" | grep -coE '#[0-9a-fA-F]{3,8}\b|rgba?\(' ); [ "$n" -gt 0 ] && echo "$n $f"; done | sort -rn`
* Screenshot flow: `run-splotch` + `pr-screenshots` skills (pr-assets orphan branch).
