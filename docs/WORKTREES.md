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

1. Brings a fresh checkout up to the latest `origin/main`, in one of two shapes (below). Any other
   worktree is left exactly where it is.
2. Provisions the pinned pnpm version (`corepack enable pnpm`, `corepack install`) and installs the
   frozen dependency tree (`pnpm install --frozen-lockfile --prefer-offline`).
3. Verifies the install by running `npm run info`.

The refresh runs before the install so the dependencies match the commit the session starts on.

### Refreshing a fresh worktree

Neither runner's worktree is reliably current when it arrives. A worktree is cut from a ref in the
shared `.git`, and that ref is only as fresh as the last fetch any checkout made. On 2026-09-25 a
Claude Code worktree branch was "Created from origin/main" two minutes after a PR merged, and it
started one merge behind. The Claude default (`worktree.baseRef` is `fresh`) picks the remote
default branch, but it does not fetch it first.

The primary checkout is never touched. The refresh changes nothing in its working tree and does not
move local `main`. The fetch updates only `refs/remotes/origin/main` in the shared `.git`, and
`FETCH_HEAD`, which is per-worktree.

**Detached at local `main`: the Codex shape.** A fresh Codex worktree is detached at whatever local
`main` pointed to. The bootstrap confirms there are no tracked changes, fetches `origin/main`
without tags, detaches at the fetched commit, and verifies `HEAD` landed there. A detached `HEAD` at
any other commit stays where it is. A detached `HEAD` that happens to equal local `main` is moved,
whatever put it there.

**On a named branch that carries no work: the Claude Code shape.** A fresh Claude Code worktree is
on its own branch, cut from `origin/main` without tracking it. The bootstrap fast-forwards the
branch only when all of these are true:

* The working tree is clean. `git status --porcelain --untracked-files=normal` prints nothing, so a
  tracked change or an untracked file blocks the refresh. Gitignored files, including the ones
  `.worktreeinclude` copies in, do not count.
* The branch was never published. It has no upstream, and `refs/remotes/origin/<branch>` does not
  exist. This reads local refs only. A branch of the same name pushed from another clone, and never
  fetched here, is not seen. Asking the remote would add a second network call to every fresh
  session. Moving the branch then loses nothing: it holds no commit of its own, the remote branch is
  untouched, and a later push is rejected as non-fast-forward.
* The branch ref has not moved since it was created. Every entry in its reflog
  (`git reflog show refs/heads/<branch>`) is a `branch: Created from …` or `Branch: renamed …`
  entry, or the reflog is empty. A commit, merge, reset, or pull disqualifies it.
* `HEAD` is already on `origin/main` (`git merge-base --is-ancestor HEAD refs/remotes/origin/main`),
  so the branch was cut from `main` and not from some other ref.

The reflog check is what makes the ancestry check safe. Ancestry alone cannot tell a fresh branch
from one whose commit reached `main` and was then reverted there. Every check is local and runs
against the last-known `origin/main` before any fetch, so a branch that has work never pays for a
network call. `main` only moves forward, so the ancestry answer also holds for the fetched commit.

When all four hold, the bootstrap fetches `origin/main` without tags. If the fetched commit is
already `HEAD`, it stops. If not, it runs `git merge --ff-only <fetched commit>` and verifies that
`HEAD` landed on that commit. The `--ff-only` merge also enforces the ancestry rule against the
fetched commit: it refuses instead of creating a merge.

When any check fails, `HEAD` stays where it is. A worktree that has real work is never moved, and
neither is an old worktree whose branch has moved even once. That includes one the bootstrap already
refreshed, so only a worktree's first session is brought up to date. The one kind of branch that is
moved without being fresh is one created directly at an old `main` commit and never touched since.
To keep a worktree there, move the branch once (`git reset --keep <sha>` writes a reflog entry), or
detach it at that commit (`git switch --detach <sha>`). Detaching does not protect a worktree
detached at local `main`; see the Codex shape above.

The hook matchers exclude `resume`, so a resumed session never reaches the refresh.

### Rival-agent worktrees

The `run-rival-agent` skill makes its disposable review worktrees with
`git worktree add --detach <dir> <head>` (`tools/rival-agent/worktree.mjs`). What protects them is
that the rival's session runs no project hooks, so the bootstrap never runs there. The Codex rival
starts with the `hooks` feature disabled (`ISOLATION_FEATURES` in `launch-codex.mjs`). The Claude
rival starts with `--restricted`, which ignores project settings. Being detached is not enough on
its own. A rival worktree pinned to a head that equals local `main` matches the Codex shape, and the
bootstrap would move it if it ran there. Keep the rival launchers' hook isolation in place for that
reason.

### Failure reporting

A failed refresh of a **named branch** is a warning. The session starts and the install still runs.
For a stale start, the agent needs one command to recover, and a refused `--ff-only` merge leaves
`HEAD` where it was, so there is no half-moved state to protect. Stopping the session would cost
more than the stale commit does. The warning uses the same shape for both runners:

```json
{
  "systemMessage": "…",
  "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "…" }
}
```

It has no `continue: false`, so a Codex session starts too. Codex 0.156.0 validates `SessionStart`
output against the same fields as Claude Code. The warning names the recovery commands:
`git fetch origin main && git merge --ff-only origin/main`, then `pnpm install --frozen-lockfile`.
If a later step fails and the bootstrap stops, the warning is added to the failure report.

A failed install, and a failed refresh of the **detached Codex shape**, stop the bootstrap. How that
is reported differs because the two runners read different hook contracts, which is what `--runner`
selects:

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

### The install goes stale, and the bootstrap will not notice

The hook runs once per session and its matchers exclude `resume`, `clear`, and `compact`, so nothing
reinstalls after the worktree merges `main`. A dependency bump then advances `package.json` and the
configs that came with it while the installed tree stays where it was, and the first thing to break
is dprint: `dprint.json` names its plugins by path relative to cwd, so it reads this checkout's
`node_modules` or nothing, while the tools Node resolves walk upward and silently borrow the main
checkout's. The symptom pointed away from the cause — dprint reported the config option its older
plugin could not parse, and CI stayed green because CI installs fresh.

`tools/check-dprint-plugins.mjs` closes that gap. It runs as the `preformat:md` /
`preformat:md:check` prehook and at the top of `ruler:apply`, compares each plugin's installed
version against the range in `package.json`, and fails naming the gap and
`pnpm install --frozen-lockfile`. After merging `main` into a long-lived worktree, run that install
rather than waiting for the guard.

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

Raw performance captures are not copied either, and `npm run gen:performance-matrix` needs them. The
matrix's `sources.json` names raw captures under gitignored `perf-profiles/<campaign>/` for every
section it declares by path, so in a fresh worktree the generator stops with `ENOENT` on the first
such file. It does not fall back to published numbers. Symlink that campaign directory from the main
checkout (the first entry of `git worktree list`), or copy it back from a `worktrees:salvage`
folder; the ignore rule keeps either out of commits. Sections declared `preserved` or
`captured-untracked` in `sources.json` never read raw captures: they are copied from the published
`data.json` in every checkout and are listed in each mode's `preservedSections` or
`untrackedSections`. A section not on either list was freshly normalized from its raw capture.

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
