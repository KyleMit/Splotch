# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Session audit

### [Tooling] `fix-audits` doesn't describe the cloud-session execution model — async subagents share one working tree, so the per-item loop must be serialized by hand

**File(s):** `.claude/skills/fix-audits/SKILL.md` (source: `.ruler/skills/fix-audits/SKILL.md`), the
"Per-item loop" section

#### Problem

Burning down 10 `type:audit` issues (`#514`–`#523`) via `/fix-audits` this session, the skill's
"Per-item loop" reads as a synchronous delegate → **Fixed** → commit → next sequence. In a cloud
session the reality diverges in three ways the skill never states — each of which I had to discover
mid-run. Cost: **slow** (it shaped the whole run's cadence).

* **Subagents run async even with `run_in_background: false`.** Some issues' agents returned inline
  (`#515`, `#516`); most launched in the background ("working in the background… notified when it
  completes") regardless of the flag. The loop's real cadence was "launch one, wait for the
  completion notification, commit, launch the next."
* **They share one working tree.** Each general-purpose implementer edits the real working tree, not
  an isolated copy, so two in flight would collide. The loop must therefore be **strictly
  serialized** — exactly one implementer in flight, its fix committed, before the next launches. A
  first-time runner could reasonably fan all issues out in parallel and corrupt the branch; nothing
  in the skill warns against it.
* **ruler-generated fixes need care.** The `#514` fix touched `.ruler/skills/api/SKILL.md`; the
  subagent edited the source **and** hand-edited the generated `.claude`/`.agents` copies, so
  `npm run ruler:apply` had to re-reconcile them, and `npm run ruler:check` reported "drift" until
  the regenerated files were committed (it diffs against HEAD) — 2–3 confused re-runs.

#### Proposed solution

Add a short "Cloud-session execution" note to `.ruler/skills/fix-audits/SKILL.md` (then
`npm run ruler:apply`):

* Process issues **strictly one at a time** — subagents are async and edit the shared working tree,
  so await each agent's completion **and commit** before launching the next. For parallelism,
  worktree-isolate implementers whose issues touch disjoint files and serialize the commits back;
  never fan out into one shared tree.
* When a fix touches a ruler-generated file (a skill / `CLAUDE.md` / `AGENTS.md`), instruct the
  subagent to edit **only** the `.ruler/` source and run `npm run ruler:apply` — never hand-edit the
  generated copies. `ruler:check` diffs against committed HEAD, so regenerated-but-uncommitted files
  read as "drift"; commit, then it's clean.

#### Verification

The next cloud `/fix-audits` run reads the execution note and serializes without a working-tree
collision or a ruler-drift detour.
`grep -i "one at a time\|ruler:apply" .claude/skills/fix-audits/SKILL.md` returns the new guidance.

### [Execution] Leftover agent worktrees under `.claude/worktrees/` aren't ignored, so `format:check` fails spuriously and git reports untracked noise

**File(s):** `.prettierignore`, `dprint.json` (`excludes`), `.gitignore`

#### Problem

This session ran adversarial reviewers with `isolation: 'worktree'`, which creates
`.claude/worktrees/agent-*` checkouts. After the agents finished the worktrees persisted, and
`npm run format:check` flagged 6 files **inside** them (e.g.
`.claude/worktrees/agent-*/web/src/tokens.css`,
`.../tools/asset-gen/ideas-exploration/ideas-review.html`) — files that *are* in `.prettierignore`
at their repo-relative paths (`web/src/tokens.css`), but whose ignore patterns don't match the
nested worktree path, so Prettier scanned the copies and failed the check. The stop-hook also
flagged the worktrees as untracked. I had to diagnose the false failure and manually
`git worktree remove --force … && git worktree prune && rm -rf .claude/worktrees` — **twice**.
`git check-ignore .claude/worktrees` → NOT IGNORED. Cost: **slow**, and it recurs for every session
that uses worktree-isolated agents (now a common pattern for parallel review/implementation).

#### Proposed solution

Ignore the agent-worktree tree everywhere the repo scans:

* `.prettierignore`: add `.claude/worktrees/`.
* `dprint.json` `excludes`: add `.claude/worktrees/**`.
* `.gitignore`: add `.claude/worktrees/` so leftover checkouts never show as untracked.

#### Verification

With a stale `.claude/worktrees/agent-*` present, `npm run format:check` passes and `git status` is
clean; `git check-ignore .claude/worktrees` prints the path.
