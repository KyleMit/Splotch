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

**Consumers** of `docs/AUDIT.md` (not audits themselves): `/fix-audits` clears the whole list
autonomously on its own branch + PR; `/vet-audits` validates the list against the current code and
prunes stale items.

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

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.
```

**`docs/AUDIT.md` may not exist.** An empty backlog is a real, expected state, not an error:
`/fix-audits` **deletes** the file once it clears the last finding, so between audit runs there is
often no `docs/AUDIT.md` at all. Every audit skill must handle its absence gracefully:

* **Producers** (write findings): treat a missing file as an empty backlog and create it with the
  header above — never assume it's already there, and never error out because `cat`/read of it
  failed.
* **Consumers** (`/fix-audits`, `/vet-audits`): a missing (or header-only) file means there's
  nothing to do. Report "no audit backlog" and stop cleanly — do not treat the missing file as a
  failure.

Check for the file's existence before reading it, and read defensively (e.g. `test -f docs/AUDIT.md`
first, or tolerate a non-zero exit from `cat`).

### 2. Log every run in `docs/AUDIT-LOG.md`

After a run, add one row to `docs/AUDIT-LOG.md` (most recent first) so there's a committable,
scannable history of what each audit found and when. See that file's header for the exact format.
Keep the summary to one line.

This includes the **consumer** skills (`/fix-audits`, `/vet-audits`): log the run — branch/PR for
fix-audits, prune summary for vet-audits — even though they don't write findings into
`docs/AUDIT.md`. The Inventory's "not audits themselves" scopes §1 only (which only producers
satisfy); §2 applies to every run.

### 3. Self-heal — fold learnings back into the skill

After running, briefly consider: did this run surface a **novel pattern**, a false-positive trap, or
extra reasoning you needed to make the audit work correctly? If so, fold that *durable method
knowledge* back into the skill's own file as part of the same task — so the next caller gets it for
free.

Record only durable **method** knowledge in the skill (how to audit, how to read the output, gotchas
to avoid). Do **not** record specific findings there — those live in `docs/AUDIT.md` and go stale as
they're fixed.
