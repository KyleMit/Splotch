# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

Deduplicated review of six `/session-audit` reports. The recurring cloud-session
Playwright-resolution problem (reported by four separate sessions) is merged into a
single finding, with the empirically-correct fix. Findings are ordered by impact.

Not filed (already resolved / already documented, verified this pass):

- **Chromium browser-version drift** (Session 5 & 6 passed on it too). `.claude/cloud/setup.sh`
  now derives the Playwright browser version from `package.json`'s `@playwright/test`
  (`^1.61.1`) instead of the old hard-coded `1.60.0`, and `driver.mjs` / `playwright.config.ts`
  self-heal past a stale snapshot. This closes the "#1 cloud-session E2E failure" class; no
  action needed.
- **`flushSync()` throws inside an effect** (Session 4, passed on by the reporter — one grep).
- **Orphaned `vite dev`** — already folded into `run-splotch/SKILL.md` during a prior session.

---

### [Docs] Whether `/fix-audits` and `/vet-audits` log to `AUDIT-LOG.md` is contradictory and unstated in the skill files

**File(s):** `.claude/audit-conventions.md` (§2 + the "Consumers" note), `.claude/commands/fix-audits.md` (Completion section), `.claude/commands/vet-audits.md` (Output section)

#### Problem

Cost: **minor** · recurrence: high (every consumer run hits the same fork).

The convention is genuinely ambiguous about whether the consumer skills log a row. During a
`/fix-audits` run the agent reasoned "fix-audits is a consumer, not an audit producer, so skip
the `AUDIT-LOG.md` row" and finished without logging — a reasonable read of the contradiction:

- `.claude/audit-conventions.md` §2 says "After a run, add one row to `docs/AUDIT-LOG.md`" and
  the section intro says "§2 and §3 apply to all audits" — but the same file labels
  `/fix-audits` and `/vet-audits` as "**Consumers** … (not audits themselves)." A consumer that
  is "not an audit itself" reasonably reads itself out of "all audits."
- Neither skill file names the log step. Verified this pass: `.claude/commands/fix-audits.md`'s
  Completion section (steps 1–5) never mentions `AUDIT-LOG.md`, and `vet-audits.md`'s Output
  section doesn't either.

Yet established practice is that consumers **do** log: `docs/AUDIT-LOG.md` already contains
`fix-audits` rows (2026-07-07 PR #81, 2026-07-06) and `vet-audits` rows (2026-07-06, 2026-07-03).
So a sweep can go missing from the "history of **every** audit-skill run" the log claims to be.

#### Proposed solution

Resolve it in the two places that disagree, plus each skill's own checklist so it doesn't depend
on remembering a cross-referenced convention.

1. **`.claude/audit-conventions.md` §2** — append after the existing paragraph:

   ```markdown
   This includes the **consumer** skills (`/fix-audits`, `/vet-audits`): log the run
   (branch/PR for fix-audits, prune summary for vet-audits) even though they don't write
   findings into `docs/AUDIT.md`. "Not audits themselves" (see the Inventory) scopes §1 only —
   §2 applies to every run.
   ```

2. **`.claude/commands/fix-audits.md` — `## Completion`** — insert a step before the final
   "In your final response" step:

   ```markdown
   5. Add one row to `docs/AUDIT-LOG.md` for this run per `.claude/audit-conventions.md` §2
      (date · `fix-audits` · one-line summary with the PR link), committed and pushed with the
      completion changes.
   ```

3. **`.claude/commands/vet-audits.md`** — add an equivalent log step to its Output section
   (date · `vet-audits` · one-line prune summary), since it currently has none.

#### Verification

After the fix, `grep -n "AUDIT-LOG" .claude/commands/fix-audits.md` returns a Completion-step
line, `vet-audits.md` has its own, and §2 of `.claude/audit-conventions.md` names the consumer
skills explicitly — so the next `/fix-audits` or `/vet-audits` logs its row without re-deriving
whether "consumer" means "exempt from §2."
