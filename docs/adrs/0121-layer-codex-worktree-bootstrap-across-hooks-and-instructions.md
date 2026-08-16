# ADR-0121: Layer Codex Worktree Bootstrap Across Hooks and Agent Instructions

**Status:** Active **Date:** 2026-08 (amends [0058](0058-ruler-generated-agent-files.md))

## Context

The repository's synchronous Codex `SessionStart` command hook prepares detached linked worktrees
before the model can run a project command: it updates a worktree created from stale local `main`,
installs the frozen pnpm tree, and verifies `npm run info`. Android Remote is the path that needs
this most because it can create a laptop worktree without running the desktop local environment.

Codex deliberately skips a new or changed non-managed command hook until the user trusts that exact
hook hash. The first Android Remote session after the hook was introduced reproduced the resulting
gap: Codex discovered the enabled startup hook but reported it as `untrusted`, started the model
without running it, and left `node_modules` absent. Repository trust and hook trust are separate;
the project cannot grant trust to its own command hook without defeating the security boundary.

Alternatives considered:

1. **Treat the one-time `/hooks` review as sufficient.** Rejected: Android Remote worktree creation
   does not include that laptop-side review step, so the first session still begins unprepared — the
   exact failure the bootstrap exists to prevent.
2. **Auto-trust the project hook from repository code.** Rejected: untrusted repository code cannot
   safely authorize itself, and Codex exposes no project mechanism to do so.
3. **Install a user or managed hook outside the repository.** Rejected as the project solution: a
   managed hook can be trusted by policy, but it requires machine or organization provisioning and
   does not travel with the repository.
4. **Use agent instructions instead of a command hook.** Rejected as the only path: instructions
   arrive with the first model request, while a trusted synchronous hook can finish before that
   request and can stop the turn deterministically on failure.
5. **Keep the command hook and add an instruction fallback.** **Chosen.** Each path covers the
   other's boundary without bypassing hook trust.

## Decision

Codex worktree bootstrap has two coordinated entry paths:

* `.codex/hooks.json` remains the synchronous `SessionStart` fast path. On successful provisioning,
  `tools/bootstrap-codex-worktree.mjs` returns a `SessionStart` `additionalContext` signal. Codex
  inserts that signal into developer context before the first model request.
* `.ruler/commands.md` is the source for a generated startup instruction in root `AGENTS.md` and
  `CLAUDE.md`. Before the first repository command in a Codex session, the agent checks for the
  success signal. When it is absent — including when Codex skipped an untrusted command hook — the
  first agent action runs the same dependency-free helper. Structured `continue: false` output stops
  the turn instead of allowing the requested project command to run against an unprepared checkout.
* The exact completion signal is drift-guarded in `tools/tests/bootstrap-codex-worktree.test.mjs`:
  the test obtains the value from the helper's successful result and requires the generated root
  instructions to contain it. The normal Ruler drift gate continues to enforce `.ruler/` as the
  source of generated instruction files under ADR-0058.

The hook remains the only path that can finish before the first model turn. The instruction fallback
begins during that first turn, but still runs before any repository command. Trusting the hook on
the laptop restores the earlier pre-model behavior without changing the fallback.

## Consequences

* \+ A first Android Remote session can prepare its worktree before running the user's requested
  project command even when the project hook has not been trusted yet.
* \+ Trusted hooks retain the deterministic pre-model bootstrap and failure stop.
* \+ Repository code never bypasses or weakens Codex's exact-hash hook trust boundary.
* \+ The hook and instruction paths share one helper, so Git safety, package-manager behavior, and
  failure messages cannot diverge.
* − The untrusted-hook fallback depends on the model following repository instructions and starts
  after the first model request rather than before it.
* − The Codex-specific fallback is present in generated Claude instructions too; its explicit Codex
  scope keeps it inactive there, but Ruler intentionally has one shared root-instruction source.
