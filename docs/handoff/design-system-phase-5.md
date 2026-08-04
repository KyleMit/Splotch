# Handoff — design system phase 5

> 2026-08-04 · branch `feat/design-system-phase-5-handoff` · continue the design-system tightening:
> the component layer (segmented-picker primitive, primitive adoption) and the guardrail extensions

## Objective & non-goals

Phases 1–4 of the design-system overhaul are **merged** (PRs 749–753, bottom-up, all review findings
resolved; issue 565 closed). This packet hands off what remains: the **component layer** and the
**guardrails** that keep the finished token work from eroding.

Non-goals — do not reopen:

* The token vocabulary itself. ADR-0097 (plus its in-PR amendments) is the settled decision;
  re-pruning or re-adding steps needs a new owner conversation, not a resume.
* The light-only pages (`/admin`, `/privacy`, `/android-beta`). Their design pass is done and the
  ADR-0071 carve-out (no themed tokens, no themed primitives) was honored and re-confirmed in
  review. Don't migrate them to themed tokens.
* Dark theme for those pages — considered and declined (owner decision, ADR-0071 amendment).

## State

Starting clean from `main` at 9a8196a (the PR 753 merge). No in-flight diff — this handoff is a work
queue with context, not a half-finished change. The merged arc, newest first:

| PR  | What landed                                                                        |
| --- | ---------------------------------------------------------------------------------- |
| 753 | All 11 review findings from the 749/751/752 reviews; finished issue-565 per-value  |
|     | reconciliation; `zIndexUsage`; `/design` phone layout + overflow assertion;        |
|     | direct contrast assertion in `a11y.spec.ts`                                        |
| 752 | Mixed-file sweeps (SettingsModal, SetupInstructions, CompactShell, ColoringBook,   |
|     | AiImageResult); duration reconciliation; admin exact-match spacing                 |
| 751 | PageShell family onto the ramp; minted `--font-size-display`                       |
| 750 | `/privacy` rebuilt on PageShell; `/admin` declared palette (`adminPalette.css`);   |
|     | hex ratchet extended to plain `.css` files                                         |
| 749 | ADR-0097 token pruning; `tokenUsage.ts` guidance layer; `/design` defaults callout |

## Next work, in the order recommended to the owner

1. **Issue 748 — extract the segmented-picker primitive** (the one item ADR-0097's consequences
   still list as open). Four hand-rolled selected-state controls with three different markups: theme
   picker (`settings/AppearanceSection.svelte`, radiogroup), orientation segment
   (`settings/CompactShell.svelte`, aria-pressed), controls chips
   (`settings/ControlsSection.svelte`), and `/design`'s own theme toggle
   (`routes/design/+page.svelte` — note its inner options still carry a raw `border-radius: 9px`).
   The issue body has the full spec: tokens-only styling, `--shadow-control` thumb, radiogroup vs
   aria-pressed modes, register in the design skill's primitives table + render on `/design`.
   `pr-screenshots` applies (all states, both themes).
2. **`Button`/`StatusMessage`/`Disclosure` adoption beyond the Settings subtree** on themed surfaces
   — candidates: ColoringBook's buttons, the `/dev` harness routes' hand-rolled buttons
   (`routes/dev/ai-timer/+page.svelte` still styles its own). `/admin` stays excluded (carve-out).
3. **Extend `lint:tokens` to ratchet raw `font-size`** (and consider `box-shadow`) the way it
   ratchets hex — cheap now the sweeps are done. Follow the existing pattern in
   `scripts/lint-token-styles.mjs` (per-file baseline with reasons; the `.css` scan and the
   `countRaw*Css` seams from PR 750/753 show the shape). Baseline the deliberate stragglers:
   BrandMark's 10px lockup, AiImageResult's 48/36px emoji, the admin off-ramp values.
4. **The `/design` recipes section** — deferred from phase 1: 4–5 composed specimens (a card, a form
   row, a status banner, a CTA) showing tokens combined, as a new styleguide partial.
5. Housekeeping: `/prune-remote-branches` — the five merged feature branches plus
   `claude/design-system-guidance-lkeq6g` are still on origin. `pr-assets` is **not** dead: it hosts
   the merged PRs' screenshots (ADR-0046) — keep it.

## Decisions made (and why) — don't re-litigate

* **`--brand` never carries text**; labeled fills use `--brand-solid`(+`-hover`), textless `--brand`
  fills hover to `--brand-solid`. Five separate violations were found and fixed across the phases;
  `a11y.spec.ts`'s computed-contrast test guards the Settings nav path directly because axe files
  the dialog's contrast checks under `incomplete` (bgOverlap).
* **Weight 500 stayed** (as `--font-weight-medium`) — it's the genuine label weight; the audit's
  retire-500 idea was rejected on evidence.
* **The warm family stayed** — themed tokens can't demote to local custom props (they'd lose the
  theme flip), and they carry the paper aesthetic.
* **Motion rule keys on what the motion *is***, not the CSS mechanism: control-state motion pairs a
  curve with a duration token; tuned one-shot choreography (celebration keyframes, the AI reveal,
  polaroid flight, gesture feedback) carries its own timing. Skill and `/design` carry identical
  text — keep them identical when editing either.
* **`fontSizeDisplay` is a display tier above the six body steps**, PageShell-hero only — don't
  spread it to in-app surfaces (`/design`'s H1 stays `--font-size-2xl`).
* **A new token needs three registrations**: `tokenUsage.ts` entry (compiler-enforced), the design
  skill's vocabulary table, and rendering on `/design`.
* Review-fix process note: the 749/751/752 review remediations were stacked as one PR (753) with one
  commit per finding, replies with bare SHAs, threads resolved — the owner-preferred flow if another
  review round arrives.

## Unverified assumptions

* Issue 748's claim that `--shadow-segment` consumers map cleanly into the primitive — the token is
  now `--shadow-control` and also covers the modal close disc, so the primitive should *reference*
  it, not absorb it.
* The `/dev` harness routes were never fully swept for primitive adoption; assumed low-risk but
  nobody has inventoried them since phase 1.
* `pr-assets` image URLs in the merged PR bodies keep rendering only while that branch lives —
  assumed but not re-verified after the merges.

## Done & verified (this session, before the merges)

Every phase ran the full gauntlet before push: `gen:tokens:check`, `svelte-check` (0/0), `eslint`,
`format:check` (prettier + dprint), `lint:tokens`, 1054 unit tests, and the relevant E2E suites
(a11y incl. the new contrast test, design incl. the overflow test, flows-settings,
flows-coloring-book, clear-tutorial, admin, page, feedback, android-beta — all green). CI was green
on every PR at merge. Nothing here is un-run.

## Risks & next 3 steps

Risks: the segmented-picker extraction touches four live controls with different a11y semantics —
regression risk concentrates in `flows-settings.spec.ts` and `design.spec.ts`; the font-size ratchet
will surface stragglers that need judgment (baseline them with reasons, don't silently bump).

Next three steps for the resuming session:

1. Read issue 748, then the four picker implementations; design the primitive's prop surface before
   touching any call site.
2. Build it in `lib/components/design/`, adopt at the four sites, register everywhere (skill table,
   `/design`, `skills-guide` untouched — it's a primitive, not a skill).
3. Screenshot all states/themes per `pr-screenshots`, run the gauntlet, PR it solo (no stack needed
   now that main carries everything).

## Reread first

* Issue 748 (the spec) · ADR-0097 (`docs/adrs/0097-prune-token-vocabulary-add-usage-rules.md`)
* The `design` skill (rewritten this session — vocabulary, rules, primitives table)
* `web/src/lib/design/tokenUsage.ts` (the guidance layer + its Record-enforcement pattern)
* `scripts/lint-token-styles.mjs` (ratchet shape for step 3)
* `docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md` (pr-assets flow, if screenshots)
