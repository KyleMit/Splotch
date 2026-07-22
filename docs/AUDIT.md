# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Session audit

### [Tooling] burn-down-backlog leans on `search_issues`, which returns 0 here and can falsely report an empty backlog

**File(s):** `.ruler/skills/burn-down-backlog/SKILL.md` (Setup → "Find the newest unclaimed issue";
regenerates `.claude/skills/burn-down-backlog/SKILL.md` + `.agents/…`)

#### Problem

`slow` (this run) — but the durable risk is a **silent false-empty stop**.

The burn-down-backlog skill prescribes the GitHub MCP `search_issues` tool as the way to pick the
next issue, and steers away from `list_issues` on purpose:

> `search_issues` with `repo:kylemit/splotch is:issue is:open -label:in-progress -label:wont-do`,
> `sort: created`, `order: desc` — the first result is your pick. (`search_issues` supports the
> negative `-label:` filter directly; `list_issues` doesn't, so prefer search here.)

In this cloud/MCP environment that query returns nothing. Observed this session:

* `search_issues` (the exact prescribed query, `mode: lexical`) →
  `{"total_count": 0, "incomplete_results": false}`.
* `search_issues` broadened to just `repo:kylemit/splotch is:issue is:open` → still
  `{"total_count": 0}`.
* `list_issues` (`state: OPEN`, `orderBy: CREATED_AT`, `direction: DESC`) → **146 issues**, newest
  first.

So the search index is unpopulated/unavailable here while `list_issues` works fine. The danger isn't
the two wasted calls — it's that the skill's empty-result branch says to **"report 'no unclaimed
open issues' and stop cleanly."** A future run that trusts `search_issues` = 0 would falsely
conclude the backlog is empty and stop, doing nothing, with no failed command to signal the miss.
This is the "verification/command a skill prescribes produces a false result" class —
recurrence-guaranteed because the prescription itself is what fails, and silent because nothing
errors.

#### Proposed solution

In `.ruler/skills/burn-down-backlog/SKILL.md`, make `list_issues` the primary pick path and demote
`search_issues` to an optional convenience:

* Fetch candidates with `list_issues` (`state: OPEN`, `orderBy: CREATED_AT`, `direction: DESC`,
  paginate), then filter out `in-progress` / `wont-do` (and the blocked `needs-triage` /
  `needs-scoping` / `needs-adr`) labels **client-side** — `list_issues` returns labels on each
  issue, so the negative-filter convenience `search_issues` offered isn't essential.
* Add one line: "In cloud/MCP sessions `search_issues` may return 0 even when open issues exist (the
  search index isn't always available); never conclude the backlog is empty from an empty
  `search_issues` — confirm with `list_issues` first."

Then `npm run ruler:apply` and commit the regenerated `.claude/` + `.agents/` copies (ADR-0058).
Consider whether the sibling skills that also lean on `search_*` (e.g. the MCP server's own "prefer
search for targeted queries" guidance) warrant the same cross-check note, but the in-scope fix is
burn-down-backlog, which is where it bit.

#### Verification

Next burn-down-backlog run derives its candidate list from `list_issues` (returns >0 here) and never
stops on a false-empty `search_issues`. Quick repro of the underlying gap: in this environment,
`search_issues repo:kylemit/splotch is:issue is:open` returns `total_count: 0` while `list_issues`
with `state: OPEN` returns the full open set — so any code path that gates "stop, backlog empty" on
the search count is wrong here.
