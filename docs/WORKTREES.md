# Agent worktrees

Both agent runners cut a linked git worktree per session — Claude Code through `--worktree`, the
desktop app's parallel sessions, and the `EnterWorktree` tool; Codex through its own worktree
manager. A linked worktree is a fresh checkout: it has the tracked files and nothing else, so
without setup it has no `node_modules`, no `web/.env`, and no Android SDK path. Every `npm run …` in
it fails until that is fixed.

Two mechanisms fix it, and they are split by whether the file is tracked.

## Dependencies: the startup bootstrap hook

`tools/bootstrap-worktree.mjs` runs as a synchronous `SessionStart` hook, once per session, before
the first model turn. It is a no-op in the primary checkout — it compares `--git-dir` against
`--git-common-dir` and returns immediately when they match.

In a linked worktree it:

1. Refreshes the checkout **only** when it is detached at the local `main` commit — the shape a
   fresh Codex worktree arrives in. It confirms there are no tracked changes, fetches `origin/main`
   without tags, detaches at the fetched commit, and verifies `HEAD` landed there. A Claude Code
   worktree arrives on its own branch already cut from the remote default (`worktree.baseRef`
   defaults to `fresh`), so this step is skipped and `HEAD` is never moved.
2. Provisions the pinned pnpm version (`corepack enable pnpm`, `corepack install`) and installs the
   frozen dependency tree (`pnpm install --frozen-lockfile --prefer-offline`).
3. Verifies the install by running `npm run info`.

Failure reporting differs because the two runners read different hook contracts, which is what
`--runner` selects:

| Runner | On failure                                                                 | Session |
| ------ | -------------------------------------------------------------------------- | ------- |
| Codex  | `{ continue: false, stopReason, systemMessage }` on stdout, exit 0         | stopped |
| Claude | `systemMessage` + `hookSpecificOutput.additionalContext` on stdout, exit 0 | starts  |

The two Claude fields are not interchangeable, and getting this wrong fails silently. Top-level
`systemMessage` is a **warning shown to the user** and never reaches the model;
`hookSpecificOutput.additionalContext` is the only field that puts the failure into Claude's
context. A hook that returns one and not the other still looks like it worked.

The exit code carries nothing here. `SessionStart` cannot block on any exit code — even exit 2 only
shows stderr to the user — and a schema-valid JSON body makes Claude Code ignore the exit code
rather than report a hook error. So the session always starts, and the bootstrap exits 0, the
documented exit code for structured output. Its stderr reaches the debug log only.

### Why the Claude hook reads its directory from stdin

Claude Code keeps `${CLAUDE_PROJECT_DIR}` pointing at the **main checkout** after it enters a
worktree, and reports the worktree only through the `cwd` field of the hook's input JSON. So the
hook command necessarily names the main checkout's copy of the script, and the script reads the
directory to provision from the payload on stdin, falling back to `process.cwd()`. Without that, the
hook would install into the main checkout and leave the worktree empty.

Codex resolves `$(git rev-parse --show-toplevel)` in the hook's own working directory, so its
command reaches the worktree's copy directly; the stdin path is harmless there.

### Registration

* Claude: a `SessionStart` group in `.claude/settings.json` matched on `startup`.
* Codex: the `^startup$` group in `.codex/hooks.json`.

Both matchers exclude `resume`, `clear`, and `compact`, so the hook does not rerun mid-session.
`tools/tests/bootstrap-worktree.test.mjs` pins both registrations and the whole command sequence.

### Codex hook trust

Project hooks need a one-time trust review. When Codex reports that the hook needs review, open
`/hooks` on the laptop running Codex, inspect `.codex/hooks.json`, and trust it. Android Remote
cannot complete that laptop-side review while creating a worktree; if a remote session starts before
the hook is trusted, trust it on the laptop and start a new session — the skipped startup hook does
not rerun in the existing one. Codex asks again only when the hook definition changes.

## Gitignored files: `.worktreeinclude`

`.worktreeinclude` at the repo root lists gitignored files to copy from the main checkout into every
new worktree. It uses `.gitignore` syntax, and only files that are both matched and gitignored are
copied, so tracked files are never duplicated. Claude Code applies it to every worktree it creates
with git — `--worktree`, subagent worktrees, and desktop parallel sessions — and Codex applies it to
its own local worktrees.

What is listed and why:

| Path                       | Why a worktree needs it                                   |
| -------------------------- | --------------------------------------------------------- |
| `web/.env`                 | API keys the dev server and `/api/*` functions read       |
| `android/local.properties` | `sdk.dir` — every Gradle invocation fails without it      |
| `ios/local.xcconfig`       | `DEVELOPMENT_TEAM` for automatic signing on device builds |

Release signing material (`android/keystore.properties`, `android/upload-keystore.jks`) is
deliberately **not** copied. Store builds are host-exclusive and run from the main checkout, so
spreading the upload key across every throwaway worktree buys nothing.

`.claude/settings.local.json` needs no entry: Claude Code saves worktree permission approvals to the
main checkout's copy and reads them from there in every worktree of the repository.

A `WorktreeCreate` hook would replace the default git worktree logic entirely and stop
`.worktreeinclude` from being processed at all. This repo has no such hook, and adding one would
mean re-implementing the copying by hand.

## Known gap: subagent worktrees

A subagent with `isolation: worktree` in its frontmatter gets its own worktree, but no
`SessionStart` fires for it, so nothing provisions its dependencies. No agent in this repo declares
that isolation today. An agent that needs to run `npm run …` in its own worktree has to install
first.

## Retiring a worktree

Nothing above runs in reverse on its own: a finished session leaves its worktree, its branch, and
its gitignored output behind. Two scripts in `tools/git-housekeeping/` retire agent worktrees, and
the `prune-git-workspace` skill runs them in order with the branch cleanup that follows:

1. `npm run worktrees:salvage` moves gitignored evidence worth keeping — `perf-profiles/` captures
   and red-team `decrypted/` and `output/` — to `~/Code/splotch-worktree-evidence/<worktree id>/`.
   `git worktree remove` deletes ignored paths without asking, so this runs first.
2. `npm run worktrees:prune` removes each agent worktree that is clean, merged into `origin/main`,
   salvaged, locked by nobody, and no process's working directory, printing `removed`, `kept`, or
   `skip (in use)` with the reason. It never touches the main checkout, the worktree it runs from, a
   worktree outside the agent roots (`.claude/worktrees/`, `~/.codex/worktrees/`, `/tmp`), or any
   branch.

Both are dry runs until `-- --apply`. A worktree another session is using shows up as
`skip (in use)` with the process ids, which is the expected shape on a host running several agents
at once; leave it.

## Sharing the host

Agent-managed worktrees share host ports and machine capacity, whichever runner cut them. The rules
for that — explicit ports, `EADDRINUSE` handling, and which suites are host-exclusive — are in the
root `CLAUDE.md`/`AGENTS.md` under "Concurrent worktrees".
