# Audit skills — inventory & shared conventions

The single reference for Splotch's custom **audit skills**: what they are, and the rules every one
of them follows. Each audit skill links here instead of repeating these instructions. If you change
a shared rule, change it **here** — the skills point at this file on purpose.

## Inventory

| Audit                       | Invoke                     | What it finds                                                                                             | Writes to                                         |
| --------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **code-audit**              | `/code-audit`              | Prioritized perf / readability / maintainability / architecture improvements across the repo              | `docs/AUDIT.md`                                   |
| **extract-audit**           | `/extract-audit`           | Inline code blocks worth extracting into standalone, named, testable functions                            | `docs/AUDIT.md`                                   |
| **lighthouse-audit**        | skill (`lighthouse-audit`) | Page-load / Core Web Vitals opportunities on a throttled device                                           | `docs/AUDIT.md`                                   |
| **dependency-update-audit** | `/dependency-update-audit` | Out-of-date dependencies, upgraded one at a time with a migration guide                                   | one commit per package                            |
| **dependency-health-audit** | `/dependency-health-audit` | Inventory + health of every third-party dependency (provenance, license, maintenance, keep/replace)       | `docs/DEPENDENCIES.md`, refreshed in place        |
| **session-audit**           | `/session-audit`           | Recurring friction from the just-finished session (code traversal / execution) + the tooling fix for each | `docs/AUDIT.md`                                   |
| **workflow-audit**          | `/workflow-audit`          | Claude Code config + session-history review vs. current best practice                                     | dated `docs/claude-workflow-review-YYYY-MM-DD.md` |

**Consumers** of `docs/AUDIT.md` (not audits themselves): `/vet-audits` adversarially validates the
list against the current code, drops what doesn't hold up, and **files each survivor as a GitHub
issue** labeled `type:audit` (draining and deleting the file); `/fix-audits` then burns down the
open `type:audit` issues autonomously on its own branch + PR — it no longer reads `docs/AUDIT.md`.

### The audit lifecycle — `docs/AUDIT.md` is a staging area, GitHub issues are the backlog

The durable audit backlog lives in **GitHub Issues** (open issues labeled `type:audit`), not in a
standing Markdown file. `docs/AUDIT.md` is the transient hand-off between a producer and
`/vet-audits`:

1. **Producer** (`code-audit`, `extract-audit`, `lighthouse-audit`, `session-audit`) → appends raw
   findings to `docs/AUDIT.md` (the merge rules in §1 govern this).
2. **`/vet-audits`** → validates each finding, removes the ones that don't hold up, and promotes
   each survivor to a GitHub issue (`type:audit` + applicable `area:*`/`type:*`; add `needs-triage`
   when the finding is valid but its fix approach is unclear). It deletes `docs/AUDIT.md` once
   drained. See `docs/ISSUE-WORKFLOW.md` for the label glossary.
3. **`/fix-audits`** → queries open `type:audit` issues and clears them, one commit per issue,
   referencing each so it closes on merge.

So a finding's home is `docs/AUDIT.md` only until `/vet-audits` runs; after that it's a GitHub
issue. Never treat `docs/AUDIT.md` as a long-lived backlog — between a vet run and the next producer
it is expected to be absent.

## Shared conventions

Every audit skill follows these. The inventory's **Writes to** column says which of §1 applies to
it; **§2 and §3 apply to all audits.**

### 1. Structure & merge — `docs/AUDIT.md` combines, never overwrites

Audits that produce a findings list write to the shared `docs/AUDIT.md`. Multiple audits (and repeat
runs of the same audit) share that file, so **merge**; never clobber another audit's section or
replace the file wholesale.

**The header hierarchy is fixed — every producer and consumer relies on it:**

| Level                                                           | Holds                                           | Rule                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `#`                                                             | The file title + blockquote                     | One per file (the header block below).                                                       |
| `## Source: <audit name>`                                       | One section per audit that contributed findings | Append yours; never touch another audit's. Delete the section once its last finding is gone. |
| `### [Category] Short title`                                    | One finding                                     | The unit `/fix-audits` and `/vet-audits` act on — added, enriched, or removed whole.         |
| `#### Problem` / `#### Proposed solution` / `#### Verification` | The three parts of a finding                    | See the canonical format below.                                                              |

When merging within your own `## Source:` section:

* **An existing finding still stands** → keep its `###` block; *enrich* it with sharper attribution,
  fresher numbers, or a better `#### Verification`.
* **A genuinely new finding** → add a new `###` block.
* **A finding that's since been fixed** → remove its whole `###` block (confirm against the code
  first).

Canonical finding format — a third-level header per finding with fourth-level parts inside, so each
finding can carry full Markdown (prose, code fences, tables) for the fix agent instead of a cramped
one-liner:

```markdown
### [Category] Short, action-oriented title

**File(s):** `path/to/file.ts` (`functionName`, lines N–M)

#### Problem

What's wrong and why it's worth fixing — enough prose, quoted code, and evidence that the fix agent
grasps it without re-deriving it. Use fenced code blocks and cite measurements.

#### Proposed solution

A suggested approach — a *starting point*, not a mandate; the fix agent weighs it against
alternatives. Note tradeoffs or gotchas you already see. (For an extraction, put the proposed
signature and target location here.)

#### Verification

How to prove the problem is real and confirm a fix resolves it: repro steps, a command or script to
paste, a profile to capture, the test that should fail before and pass after.
```

`#### Problem` and `#### Proposed solution` are required. `#### Verification` is optional at
creation and is what `/vet-audits` fills in — so the fix agent can reproduce the problem empirically
rather than trusting the write-up. Order findings within a section by impact: highest-value or
lowest-risk first.

The `docs/AUDIT.md` header (create it if the file doesn't exist yet):

```markdown
# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.
```

**`docs/AUDIT.md` may not exist.** A missing file is a real, expected state, not an error:
`/vet-audits` **deletes** it once it has drained the last finding into a GitHub issue, so between a
vet run and the next producer there is often no `docs/AUDIT.md` at all. Every audit skill must
handle its absence gracefully:

* **Producers** (write findings): treat a missing file as empty and create it with the header above
  — never assume it's already there, and never error out because `cat`/read of it failed.
* **`/vet-audits`**: a missing (or header-only) file means there's nothing to vet. Report "no audit
  backlog to vet" and stop cleanly — do not treat the missing file as a failure.
* **`/fix-audits`**: it doesn't read this file at all; its backlog is the open `type:audit` issues.
  No open `type:audit` issue means there's nothing to fix — report that and stop cleanly.

Check for the file's existence before reading it, and read defensively (e.g. `test -f docs/AUDIT.md`
first, or tolerate a non-zero exit from `cat`).

### 2. Log every run in `docs/AUDIT-LOG.md`

After a run, add one row to `docs/AUDIT-LOG.md` (most recent first) so there's a committable,
scannable history of what each audit found and when. See that file's header for the exact format.
Keep the summary to one line.

This includes the **consumer** skills (`/fix-audits`, `/vet-audits`): log the run — branch/PR for
fix-audits, and for vet-audits the issues filed (with numbers) plus what was pruned — even though
they don't write findings into `docs/AUDIT.md`. The Inventory's "not audits themselves" scopes §1
only (which only producers satisfy); §2 applies to every run.

### 3. Self-heal — fold learnings back into the skill

After running, briefly consider: did this run surface a **novel pattern**, a false-positive trap, or
extra reasoning you needed to make the audit work correctly? If so, fold that *durable method
knowledge* back into the skill's own file as part of the same task — so the next caller gets it for
free.

Record only durable **method** knowledge in the skill (how to audit, how to read the output, gotchas
to avoid). Do **not** record specific findings there — those live in `docs/AUDIT.md` and go stale as
they're fixed.

## Scheduled runs (Claude Routines)

Every audit skill also runs **automatically** on a schedule, via Claude Code Routines — scheduled
triggers that each open a fresh cloud session and drive the audit end to end with no user present.
This section is the source of truth for that automation: if a routine is added, retired, or
rescheduled, update this table in the same change.

### The schedule

All times UTC; days are spread across the month so at most one audit fires per day.

| Routine                         | Skill                      | Cadence              | Cron (UTC)    |
| ------------------------------- | -------------------------- | -------------------- | ------------- |
| Monthly dependency update audit | `/dependency-update-audit` | Monthly, 1st, 12:00  | `0 12 1 * *`  |
| Monthly code audit              | `/code-audit`              | Monthly, 5th, 11:00  | `0 11 5 * *`  |
| Monthly extract audit           | `/extract-audit`           | Monthly, 12th, 11:00 | `0 11 12 * *` |
| Monthly dependency health audit | `/dependency-health-audit` | Monthly, 15th, 11:00 | `0 11 15 * *` |
| Monthly lighthouse audit        | `lighthouse-audit`         | Monthly, 19th, 11:00 | `0 11 19 * *` |
| Monthly workflow audit          | `/workflow-audit`          | Monthly, 26th, 11:00 | `0 11 26 * *` |

**`session-audit` is deliberately not scheduled.** It's a retrospective on a live working session; a
fresh scheduled session has no session history to reflect on. It stays invoke-at-end-of-session
only.

### The lifecycle — find, verify independently, implement

Each scheduled run handles the **full lifecycle** of its findings, with **one subagent per phase**
so the orchestrating session keeps only concise phase summaries in context:

1. **Find** — a subagent runs the audit skill itself (for `docs/AUDIT.md` producers, merging
   findings per §1).
2. **Verify** — a *fresh* subagent runs `/vet-audits`, so validation is adversarial and independent
   of the finder's context. Survivors become `type:audit` GitHub issues.
3. **Implement** — a subagent runs `/fix-audits` to clear the open `type:audit` backlog on its own
   branch (one commit per issue) and open **one PR**. Issues already covered by an open PR are
   skipped, so back-to-back routines don't redo in-flight work.

Audits that don't stage through `docs/AUDIT.md` keep the same find → verify → implement spirit with
their own shapes: **dependency-update-audit** verifies each bump empirically (check + tests) and
implements as one batched PR; **dependency-health-audit** refreshes `docs/DEPENDENCIES.md`, has a
fresh subagent independently verify any new risk or replace/investigate claim before acting, then
files issues and opens a PR with the refreshed doc; **workflow-audit** writes its dated review doc,
has a fresh subagent independently validate each recommendation (reverting any that don't hold up),
and opens a PR with the surviving config changes.

### Unattended-run conventions

These apply to every scheduled (or otherwise user-absent) audit run:

* **Skip every `AskUserQuestion` gate** and apply that skill's documented defaults instead. For
  `dependency-update-audit` (its Phase 2 gate): minor/patch bumps only; defer majors and the
  coordinated families (list them in the report); `npm run check` + unit tests per package, with the
  full `npm test` once at the end.
* **One PR per run.** Per-item commits are preserved inside it. A bump or fix that fails
  verification is left out and noted in the PR body — never left broken in the branch.
* **Log rows ride the PR.** The `docs/AUDIT-LOG.md` rows for all phases (§2 applies to each phase's
  skill) go into the run's PR. A run that produces no fix/upgrade PR still opens a small **log-only
  chore PR** with just its `AUDIT-LOG.md` rows, so the committed history stays complete.
* **Finish with a summary** — findings filed, issues fixed or deferred, and the PR URL(s) — even
  when the run was a no-op.
