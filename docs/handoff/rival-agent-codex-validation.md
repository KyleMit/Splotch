# Handoff — rival-agent Codex validation

> 2026-09-03 · branch `main` (cut your own branch from it once stack 1588 has merged) · PR none yet
> · As the Codex native handler, exercise everything PRs 1579, 1581, and 1587 shipped for the Codex
> side of `run-rival-agent`, fix what breaks, and open one PR with the fixes and the record

This packet is written for a **Codex** session. The three PRs it names were built and proven by a
Claude session serving as the handler for both rivals; the one side nobody has exercised is the one
only you can — Codex holding the handler's permissions, launching the Claude rival through the
installed wrappers, serving the broker from `exec_command`, and running the bench and the live
acceptance suite from inside Codex's own sandbox and policy.

## Objective & non-goals

**Objective.** Open one PR against `main` that (a) records a real Claude-rival round handled by
Codex on the new sandboxed shape, (b) records the live acceptance suite passing with Codex as the
handler, (c) records one repetition of the seeded-defect bench run from Codex with `--rival claude`,
(d) fixes whatever any of those exposes, and (e) updates `tools/rival-agent/NOTES.md` (the parity
table and the "Unvalidated" list) and the Codex-side skill note with what was measured.

**Vocabulary, fixed.** The *native handler* is the agent running in the current runner and holding
its permissions — you. The *rival agent* is the other vendor's CLI in a disposable worktree — Claude
Code, `opus` by default. One paired profile per side; profile rungs, a broker allowlist or denylist,
and a command menu were each rejected as a second policy engine. Do not propose them.

**Non-goals.**

* No ADR. Tooling decisions live in `tools/rival-agent/NOTES.md`, not in `docs/adrs/`.
* No hosted reviewer, no workflow, no label. Ruled out with evidence recorded in
  `docs/scratchpad/rival-agent-simplification-2026-09-02.md`.
* Do not run `npm run run-claude:install` yourself and do not edit `~/.codex/config.toml` or the
  policy rules by hand. The owner runs the installer; see the precondition below.
* Do not touch `.ruler/` for anything under `.agents/skills/run-rival-agent/` or
  `.claude/skills/run-rival-agent/`: both are registered direct-provider packages
  (`tools/ruler/lib/direct-provider-skills.mjs`) and are edited in place. Edit only the Codex-side
  package and the shared core under `tools/rival-agent/`; leave the Claude-side package alone unless
  a shared-core change forces a matching edit.
* Never `npm install` or `npm ci`; pnpm installs, npm runs. No rebases, no force-pushes.

## Precondition: the owner has reinstalled the trusted package

The installed copy under `~/.local/libexec/splotch-rival-agent/` is what you launch, and it is stale
until the owner runs `npm run run-claude:install` from `/Users/kylemit/Code/Splotch` after the merge
and restarts Codex. Check first, in the normal sandbox:

```sh
npm run run-claude:policy:check
npm run run-claude:installation:check
```

If either reports missing or stale state, stop and say so; nothing below is valid against the old
install. `run-claude:installation:check` compares the installed bytes against the checkout you run
it from, so run it from a checkout at `main` after the merge.

## State

What landed, all on `main` once stack 1588 merges (bottom to top):

| PR   | What it carries                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1579 | The broker attached in both sandboxes; the hybrid prompt partial (`rival-prompt-hybrid.md`); the hosted reviewer removed; `tools/rival-agent/NOTES.md` created with the decisions, rejected alternatives, accepted exposures, and the parity table                  |
| 1581 | The seeded-defect bench (`tools/rival-agent/bench/`, `npm run rival:bench`); its run (Codex, 48 cells) that collapsed the `--sandbox` flag to the sandbox-first hybrid; the live acceptance suite regenerated for a rival with a shell; fixes from the Claude round |
| 1587 | The Claude rival gains a sandboxed `Bash` pinned by a `--settings` block the launcher computes (`resolveSandboxPaths` in `launch-claude.mjs`); the Codex-side skill, permissions reference, and note describe it; the Claude bench run recorded                     |

The shape you are validating: the rival runs its own tests, checks, and repros in its own vendor's
sandbox rooted at the disposable worktree with the network off, and reaches you through the broker
only for what that sandbox refuses. Most rounds make no request at all.

## Decisions made (and why)

All in `tools/rival-agent/NOTES.md`; read it before changing anything. The ones you will bump into:

* **The `--sandbox` flag is gone.** The bench decided it (18/18 found, zero handler turns, one
  unverified for the hybrid; 17/18, one turn per cell, eight unverified for the read-only pairing;
  same cost). Do not bring the read-only mode back.
* **The Claude rival's deny lists are computed, not hard-coded:** `denyWrite` on the canonical
  `.git` from `git rev-parse --git-common-dir`, `denyRead` on `~/.codex` and every
  `.worktreeinclude` path at its canonical location. Never `denyRead` `~/.claude`.
* **Claude Code replaces its shell's `TMPDIR`,** so the session `tmp` (where dprint's cache goes) is
  granted through a second `--add-dir`. The packet is writable for the Claude rival for the same
  reason, which is why the acceptance suite's escalation stage targets the session directory.
* **The findings channel and the Linux `/tmp` spool gap are accepted exposures**, on stated grounds.
  Do not re-litigate them; do not add a credential-scrubbing poster.
* **The orchestrated alias** `splotch-claude-review-publish.mjs` still declines every broker
  request; with the sandboxed shell its reviews are empirical anyway. Giving it a real handler is
  out of scope.

## Unverified assumptions

These are what the PR exists to test. Each is believed, not measured, on the Codex side.

* Codex's `exec_command` ergonomics around a mostly idle broker loop hold with the sandboxed Claude
  rival: `broker next --timeout-seconds 60` under the 30-second yield needs one follow-up poll per
  quiet wait (measured once on the old shape), and a round that never asks for anything should be
  one launch, a few empty polls, and `done`. Watch for the launcher handle surviving the whole round
  and for `tail` of its redirected stderr being enough to follow it.
* The installed Codex policy's `prefix_rule`s cover the new launch. The launcher is the same
  installed path, but it now spawns `claude` with `--settings` and `Bash`; nothing in the policy
  should care, and `codex execpolicy check` will say.
* The bench can be run from Codex at all. `node tools/rival-agent/bench/run-bench.mjs` launches the
  Claude CLI, which needs the Keychain login, so from Codex it has to run through `exec_command`
  with `sandbox_permissions: "require_escalated"` like the launcher does, and it is **not** one of
  the policy's allowed wrapper paths, so expect an approval prompt (or a decline, which is a finding
  for this PR). The bench serves the broker itself; you only watch.
* `format:check` now works inside the Claude rival's sandbox (the session `tmp` is an `--add-dir`).
  Measured only from the checkout with a Claude handler; the installed copy has not run it.
* The Claude rival, launched by Codex, still makes zero broker requests on an ordinary review. When
  it does make one, the request should be one of the named doors (network, port bind, a write
  outside the worktree and its temp directories); anything else is a prompt defect.

## Done & verified (by the Claude-handler session, 2026-09-02 to 2026-09-03)

Trust these; do not re-run them to re-prove them.

* `npm run test:tools` (161 files), `lint`, `lint:dead`, `format:check`, `ruler:check`,
  `check:skill-refs` green at the tip; CI green on all three PRs.
* `npm run rival:bench -- --validate` passes on all twelve seeds.
* A Codex rival round on the hybrid (Round C) and a Claude rival round on the sandboxed shape (Round
  D), both with a Claude session as handler; recorded in
  `docs/scratchpad/rival-agent-simplification-2026-09-02.md`. Round D's five findings are all fixed
  on the stack.
* The Codex bench (48 cells) and the Claude bench (12 cells):
  `docs/scratchpad/rival-agent-bench-2026-09-03.md`.
* Claude's sandbox pins measured on opus, from inside a real round: the worktree, the packet, the
  session `tmp`, and Claude Code's own temp directory writable; the home directory, the canonical
  checkout and its `.git`, the session directory, the spool root, and `/tmp` refused; `~/.codex` and
  the `.worktreeinclude` paths unreadable; the network proxy answering 403; a port bind failing.

## Risks & next 3 steps

Risks: the policy prompt on an escalated bench run being declined by Auto-review (then run the bench
with the handler you are, one seed at a time, and record that instead); the Claude CLI exiting 1 on
a rejected `StructuredOutput` call (seen once in the Claude bench; rerun the cell, it is a vendor
behaviour); the full tools tier not running inside either sandbox because the perf harness binds
local listeners (expected; it is a named door, not a defect).

1. **Preflight and a real round.** Policy check, installation check, health probe through the
   host-execution boundary (the commands are in `.agents/skills/run-rival-agent/SKILL.md`). Cut a
   branch, open a draft PR early, then run a Claude rival round on `--pr <your PR>` through the
   installed launcher, serve the broker from `exec_command`, post with the installed poster. Record
   turns, requests, `tool error` lines naming a sandbox denial, usage, wall clock.
2. **The acceptance suite and the bench.** `npm run gen:rival-acceptance`, then one question round
   with its `handlerBrief`: expect exactly two requests (approve the session-directory marker write,
   decline the canonical-checkout write) and judge the rest from the summary. Then
   `npm run rival:bench -- --rival claude --reps 1` escalated, with a fresh `--out`; compare against
   the Claude column in the bench note.
3. **Fix, record, and close the loop.** Fix what broke (core or Codex-side package only), update the
   parity table and strike the Codex-handler item from NOTES.md's "Unvalidated" list with what you
   measured, add a short section to `docs/scratchpad/rival-agent-simplification-2026-09-02.md` for
   the Codex-handled round, delete this handoff, run the gates, mark the PR ready. Housekeeping you
   may do on this machine: the bench's rival session directories under
   `$TMPDIR/splotch-rival-agent/` (about sixty, evidence already recorded) and two scratch worktrees
   the Claude session could not remove (`git worktree list` shows them under a `scratchpad` path;
   `git worktree remove --force` each, then `git branch -D tmp/rival-collapse-dev`).

Completion condition: one ready-for-review PR on `main` with the Codex-handled round, the acceptance
verdict, and the bench repetition recorded; NOTES.md's parity table and unvalidated list updated;
this handoff deleted.

## Reread first

* `tools/rival-agent/NOTES.md` — every decision, the accepted exposures, the parity table.
* `.agents/skills/run-rival-agent/SKILL.md` and `references/permissions.md` — your procedure and
  what the installed wrappers pin.
* `.agents/skill-notes/run-rival-agent.md` — what is specific to Codex being the handler.
* `tools/rival-agent/README.md`, `bench/README.md`, `acceptance/question.md`,
  `gen-acceptance-suite.mjs` (the `handlerBrief`).
* `docs/scratchpad/rival-agent-bench-2026-09-03.md` and
  `docs/scratchpad/rival-agent-simplification-2026-09-02.md` (Rounds C and D).
* `.agents/skills/run-rival-agent/scripts/launch-claude.mjs` (`resolveSandboxPaths`,
  `sandboxSettings`, `TOOL_BOUNDARY`) and `tools/rival-agent/launch.mjs`.
* Root `AGENTS.md` sections "Concurrent worktrees" and "Writing on GitHub"; the `create-handoff` and
  `resume-handoff` skills.
