# README scoreboard and "do first" list are stale — most ideas already graduated into the live pipeline, but nothing here says so

**Priority/category:** P1[discoverability] · **Cluster:** C16 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/ideas-exploration/README.md` lines 28–75 — pinned at SHA
f934d43 **Draft patch:**
docs/audit-deferred/p1-discoverability-readme-scoreboard-and-do-first-list-are-stale-most-id.patch

## Verdict

**FIX — clear winner.** The README is still stale at HEAD, but the disposition facts it needs now
live in the per-report Status lines added since the pinned SHA. Rewrite the README to derive from
those lines instead of re-applying the draft, whose disposition table now contradicts them.

## Original finding (condensed)

The ideas-exploration README presents all 25 ideas as an open backlog "intended for a follow-up
session to review and decide what to promote," with a prioritized "do first" list of patches to
land. That follow-up already happened — most ideas shipped into `bin/`/`lib/` or were closed by the
gemini-3.1 regeneration wave — so a newcomer reading the README would re-do finished work.

## Why it was deferred

Failed adversarial review, three rounds. The reviewer's objections were about disposition *facts*,
not the approach: the intro sentence "nothing from these experiments is live" was left untouched;
rows 4, 6, and 22 were classified LANDED when their deliverables never shipped; rows 1 and 5 needed
a SUPERSEDED status; derived counts were wrong after reclassification; the stale pointer in
`tools/asset-gen/.ruler/AGENTS.md` ("several carry finished patches/assets waiting to be promoted")
was never fixed; and idea-24's Status path was repo-root-relative while every other path was
README-relative.

## Current state of the code

The finding still holds at HEAD, but the ground shifted materially since f934d43:

* Commits e44fafb and b49ff0d (2026-07-27) added a curated `Status:` disposition line to the top of
  **every** `idea-N/report.md` — a three-value vocabulary of **LANDED** (13: ideas 2, 7, 10, 11, 12,
  13, 17, 19, 21, 22, 23, 24, 25), **NOT PROMOTED** (7: ideas 1, 4, 5, 6, 15, 16, 20), and **OPEN**
  (5: ideas 3, 8, 9, 14, 18), each with README-relative pointers to the live file, run record, or
  still-open gap. These lines already encode the corrected facts the reviewer demanded (idea-4 and
  idea-6 NOT PROMOTED; idea-22 reframed accurately: the composite view is the Combined layer of
  `bin/gen-coloring-book-proof-sheet.mjs`, the standalone CLI was not promoted).
* `tools/asset-gen/ideas-exploration/README.md` itself is essentially unchanged: lines 7–12 still
  say "nothing from these experiments is live in the pipeline … intended for a follow-up session to
  review and decide what to promote"; the scoreboard (lines 30–58) has no Status column; the "What a
  follow-up session should probably do first" list (lines 60–77) is intact.
* `tools/asset-gen/.ruler/AGENTS.md` (and its generated `CLAUDE.md`/`AGENTS.md`, line ~127) still
  says "24 of 25 ideas were validated there, and several carry finished patches/assets waiting to be
  promoted" — the stale claim the reviewer flagged.

So the finding is now *narrower*: the per-idea dispositions exist and are correct; only the README
(the entry point the CLAUDE.md orientation sends readers to) and the `.ruler/` pointer still tell
the pre-promotion story.

## Options considered

1. **Rewrite the README against the HEAD Status lines (winner).** Small, factually anchored, keeps
   one source of truth for per-idea pointers. Cons: none significant.
2. **Apply the draft patch and reconcile.** Rejected: the draft's disposition table (11 LANDED + 3
   SUPERSEDED + 11 NOT PROMOTED) disagrees with HEAD's curated 13/7/5 split — the draft demotes
   idea-22 to NOT PROMOTED where HEAD's later, more accurate Status line calls it LANDED via the
   proof sheet's Combined layer, and the draft lacks HEAD's OPEN class entirely. Reconciling the
   patch costs more than rewriting and would reintroduce a second disposition vocabulary.

## Recommendation

Write a fresh, smaller fix that treats the report Status lines as the source of truth:

1. **Intro (lines 7–12):** keep the historical fact (every subagent reverted to pristine before
   exiting), then state that the promotion pass has since happened — 13 ideas LANDED, 7 NOT
   PROMOTED, 5 still OPEN — that each report opens with a `Status:` line giving its disposition and
   live-file pointer, and link `../docs/gemini-3.1-migration.md` as the run record.
2. **Scoreboard:** add a slim Status column carrying only the status word (`LANDED` / `NOT PROMOTED`
   / `OPEN`), no paths. Paths stay in the report Status lines — one bookkeeping surface, and it
   moots the reviewer's idea-24 path-relativity objection outright.
3. **"What a follow-up session should probably do first" (lines 60–77):** replace with a short
   retrospective — the list was executed in the 2026-07 wave (`../docs/gemini-3.1-migration.md`);
   remaining open work lives in `area:asset-gen` GitHub issues, and the five OPEN Status lines name
   the scorers that were validated but never built at HEAD.
4. **`tools/asset-gen/.ruler/AGENTS.md`:** replace "24 of 25 ideas were validated there, and several
   carry finished patches/assets waiting to be promoted" with a sentence saying dispositions live in
   each report's Status line and the README scoreboard; run `npm run ruler:apply` and commit the
   regenerated `CLAUDE.md`/`AGENTS.md` (this was reviewer objection 6, and the draft's round-3
   version of this edit is a usable reference).

What must change vs the rejected draft to survive the recorded objections: adopt HEAD's three-status
vocabulary (drop the draft's SUPERSEDED — HEAD's Status lines state the superseding fact in prose
under NOT PROMOTED); take counts from the Status lines (13/7/5), not the draft (11/3/11); keep all
paths out of the scoreboard; and keep the intro rewrite plus the `.ruler/` fix, the two objections
the Status-line commits did *not* already absorb.

Sketch of the intro replacement:

```markdown
… and **reverted the repo to pristine before exiting** — so nothing landed *during* the exploration.
The promotion pass has since happened: 13 ideas LANDED, 7 were NOT PROMOTED, and 5 remain OPEN. Each
report opens with a `Status:` line naming its disposition and, where landed, the live `bin/`/`lib/`
file; `../docs/gemini-3.1-migration.md` is the run record of the wave that closed most of the rest.
```

## Suggested next step

Re-stage in docs/AUDIT.md with the solution text above (explicitly: derive from the report Status
lines; do not apply the draft patch). Alternatively fix directly — it is a two-file Markdown/ruler
change with `npm run ruler:apply` + `npm run format:check` as the only gates.
