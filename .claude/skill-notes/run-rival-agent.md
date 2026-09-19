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

## Cloud sessions: a seeded plan login

A Claude Code on the web session starts with no Codex CLI and no login, on a disk that is discarded
when the VM is reclaimed. Three ways of getting a login there were weighed on 2026-09-02:

* **Device-code auth works** — `codex login --device-auth` reached `auth.openai.com` through the
  TLS-intercepting egress proxy (Codex trusts the proxy CA via the preset `SSL_CERT_FILE`) and
  printed a real code. Rejected as the primary path only because it is a login per fresh VM: the
  user has to enter a code every time the container is reclaimed, and the account's device-code
  toggle is off by default.
* **An API key is permanent and rejected.** `OPENAI_API_KEY` is already in the environment for the
  image endpoint, and Codex accepts it non-interactively, but it bills metered credits, and the
  billing guard exists to refuse exactly that. Relaxing the guard for cloud would reverse the
  skill's premise for the one place where reviews would run unattended.
* **A seeded `auth.json`** is what shipped: `tools/seed-codex-auth.mjs` writes it from the
  `CODEX_AUTH_JSON` environment variable at SessionStart, only when no file exists, after running
  the seed through `assertSubscriptionAuth` plus a refresh-token check. The setup script installs
  the CLI but never touches the login, because the environment snapshot must not hold a credential.
  Base64 is the documented paste form because the dialog takes `.env` lines and a raw JSON value's
  quotes are at the mercy of its parser. `npm run rival:seed` produces the value on the laptop
  through the same encoder the hook decodes, signing in under `~/.codex-cloud` so the seed never
  shares a chain with the working login.

The model rides the same hook. `--ignore-user-config` leaves the launcher one place to find a model,
the top-level `model` of `config.toml`, and a fresh VM has none; the hook writes that file from
`CODEX_MODEL` when it is absent. Bundling the model into the seed envelope was rejected so the seed
stays exactly what `codex login` wrote and the guard validates; a second, non-secret variable is the
cheaper shape, and `rival:seed` prints the laptop's configured slug to paste beside it.

The seed's shelf life is set by refresh-token rotation, not expiry. Codex refreshes a bundle whose
`last_refresh` is older than about eight days and rotates the refresh token as it does; the rotated
file lands on the VM's disk and nothing writes it back into the dialog, so the first session to
refresh retires the seed for every later VM. The hook warns from day six. The seed must come from a
dedicated login: rotation retires the previous token in the same chain, so a copy of the user's
working `auth.json` would log the laptop out at the first cloud refresh, while independent logins on
one account coexist. Weekly re-seeding was chosen over the restore-run-write-back pattern OpenAI
documents for ephemeral CI runners, which needs a store the sandbox can reach (a private gist or
branch through the GitHub proxy, Netlify Blobs); none was worth building before a cloud review has
run end to end (issue #2095, open question 1).

The retired-seed failure was measured, not inferred: with a fake `auth.json` carrying an expired
access token and a refresh token the auth server never issued, `codex login status` and
`rival:health` both passed — both read only the file — and `codex exec` exited 1 within a second
with "Your access token could not be refreshed because your refresh token was already used." The
Codex vendor adapter recognizes that wording, the shared launcher skips the resume retry for it, and
the launch CLI prints the remedy for the platform it runs on. A liveness probe in the health check
was considered and rejected: the only honest probe is a real request, which either spends plan usage
or rotates the token itself.

The eight-day refresh interval comes from OpenAI's documentation, not from a measured cloud run; the
first re-seed will show whether the warning leads the rotation by enough. Whether a 401 ever
triggers a refresh earlier than that — an idle seed whose access token expired before its eighth day
— is the case that would shorten the shelf life below what the note above claims. A full cloud
launch (worktree, broker loop, post) is also still unrun; the Linux `/tmp` spool exposure in
`tools/rival-agent/NOTES.md` becomes live the day it does.

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
