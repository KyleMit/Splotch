# Permission installation and trust boundary

Run `npm run run-claude:install` once from the trusted canonical checkout, approve that fixed Node
command in Codex, and restart Codex so its config and rules reload. The installer:

* sets `approval_policy = "on-request"`, `approvals_reviewer = "auto_review"`, and
  `sandbox_mode = "workspace-write"` in `~/.codex/config.toml`;
* copies the vendor-neutral core from `tools/rival-agent/` and this package's launcher, health
  probe, publisher alias, and billing guard into `~/.local/libexec/splotch-rival-agent/`, repointing
  the package files' core imports at their new siblings, and writes a manifest hashing every file;
* writes the two fixed shims `implement-issue-stack` invokes,
  `~/.local/libexec/splotch-claude-review-publish.mjs` and
  `~/.local/libexec/splotch-claude-health.mjs`, and removes the files earlier installers wrote;
* allows only the launcher, the poster, the publisher alias, and the health probe at Codex's
  approval boundary while forbidding raw Claude entry points.

The launcher and health probe hash every installed file against the manifest before launching the
rival; the publisher alias inherits that check through the launcher. The standalone poster relies on
the launcher having verified the session's installed package. In the checkout there is no manifest
and nothing to verify — the checkout is the source. The reviewed worktree is untrusted material, and
the installed wrappers import nothing from it.

## What the rival can do

The rival runs as `claude --print` with:

```text
--restricted --permission-mode dontAsk --tools Read,Grep,Glob
--allowedTools Read,Grep,Glob,mcp__broker__run --mcp-config <broker only> --strict-mcp-config
--no-chrome --add-dir <packet> --output-format stream-json --verbose --json-schema <findings>
--session-id <wrapper-issued uuid> | --resume <recorded uuid>
```

`--restricted`, not `--safe-mode`: safe mode disables `--mcp-config` along with everything else,
which is how the first probe of this design ran with no broker at all. Restricted mode removes the
command-running tools, confines the file tools to the worktree and the packet, refuses
`bypassPermissions`, and ignores user and project settings. `--strict-mcp-config` leaves the broker
as the only MCP server. The rival has no Bash, no web, no edit tools, and no GitHub; the broker is
the only door out, and `MCP_TOOL_TIMEOUT` is raised so a brokered call can wait through a handler
turn and a long command.

The worktree's dependency install runs with `--ignore-scripts` and `--ignore-pnpmfile`: the reviewed
commit owns `package.json` and `.pnpmfile.cjs`, and a PR-controlled `postinstall` or pnpmfile hook
would otherwise run at launch before anyone read the diff. A commit whose lockfile records a
pnpmfile checksum fails the install loudly instead.

## What the handler does

Every brokered command runs through this session's `exec_command` with the rival's command text
inline, so the sandbox, the exec policy's `prefix_rule`s, and Auto-review judge it exactly as they
would judge the handler's own command. The broker never executes anything and holds no allowlist or
denylist; a request the handler would refuse for itself is refused for the rival, and the reason
goes back to the rival as data.

The launcher, the poster, and the health probe run escalated because the Claude login and the GitHub
token live in the macOS Keychain, which the Seatbelt sandbox cannot read. A `prompt` decision in the
installed policy reviews an explicitly escalated command; it does not turn a default sandboxed
invocation into host execution, so a sandboxed health failure does not establish that the
installation or Claude authentication is stale.

Prompt text never enters the parent command line: the rival prompt, extra instructions, and
questions are delivered on stdin, and instruction files are read from an absolute regular file
capped at 256 KiB.

## Billing

Every wrapper rejects environment variables that select API-key, Bedrock, Vertex, or Foundry
billing. `CLAUDE_CODE_OAUTH_TOKEN` remains allowed because it is a Claude plan token; local use
normally authenticates through the Keychain. The health probe additionally requires
`claude auth status` to report a logged-in, non-API-key session.

## Rounds and the alias

A review is keyed to the checkout plus the PR number, the commit, or the branch, and the Claude
session id is recorded owner-only under `~/.config/splotch-rival-agent/ledger/`. Three rounds is the
budget. `--end-session` deletes the conversation's transcript and sidecar directory under
`~/.claude/projects/` — only for an id the ledger holds, which only ever holds ids this launcher
issued — and removes the record.

The orchestrated alias `splotch-claude-review-publish.mjs --pr <n>` runs without a handler: it
declines every broker request with one fixed reason, waits for the rival to finish, and posts. It
keeps the fixed path, the `--pr`/`--end-session` contract, the one-`COMMENT`-review rule, the hidden
marker, and the three-round budget that `implement-issue-stack` relies on.

The prefix rules are not a complete remote security perimeter. Repository protections and narrowly
scoped credentials remain the hard remote guarantees; Auto-review evaluates operations that reach
the escalation boundary. A denial remains a real stop or safer-path signal; never route around it.

Run `npm run run-claude:policy:check` before use. Use
`codex execpolicy check --rules ~/.codex/rules/default.rules --pretty < command.txt` to inspect the
effective decisions after installation.
