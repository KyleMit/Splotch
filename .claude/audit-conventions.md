# Audit skills — inventory & shared conventions

The single reference for Splotch's custom **audit skills**: what they are, and the
rules every one of them follows. Each audit command/skill links here instead of
repeating these instructions. If you change a shared rule, change it **here** — the
skills point at this file on purpose.

## Inventory

| Audit | Invoke | What it finds | Writes to |
| --- | --- | --- | --- |
| **code-audit** | `/code-audit` | Prioritized perf / readability / maintainability / architecture improvements across the repo | `docs/audit.md` |
| **extract-audit** | `/extract-audit` | Inline code blocks worth extracting into standalone, named, testable functions | `docs/audit.md` |
| **lighthouse-audit** | skill (`lighthouse-audit`) | Page-load / Core Web Vitals opportunities on a throttled device | `docs/audit.md` |
| **dependency-audit** | `/dependency-audit` | Out-of-date dependencies, upgraded one at a time with a migration guide | one commit per package |
| **workflow-audit** | `/workflow-audit` | Claude Code config + session-history review vs. current best practice | dated `docs/claude-workflow-review-YYYY-MM-DD.md` |

**Consumers** of `docs/audit.md` (not audits themselves): `/fix-next-audit` clears the
whole list autonomously on its own branch + PR; `/review-audit` validates the list
against the current code and prunes stale items.

## Shared conventions

Every audit skill follows these. The inventory's **Writes to** column says which of
§1 applies to it; **§2 and §3 apply to all audits.**

### 1. Merge into `docs/audit.md` — combine, never overwrite

Audits that produce a findings list write to the shared `docs/audit.md`. Multiple
audits (and repeat runs of the same audit) share that file, so **merge**:

- Keep the file's header block; append under a `## Source: <audit name>` section so
  each audit's findings stay grouped and attributable.
- **An existing item still stands** → keep it; *enrich* it with sharper attribution
  or fresher numbers from this run.
- **A genuinely new finding** → add it as a new `- [ ]` item.
- **An item that's since been fixed** → remove it (confirm against the code first).
- Never clobber another audit's section or replace the file wholesale.

Canonical item format (so `/fix-next-audit` and `/review-audit` can work items one
at a time):

```markdown
- [ ] **[Category] Short title** — File(s): `path/to/file.ts`
  What to change and why — specific enough that an AI can act on it without re-reading the audit.
```

The `docs/audit.md` header (create it if the file doesn't exist yet):

```markdown
# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-next-audit`; validate it with `/review-audit`.
> Skills **merge** into this file — they never overwrite each other's sections.
```

Order items within a section by impact: highest-value or lowest-risk first.

### 2. Log every run in `docs/audit-log.md`

After a run, add one row to `docs/audit-log.md` (most recent first) so there's a
committable, scannable history of what each audit found and when. See that file's
header for the exact format. Keep the summary to one line.

### 3. Self-heal — fold learnings back into the skill

After running, briefly consider: did this run surface a **novel pattern**, a
false-positive trap, or extra reasoning you needed to make the audit work correctly?
If so, fold that *durable method knowledge* back into the skill's own file as part of
the same task — so the next caller gets it for free.

Record only durable **method** knowledge in the skill (how to audit, how to read the
output, gotchas to avoid). Do **not** record specific findings there — those live in
`docs/audit.md` and go stale as they're fixed.
