# Rival agent simplification — pilot probes and rounds (2026-09-02)

Working notes for the pilot that asks whether two hand-rolled layers of `run-rival-agent` can be
replaced by things the vendors ship. The pairing itself and its build log are in
`rival-agent-pairing-2026-09-02.md`; this note records only what the pilot measured. Vocabulary is
unchanged: the **native handler** runs in the current runner and holds its permissions; the **rival
agent** is the other vendor's CLI in a disposable worktree.

The two layers under test:

* **Layer 1, the broker and handler loop.** The rival cannot execute anything; the handler polls a
  spool and runs each command for it. Candidate substitute: a real shell inside a sandbox scoped to
  the disposable worktree with the network off, so the rival verifies its own claims.
* **Layer 2, the Codex-side trusted install** under `~/.local/libexec/splotch-rival-agent/`, which
  exists because Codex's sandbox cannot read the Keychain holding the Claude login and the GitHub
  token. Candidate substitute: the hosted first-party reviewers (`anthropics/claude-code-action` and
  the Codex GitHub integration).

Versions: `codex-cli 0.149.1`, Claude Code 2.1.251, macOS. Every probe below was run, not read from
documentation, unless it says otherwise.

## Probe 1 — Codex `workspace-write` confined to the disposable worktree

Model-free, using `codex sandbox`, in a worktree created by the launcher's own `worktree.mjs` at
main (`94d15c2ca5be494df02f5cc4c48774e1492cc4a4`, install included, 4.3 s). Note `codex sandbox`
refuses `-C` without `--permission-profile`; the working root is the process cwd instead.

```sh
cd "$WT" && codex sandbox -c 'sandbox_mode="workspace-write"' -- bash -c '…'
```

| Command                                                        | Result                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npx vitest run --config tools/vitest.config.mjs …ledger.test` | 3 passed; `node_modules/.vite-temp` write allowed                                          |
| `touch ./probe-inside`                                         | ok                                                                                         |
| `touch ~/probe-outside`                                        | `Operation not permitted`                                                                  |
| `touch /Users/kylemit/Code/Splotch/probe-outside`              | `Operation not permitted`                                                                  |
| `touch "$TMPDIR/probe"` and `touch /tmp/probe`                 | both allowed — the temp root, where the session spool lives, is writable                   |
| `git commit --allow-empty`                                     | `Unable to create '…/Splotch/.git/worktrees/worktree/index.lock': Operation not permitted` |
| `curl -sS -m 5 -I https://example.com`                         | `Could not resolve host` — network off by default                                          |
| `npm run --silent check`                                       | `1609 FILES 0 ERRORS 0 WARNINGS` in 4.9 s                                                  |
| `npm run --silent build`                                       | exit 0, bundle budgets printed, 4.9 s wall                                                 |

**Holds.** Tests, type check, and build run without escalation; writes outside the worktree and the
temp root are refused; a commit is refused because a linked worktree's gitdir lives under the
canonical checkout's `.git`, which is outside the writable root. The one soft spot is the temp root:
the rival can write into its own session directory. Nothing there is read as instructions, and the
findings come from the stream's final message rather than from a file, so the launcher does not
trust the spool for anything on the sandboxed path.

## Probe 2 — both Codex sandboxes read the whole disk

```sh
codex sandbox -c 'sandbox_mode="read-only"'      -- wc -c ~/.codex/auth.json      # 3944
codex sandbox -c 'sandbox_mode="workspace-write"' -- wc -c ~/.codex/auth.json     # 3944
codex sandbox -c 'sandbox_mode="workspace-write"' -- wc -c /Users/kylemit/Code/Splotch/web/.env   # 975
codex sandbox -c 'sandbox_mode="workspace-write"' -c 'sandbox_permissions=[]' -- wc -c ~/.codex/auth.json  # 3944
```

**Confirmed, and there is no read restriction to reach for:** `sandbox_permissions=[]` changes
nothing. So the disposable worktree omitting `.worktreeinclude` secrets protects nothing against a
Codex rival on either path; it only keeps the secrets out of the diff packet.

**Decision on web search.** The read-only pairing path keeps web search on, as before; its shell
cannot write and every execution passes through the handler, and the exposure is now written down in
`references/permissions.md`. The workspace-write path pins `web_search="disabled"`: the diff under
review is untrusted input, the sandbox reads every file on the disk, and web search would be the one
outbound channel a prompt injected through the diff could carry a file out on. The key is real —
`codex exec --strict-config` accepts a config with `web_search = "disabled"` and rejects
`web_search_bogus_key` as an unknown field — but whether the pin removes the tool from the model's
list was not observed directly (`codex debug prompt-input` does not render tools). The network pin
`sandbox_workspace_write.network_access=false` restates the measured default explicitly.

## Probe 3 — Claude Code's sandboxed Bash in print mode

Settings from the current sandboxing docs (`code.claude.com/docs/en/sandboxing`), supplied on the
command line, which `--restricted` honours (it ignores settings *files*, not `--settings`):

```sh
claude -p --restricted --permission-mode dontAsk --tools Read,Grep,Glob,Bash \
  --allowedTools Read,Grep,Glob,Bash --strict-mcp-config --no-chrome --model sonnet \
  --add-dir "$PACKET" --settings '{"sandbox":{"enabled":true,"failIfUnavailable":true,
  "allowUnsandboxedCommands":false,"autoAllowBashIfSandboxed":true,
  "network":{"strictAllowlist":true,"allowedDomains":[]}}}' "<run one command, echo it back>"
```

Round one, no filesystem overrides (12.5 s, two turns, $0.04 of plan usage):

| Command                                     | Result                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `touch ./probe-inside`, `touch $PACKET/…`   | ok, ok — cwd and `--add-dir` writable                          |
| `touch ~/probe-outside`, canonical checkout | `Operation not permitted`                                      |
| `touch $TMPDIR/probe` / `touch /tmp/probe`  | ok / `Operation not permitted` — session temp only, not `/tmp` |
| `wc -c ~/.codex/auth.json`, `…/web/.env`    | readable, same as Codex                                        |
| `curl -I https://example.com`               | `CONNECT tunnel failed, response 403` — the proxy denies       |
| targeted Vitest                             | 3 passed                                                       |
| `git commit --allow-empty -q`               | **succeeded** — see below                                      |

Round two, following that commit: `git update-ref` in the canonical checkout succeeded,
`touch
/Users/kylemit/Code/Splotch/.git/rival-probe-file` succeeded, and
`git push /Users/kylemit/Code/Splotch
HEAD:refs/heads/rival-sandbox-push` created a branch there
(all removed afterwards). Claude's sandbox resolves a linked worktree's gitdir and grants write
access to the **whole** canonical `.git`, which Codex's sandbox refuses. A Claude rival confined
only by the defaults can write refs and objects into the shared repository.

Round three, with
`"filesystem":{"denyWrite":["/Users/kylemit/Code/Splotch/.git"],"denyRead":["/Users/kylemit/.codex"]}`
added: `update-ref` → `cannot lock ref … Operation not permitted`; `git status --short` still exits
0; `ls ~/.codex` → `Operation not permitted`; targeted Vitest still passes.

**Holds with two explicit deny lists**, not with the defaults. A Claude-rival sandboxed path would
have to pin `denyWrite` on the canonical `.git` and `denyRead` on the credential directories, and
the launcher would have to compute both from the repo root. Also observed: the sonnet rival refused
one probe outright as a credential-reading trap before the sandbox was consulted, which is a model
judgement the design cannot rely on but should not be surprised by. The Claude-side launcher does
**not** get the flag in this pilot; it is refused with
`the claude rival has no workspace-write
launch path`.

## Probe 4 — the hosted first-party reviewers

**4a, `anthropics/claude-code-action` running the tests.** `CLAUDE_CODE_OAUTH_TOKEN` exists in both
the Actions store (2026-07-16) and the Dependabot store (2026-07-28), so a non-Dependabot workflow
can use it. `.github/workflows/claude-review.yml` was added on this PR: label-gated
(`claude-review`, declared in `.github/labels.yml`), `pull_request: [labeled]` so the workflow file
runs from the PR head and can be exercised on the PR that introduces it, `setup-pnpm` with the
install, and an `allowedTools` list that admits the targeted test runners, `npm run check`, the lint
gates, and `gh pr comment` as the only GitHub write. Whether it runs the tests under the token is
the part the pilot PR itself exercises; see the rounds section below.

**4b, the Codex GitHub integration.** Already installed: `chatgpt-codex-connector[bot]` has
commented on 45 PRs in this repository. Every one was an automatic review posted after the last push
(`### 💡 Codex Review … automated review suggestions`, e.g. PR 1134 at 2026-08-18T21:05Z, reviewing
commit `ae4129577a`), with no `@codex` trigger comment. The activity runs from PR 289 (2026-07-16)
to PR 1134 (2026-08-18) and then stops; 278 PRs have been opened since with none. So the integration
is enabled at the account level but automatic reviews are off, or were turned off on 2026-08-19.
Turning them back on, or confirming the `@codex review` mention path, is an account setting on
chatgpt.com that only the account owner can change; it was not changed here.

## The flagged launcher path

`--sandbox read-only|workspace-write` on the shared launch arguments (default `read-only`, the
pairing). On `workspace-write` the Codex launcher attaches no broker, pins
`sandbox_mode="workspace-write"`, `sandbox_workspace_write.network_access=false`, and
`web_search="disabled"`, keeps every other pin, and the rival prompt swaps its execution section
(`rival-prompt-broker.md` → `rival-prompt-sandbox.md`) so a rival with a shell is never told about a
`run` tool it does not have, nor that its worktree is read-only. A vendor without a
`sandboxedToolBoundary` is refused before a worktree is provisioned. `session.json` records
`sandbox` and `broker`. Tests: `tools/rival-agent/tests/{launch,prompt}.test.mjs` and
`tools/tests/launch-codex.test.mjs`.

## Rounds

*Filled in below as they run.*
