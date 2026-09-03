# Run Rival Agent (Claude side: Claude handles, Codex rivals) — handler-side notes

This is the Claude-side package of `run-rival-agent`: Claude Code is the **native handler**, Codex
the **rival agent**. The design history both packages share — why a handler and a rival, what the
probes changed, the 2026-09-02 decisions and their rejected alternatives, the accepted exposures,
the seeded-defect bench, and the Claude versus Codex parity table — lives in
`tools/rival-agent/NOTES.md`, beside the code, so that neither provider's note is the primary one.
Read that first. This note keeps only what is specific to Claude being the handler and Codex the
rival. The Codex-side package, with its own note under `.agents/skill-notes/`, has the roles
swapped.

## Nothing to install

Claude Code runs its Bash tool on the host, so the launcher, the broker CLI, and the poster run
straight from the checkout. The Codex-side package needs a trusted install under `~/.local/libexec`
because Codex's sandbox cannot read the Keychain holding the Claude login and the GitHub token; this
side has no such boundary, which is why `rival:launch` is a plain `node` script and the skill has no
setup section.

## The billing guarantee

Enforced three ways, because a metered run looks identical to a plan run: the stored login must be
`auth_mode: "chatgpt"`, API-key environment variables are stripped from the child, and
`model_provider`, `cli_auth_credentials_store`, and `openai_base_url` are pinned on the command line
above any config file. Pinning rather than validating is deliberate: validation has to enumerate
every precedence layer, an override does not. Any further precedence layer found later should be
fixed the same way. `CODEX_ACCESS_TOKEN` is on the strip list because, measured on 0.149.1, Codex
ignores the stored ChatGPT login entirely when it is set and bearer-authenticates against the API.

## What `--ignore-user-config` costs

It is the only pin that leaves the user's MCP servers behind (a `-c mcp_servers=…` override merges
into the configured table), and it drops the configured `model` with them. The launcher reads that
one top-level key back and passes it as `-m` so the documented default survives; a model in a
profile table is deliberately not read, because the rest of that profile is gone too.

## Rounds

`codex exec` spawns a child thread under a thin parent and only the parent id reaches the stream;
the parent carries the verdicts and is what the ledger records. Resuming needs `exec resume --all`
because Codex filters recorded threads by the directory they ran in and every round's worktree is
new, and it cannot take `-C`, so the process cwd is the worktree on that path.

## Serving the broker from Claude

`broker next --timeout-seconds 100` sits under the Bash tool's two-minute default, so the loop is
one call per wait rather than one long call that dies without JSON. The handler command it prints
runs the rival's text as one quoted `bash -c` argument inside the worktree with output captured to
the spool, which is what lets this session's permission mode, the project's deny rules, and the
auto-mode classifier read exactly what the rival asked for. A classifier decline of a brokered
command is the design working, not a fault to route around; the reason goes back to the rival as
data and the claim lands under `unverified`.
