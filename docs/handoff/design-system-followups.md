# Handoff — design-system follow-ups (round 2)

> 2026-07-22 · branch `claude/design-system-unification-remaining-jawg2v` · Close out the
> design-system unification: fix [#475](https://github.com/KyleMit/Splotch/issues/475) (mint the
> three surviving one-off tokens), document the /admin + /privacy light-only decision so it stops
> resurfacing, file the primitive-extraction candidates as an issue, fix the picker-trim flake
> [#469](https://github.com/KyleMit/Splotch/issues/469).

## Objective & non-goals

**Objective.** Four items, in priority order:

1. **Fix [#475](https://github.com/KyleMit/Splotch/issues/475)** — the three raw values that cleared
   the 2–3-use minting bar (full spec + done-when in the issue body):
   * `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot, 7× in AiImageResult / ClearButton / ColorPalette
     → mint `--ease-pop-strong` (same-value, zero visual change). Converging them on the existing
     `--ease-pop` (`0.34, 1.4, …`) is a *visible* animation change — don't do it without showing the
     user.
   * `#fff` on `--brand` fills, 9+× (Button, ErrorScreen, InstallBanner, ParentCenter, `parent/*`
     sections) → mint an unthemed `--on-brand`. The ratchet baseline in
     `scripts/lint-token-styles.mjs` tags every entry in this cluster ("Candidate for a future
     --on-brand token") — drop those baseline entries to zero as they migrate.
   * `#4caf50` confirmation green, 2× (AiImageResult download-done, SetupInstructions check) — sits
     beside but differs from `--success-text` (`#2e7d4f`). Default: mint a same-value token (e.g.
     `--success-accent`); converging on `--success-text` is a visual change needing user sign-off.
   * Done when: token (light/dark values where themed) or recorded stay-raw WHY comment for each;
     `npm run gen:tokens` regenerated; `npm run lint:tokens` baseline lowered; `/dev/design` shows
     the new tokens. Close the issue.
2. **Document: /admin and /privacy will never get a dark theme** — user decision, 2026-07-22 ("admin
   / privacy do not need a dark mode"). This must land somewhere durable so the question doesn't
   come up again:
   * Amend ADR-0071 (`docs/adrs/0071-design-token-single-source.md`) with a short "Light-only
     surfaces" note recording the decision (use `/update-adrs` or edit + index by hand).
   * Update the `design` skill's Migration-status wording from open-question phrasing to settled
     ("deliberately light-only; a dark theme was considered and declined") — edit
     `.ruler/skills/design/SKILL.md`, run `npm run ruler:apply`, commit generated copies.
   * The ratchet baseline comments for `AdminConsole.svelte` / `routes/privacy` already say
     "light-only" — leave them, they now have an ADR to point at.
3. **File a GitHub issue for the primitive-extraction candidates** (durable TODO → issue, not this
   handoff): Card/Surface (setting cards in `parent/*` + admin panels) and a text-input/field
   wrapper (AiKeyManager, ReportForm, admin forms). Both were spotted during PR #464 but never
   filed; extraction itself waits for the third-duplicate rule (design skill). Label per
   `docs/ISSUE-WORKFLOW.md` (`type:chore`, `area:ux`).
4. **Fix [#469](https://github.com/KyleMit/Splotch/issues/469)** — make `openPickerAt`'s
   animation-settle wait in `web/tests/picker-trim.spec.ts` deterministic
   (`dialog.getAnimations().map(a => a.finished)` is the issue's preferred fix). Test-infra, not
   design-system — do it last or split to its own branch/PR if the diff gets noisy.

**Non-goals.** No visual redesign — token mints are same-value swaps; any convergence (easing,
green) is opt-in with user review. **No dark theme for /admin or /privacy — decided against, don't
re-open it.** No new primitives in this pass (filing the issue is the deliverable). Never hand-edit
`web/src/tokens.css`, generated `CLAUDE.md`/`AGENTS.md`, or `.claude/skills/` (ruler/gen owns them).

## State

Everything from the design-system arc is **merged to main** (`ef8c636`, PR #472); this branch is at
main + this handoff only. No open design-system PR. Prior handoff (`design-system-followups.md`,
round 1) was consumed and deleted in `c6d97e1` — this file is its successor, scoped to what
survived.

| sha       | what (all on main)                                                            |
| --------- | ----------------------------------------------------------------------------- |
| `370c44d` | Scaffold: tokens.ts, gen-tokens.mjs, Button, /dev/design, ADR-0071 (PR #464)  |
| `021e19b` | Review fixes on the scaffold (PR #467)                                        |
| `d4243e0` | `--text-*` → `--font-size-*` rename                                           |
| `8e5e962` | Raw-hex ratchet gate (`npm run lint:tokens`, `scripts/lint-token-styles.mjs`) |
| `b0c4a17` | Ratchet hardened per review (last commit of PR #472)                          |

Key files for this work: `web/src/lib/design/tokens.ts` (add tokens here),
`scripts/lint-token-styles.mjs` (BASELINE map to lower), `.ruler/skills/design/SKILL.md` (skill
source), `docs/adrs/0071-design-token-single-source.md`, `web/src/routes/dev/design/` (styleguide),
`web/tests/picker-trim.spec.ts` (#469).

## Decisions made (and why)

* **/admin + /privacy stay light-only, permanently** — user, 2026-07-22. They keep self-contained
  palettes exempt from themed tokens (themed tokens flip with `data-theme` and would half-dark-theme
  them). Task 2 exists precisely to make this decision findable.
* **Mint, don't converge, by default** (`--ease-pop-strong`, the green): the migration's invariant
  is pixel-identical swaps (ADR-0071); convergence changes visuals and needs user eyes first.
* Hex-only ratchet scope, allowlist-as-baseline, `#fff`-cluster tagging — all decided in PR #472;
  rationale in the header comment of `scripts/lint-token-styles.mjs`. Don't re-litigate.
* Prior arc decisions (TS-source tokens, generated CSS, incremental same-value migration, no
  Tailwind) are in ADR-0071 — read before re-deciding anything.

## Unverified assumptions

* The use-counts in #475 (7× easing, 9+× `#fff`-on-brand, 2× green) are from the PR-#472 session —
  recount before editing (`grep -rn 'cubic-bezier(0.34, 1.56'` / `'#fff'` / `'#4caf50'` under
  `web/src/lib/components` + `web/src/routes`, style blocks only).
* `--on-brand` as *unthemed* (same `#fff` in light and dark) is the issue's suggestion, not a
  verified design decision — check how `--brand` itself behaves across themes in `tokens.ts` before
  committing to the shape.
* #469's failure mechanism (rAF frames coalescing under CPU starvation → settle loop exits during
  fly-in) is a plausible hypothesis from the issue, never reproduced under instrumentation. The fix
  should be deterministic regardless, but "done when" requires repeated full-suite green runs.
* No check was run this session beyond read-only inspection — treat all test/build state as unknown
  until you run the suite.

## Done & verified (this session, 2026-07-22, read-only)

* ADR-0071 status is **Active** on main; `/dev/design`, Button, tokens.ts, ratchet all present.
* `design` skill Migration-status says the legacy migration is done — confirmed against a fresh
  raw-literal recount (remaining hexes match the ratchet BASELINE map's documented one-offs).
* Branch `claude/design-system-unification-remaining-jawg2v` was 0 commits ahead of origin/main
  before this handoff.
* Issues #475 and #469 are open with full specs in their bodies. No issue exists for the primitive
  candidates (searched open issues).
* **No build/test/lint commands were run** — nothing beyond the above is verified.

## Risks & next 3 steps

Risks: converging instead of minting slips in a visual change (mitigate: same-value mints,
before/after screenshots via `run-splotch` for anything that isn't); baseline edits that loosen the
ratchet instead of lowering it (a count *below* baseline must lower the number, never delete the
gate); forgetting `npm run ruler:apply` after the skill edit (CI drift gate fails); GitHub MCP
truncates issue #475's body at its `<style>` tag — fetch the web page or read the quotes above.

1. Recount the three #475 clusters, mint `--ease-pop-strong` + `--on-brand` + the green token in
   `tokens.ts`, `npm run gen:tokens`, swap usages, lower the ratchet baseline, add them to
   `/dev/design`; run `npm run check` + `npm run lint:tokens` + unit tests; screenshot `/dev/design`
   both themes.
2. Amend ADR-0071 with the light-only decision + update the design skill via `.ruler/` +
   `ruler:apply`; file the primitives issue.
3. Fix #469 with an animation-finished wait; prove with repeated e2e runs (`--repeat-each` on
   picker-trim + full suite); then full `npm test` and PR per `pr-screenshots`.

## Reread first

* [#475](https://github.com/KyleMit/Splotch/issues/475) and
  [#469](https://github.com/KyleMit/Splotch/issues/469) — the specs live there, not here.
* `.claude/skills/design/SKILL.md` — Hard rules, "Adding a token", Migration status (the section
  task 2 edits — via its `.ruler` source).
* `docs/adrs/0071-design-token-single-source.md` — binding decisions; the ADR task 2 amends.
* `scripts/lint-token-styles.mjs` — header comment + BASELINE map (the `#fff` cluster entries).
* `web/src/lib/design/tokens.ts` — token vocabulary + one-off doc comments.
* `web/tests/picker-trim.spec.ts` (`openPickerAt`) + PR #468 — for #469.
