# ADR-0077: The Audit Burndown Runs Cloud-Native — No `gh`, Minted Session IDs, Push Every Finding

**Status:** Active **Date:** 2026-07

## Context

The `burn-down-audits` driver (`scripts/audit-burndown/`, ADR-0069) was built and tuned on a local
macOS machine: `caffeinate` + `tmux` held the run open overnight, `gh` created the draft PR and
posted the per-commit comments, and pushes were batched every 10 findings behind a full `npm test`.
Splotch's preferred runtime for it is now a Claude Code cloud session, and a 2026-07-25 canary run
(5 findings, all fixed) established that three of those assumptions are not merely suboptimal there
— two are broken outright.

**1. `gh` cannot work in a cloud session, for two independent reasons.** The `GH_TOKEN` in the
container is scoped to the local git proxy, not github.com (`gh auth status` → "token is invalid"),
and `origin` is `http://local_proxy@127.0.0.1:<port>/git/<owner>/<repo>`, which `gh` rejects with
"none of the git remotes configured for this repository point to a known GitHub host". Neither is
fixable by authenticating differently. GitHub access in these sessions is via the MCP tools
(`mcp__github__*`), which a headless Node subprocess cannot reach.

The consequence was not a hard failure, which is what made it worth an ADR: the driver pushed all
its commits perfectly well, then logged `gh pr create FAILED` and spilled five per-commit comments
to a gitignored file. This is precisely the failure shape a 2026-07-24 macOS run had already hit
from the other direction — a 20-minute GitHub HTTP 500 on `gh pr create` with githubstatus.com green
throughout. Two environments, same lesson: *the commits are reliable and anything touching the
GitHub API is not.*

**2. The `--resume` implementer handoff was silently inverted.** This one is severe and left no
trace in any log. Claude Code on the web pins `CLAUDE_CODE_SESSION_ID` in the container environment;
every `claude -p` child the driver spawns inherits it, reports it as its own `session_id`, and
appends to a single shared transcript file (measured: one 3 MB `.jsonl`, 167 root conversation
trees, no sidechains — the supervising agent's own turns interleaved with every role's). The driver
read `session_id` off the envelope and passed it to `--resume` on fix rounds, so the resume resolved
to whichever role had written to that transcript *last*. Walking the `parentUuid` chains of the
canary's two real fix rounds showed both attached to the **reviewer's** leaf:

```
assistant: `git show` + repo grep done. The extraction itself is correct and complete…
assistant: ## Review  The gradient extraction itself is correct: both fills now read…
```

So the implementer was handed the critic's context instead of its own, and the blind writer/verifier
pairing the loop depends on was void. The supervising agent's tool output is a candidate leaf too,
making it nondeterministic as well as wrong. Unsetting `CLAUDE_CODE_SESSION_ID` for the child does
*not* fix it (verified). Passing an explicit `--session-id <uuid>` does: the id is honoured, and a
`--resume` of that id correctly recalls a codeword planted in its own prior turn.

**3. The container is reclaimed for inactivity, mid-run, without warning.** No local wakelock is
relevant. `PUSH_EVERY=10` meant up to ten findings — well over an hour of Opus work — could exist
only on a disk that was about to disappear. (Observed live: the container restarted during this very
session. The disk happened to survive; that is not guaranteed.)

Alternatives considered:

* **Fork a `burn-down-audits-cloud` skill.** Zero risk to the macOS path, but two copies of a
  ~780-line driver and a ~600-line runbook that would drift within a month. The skill's value is its
  accumulated retro notes, and duplicating them halves the odds any given lesson is where you look.
* **Capability-detect and support both runtimes.** One driver probing for a usable `gh`, with
  `PR_MODE=gh|agent` and per-mode push defaults. Genuinely tempting, and two of the three changes
  (minted session ids, tighter push cadence) are improvements on *both* runtimes. Rejected because
  the conditional surface has to be maintained and tested against a runtime nobody uses, and the
  supervising-agent-owns-GitHub split is simpler than either branch of the conditional.
* **Keep `gh` and teach it to retry.** Does not address either cloud blocker; retrying an
  unauthenticated call against a non-GitHub remote fails the same way forever.

## Decision

The audit burndown targets a Claude Code cloud session **only**. The macOS-specific machinery is
deleted rather than conditionalised.

**1. The driver never talks to GitHub.** `gh` is gone from `burndown.mjs` (dependency check, PR
discovery, `pr create`, `pr comment`) and from `preflight.mjs`. `pushBatch` is now `git push` and
nothing else. Opening the draft PR, posting per-commit comments, and marking the PR ready are the
**supervising agent's** job via the MCP tools. The driver's contract ends at "commits on origin,
plus one comment record per fix".

`backfill-comments.mjs` loses its `gh`-based `post` and gains a `next` → post → `done <sha>` loop
the agent drives: `next` renders one record, the agent posts it via
`mcp__github__add_issue_comment`, `done` drops it. `done` runs *after* the post, making the loop
at-least-once — a duplicate comment is trivial, a silently dropped one is the reviewer's only
written catch.

**2. Every fresh role call gets a minted `--session-id <uuid>`, and that minted id — not
`env.session_id` — is the resume handle.** A fresh uuid per *attempt*, so a retry cannot collide
with a partial session. When no minted id exists, the fix round falls back to a fresh session
carrying the implementer system prompt rather than issuing `--resume ''`, and logs
`no impl session to resume`.

**3. Push after every finding** (`PUSH_EVERY=1`), and **drop the local full-suite gate**
(`PUSH_TEST_CMD=''`). The per-finding layered gate — `CHECK_CMD`, `TEST_CMD`, `LINT_CMD` on changed
files, and targeted `E2E_CMD` for UI findings — is unchanged and still runs before every review
round. The full suite now runs in **CI on the draft PR**, on every push, in parallel and off the
critical path.

**4. Comment records are written the instant a fix lands**, one JSON line to `COMMENT_STORE`
(default `.audit-work/pending-comments.jsonl`), rather than accumulated in memory until a push. The
store stays gitignored on purpose: a tracked file sits inside the blast radius of the driver's
`git reset --hard` rollback paths. `COMMENT_STORE` can be pointed at a committed path for a long
unwatched run, to be drained and deleted at closeout.

**5. `overnight.mjs` drops `caffeinate`, `tmux`, and the `pmset` reporting** and simply spawns the
job detached with stdio to a log. `preflight.mjs` drops the `gh` binary/auth checks and the macOS
power section, and gains an origin-reachability check and a warning for an undrained comment store.

## Consequences

* **A cross-finding regression no longer blocks a push.** It turns a CI run red asynchronously
  instead. Watching CI is now an explicit part of supervising a run, and the skill says so. Setting
  `PUSH_TEST_CMD='npm test'` restores the blocking gate for a run nobody will be watching.
* **The run cannot complete unattended in one sitting.** At ~7 min and ~$2 per finding (canary
  measurement), a 500-finding backlog is ~60 hours — many container lifetimes. Pushing every finding
  is what makes that survivable: a reclaimed container costs the in-flight finding and nothing else,
  and a relaunch resumes from `origin` + `docs/AUDIT.md`.
* **A run with no supervising agent produces no PR and no comments.** That is the accepted cost of
  removing the driver's GitHub coupling. The commits are still correct, pushed, and complete; the
  narrative around them is deferred until an agent drains the store.
* **Running this on a Mac again means restoring deleted paths.** Deliberate. The two changes that
  were improvements everywhere (minted session ids, per-finding pushes) are unconditional, so a
  future re-port starts from a better driver than the one that was cut over.
* `.audit-work/` is now container-local rather than machine-local: the compaction snapshot, role
  envelopes, `run.log`, `completed.log`, and any undrained comment records die with the container.
  Nothing that only lives there can be the sole record of anything.
