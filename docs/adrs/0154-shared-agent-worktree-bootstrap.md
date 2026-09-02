# ADR-0154: One Startup Bootstrap Provisions Every Agent Worktree

**Status:** Active **Date:** 2026-09

## Context

Both agent runners now cut a linked git worktree per session — Codex through its worktree manager,
Claude Code through `--worktree`, the `EnterWorktree` tool, and the desktop app's parallel sessions,
where **every** new session gets one. A linked worktree is a fresh checkout of the tracked files
only, so it opens with no `node_modules`, no `web/.env`, and no Android SDK path. Every `npm run …`
in it fails until something fixes that.

Only the Codex half was solved. `tools/bootstrap-codex-worktree.mjs` ran from `.codex/hooks.json`
and provisioned dependencies, but it returned early for any worktree whose `HEAD` was attached to a
branch — which is the shape every Claude Code worktree arrives in — so a Claude worktree got
nothing. `.claude/hooks/session-start.sh` exits immediately unless `CLAUDE_CODE_REMOTE=true`, on the
premise that "local sessions manage their own deps"; that premise predates local Claude worktrees.

The alternatives considered:

* **A `WorktreeCreate` hook.** Claude Code lets a hook replace worktree creation outright. Rejected:
  the hook *replaces* the default git logic, which also means `.worktreeinclude` stops being
  processed, so every gitignored file would have to be re-copied by hand inside the hook — trading a
  declarative list for a script that silently drifts from it.
* **A second, Claude-specific bootstrap script.** Rejected: the provisioning is byte-for-byte the
  same work, and two copies of a `corepack`/`pnpm` sequence is exactly the cross-file agreement this
  repo refuses to maintain by prose.
* **Leaving Claude worktrees manual.** Rejected: the desktop app makes a worktree per session, so
  the cost is paid on every session rather than occasionally.

## Decision

One script, `tools/bootstrap-worktree.mjs`, provisions a linked worktree for either runner. It is a
no-op in the primary checkout (`--git-dir` equals `--git-common-dir`), and in a linked worktree it
runs `corepack enable pnpm` → `corepack install` → `pnpm install --frozen-lockfile --prefer-offline`
→ `npm run info`.

Two things stay runner-shaped, and a `--runner=` flag selects them:

* **What moves `HEAD`.** `needsStaleMainRefresh()` gates the fetch-and-detach refresh on the
  worktree being *detached at the local `main` commit* — the shape a fresh Codex worktree arrives
  in. A Claude Code worktree is already branched from the remote default (`worktree.baseRef`
  defaults to `fresh`) and arrives attached to that branch, so its `HEAD` is never touched. This
  gate replaces the old `branch !== 'HEAD'` early return, which skipped provisioning entirely; an
  attached Codex worktree now gets dependencies too.
* **How failure is reported.** Codex reads a stop decision from stdout
  (`{ continue: false, stopReason, systemMessage }`, exit 0). Claude Code splits the two audiences
  across two fields that cannot substitute for each other: top-level `systemMessage` is a warning
  shown to the **user** and never reaches the model, while `hookSpecificOutput.additionalContext` is
  the only field that puts the failure into **Claude's** context. The bootstrap returns both, so a
  failed install is visible to the person who can fix it and to the agent that will otherwise run
  `npm` against an empty `node_modules`. Returning only one still looks like it worked, which is why
  `tools/tests/bootstrap-worktree.test.mjs` pins `additionalContext` by name.

The non-obvious invariant is the working directory. Claude Code keeps `${CLAUDE_PROJECT_DIR}`
pointing at the **main checkout** after entering a worktree and reports the worktree only through
the `cwd` field of the hook's stdin payload. So the hook command in `.claude/settings.json`
necessarily names the main checkout's copy of the script, and the script reads the directory to
provision from stdin, falling back to `process.cwd()`. Without that read, the hook would install
into the main checkout and leave the worktree it was called for empty.

Gitignored files stay declarative in `.worktreeinclude`, which both runners honor: `web/.env`,
`android/local.properties` (`sdk.dir`, without which every Gradle invocation fails), and
`ios/local.xcconfig` (`DEVELOPMENT_TEAM`). Release signing material is deliberately excluded — store
builds are host-exclusive and run from the main checkout, so copying the upload key into every
throwaway worktree adds exposure and buys nothing.

Both registrations are matched on `startup` only, so the hook does not rerun on resume, clear, or
compact. `tools/tests/bootstrap-worktree.test.mjs` pins both hook registrations, the full command
sequence for each worktree shape, the payload-over-process directory precedence, and both failure
contracts.

## Consequences

\+ A Claude Code worktree — including every desktop parallel session — opens with dependencies
installed and `web/.env`, `android/local.properties`, and `ios/local.xcconfig` in place.

\+ One implementation of the provisioning sequence, so a change to how this repo installs cannot
apply to one runner and not the other.

\+ An attached linked worktree now gets dependencies under Codex as well, where it previously got
nothing.

− The bootstrap adds an install to the front of every fresh worktree session. It is a warm-cache
`--prefer-offline` install, but it is not free, and it runs before the first model turn.

− A Claude Code session cannot be gated on a successful install. `SessionStart` blocks on no exit
code, and a schema-valid JSON body makes Claude Code ignore the exit code entirely, so a worktree
whose install failed still opens — carrying the warning, but open. Codex can stop its turn; Claude
can only be told.

− The Claude hook executes the **main checkout's** copy of the script, not the worktree's. A change
to the bootstrap does not take effect for a worktree session until it lands in the main checkout —
which is a property of `${CLAUDE_PROJECT_DIR}`, not something this repo can configure away.

− A subagent with `isolation: worktree` still gets no provisioning: no `SessionStart` fires for it.
No agent in this repo declares that isolation today, so the gap is documented in `docs/WORKTREES.md`
rather than worked around.

− `.worktreeinclude` copying is only observable from a genuinely new worktree, so a bad entry there
is not caught by the test suite — unlike the bootstrap, which is.
