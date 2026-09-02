# Run Rival Agent (Claude side: launching Codex) — design notes

This is the Claude-side package of `run-rival-agent`, the skill that launches the other vendor's
local authenticated CLI; the Codex-side package, with its own note under `.agents/skill-notes/`,
launches Claude. The two sides share one name so shared prose can reference the capability without
knowing which runner it is on — each provider tree simply carries the package that launches the
*other* vendor, and nothing detects the session at runtime. Until 2026-09 this side was the separate
skill the Claude-side package; the `run-codex:*` npm scripts keep that name because they name the
process they launch. A copy of this package in the Codex tree would tell Codex to orchestrate an
independent Codex process, which is not a second opinion.

## Why this one has no installer

The two sides are mirror images in purpose but not in size. the Codex-side package needs an
installer, `~/.local/libexec` wrappers, hashed settings, and a Codex exec-policy because Codex runs
inside a Seatbelt sandbox that cannot read the macOS Keychain, so reaching Claude at all requires a
reviewed escalation boundary. Claude Code's Bash tool already runs on the host, so the Claude-side
package needs none of that: `npm run run-codex:*` reaches the Codex CLI directly, and
`Bash(npm run *)` is already allowed, so the skill added no new permission rules.

Resisting the urge to mirror the installer was the main design decision. Copying that machinery
would have produced several hundred lines defending a boundary that does not exist here.

## The billing guarantee

The skill exists to spend the ChatGPT plan's included usage, never API credits, and that is the one
property a user cannot verify by reading the output — a metered run looks identical to a plan run.
So it is enforced three ways rather than asserted once: the stored login must be
`auth_mode:
"chatgpt"`, API-key environment variables are stripped from the child, and
`model_provider` is pinned to `openai` on the command line.

The third check was added after the skill's own first review pointed out that a project-level
`.codex/config.toml` inside the reviewed worktree outranks the `$CODEX_HOME` config the guard was
inspecting — a reviewed checkout could have redirected its own review onto a metered provider. That
is also the argument for pinning on the command line rather than validating more config files:
validation has to enumerate every precedence layer, an override does not. A second review round made
the same argument again about `cli_auth_credentials_store`: a project config selecting the keyring
would have left the guard validating an `auth.json` the child never loads. Both were fixed by
pinning, and any third precedence layer found later should be fixed the same way.

Stripping rather than refusing on an inherited `OPENAI_API_KEY` is deliberate. Refusal is what the
Codex-side package does, because it cannot be sure which of several selectors Claude will honor.
Here the precedence is known, so removing the variable from the child is both stricter and usable
from a shell that exports one for unrelated work.

## Two profiles, not three

`review` wraps `codex exec review`, whose harness already produces file-and-line anchored findings
with `[P1]`–`[P3]` priorities. `ask` is the free-form read-only fallback. Both are read-only; no
write-capable profile exists, and the PR-publishing profile that the Codex-side package carries has
no analog because `leave-pr-review` already owns posting to GitHub from this side.

`codex exec review` rejects a scope flag and a custom `PROMPT` in the same invocation, which is not
documented in its help text and was found by running it. The wrapper therefore has two shapes: with
no focus instructions it passes the scope flag and lets Codex's harness drive; with instructions it
passes `-` and moves the scope into the prompt text. If a future Codex release lifts that
restriction, collapse the two shapes back into one.

## "Read-only" was read-only in name only

The first version pinned `sandbox_mode="read-only"` and the docs claimed Codex "cannot edit files,
commit, push, or reach GitHub". Both halves were false, and the skill found it out by reviewing its
own pull request: the reviewer read `leave-pr-review`, created a git worktree, and posted a review
to PR 1520 — while reporting, as its finding, that the sandbox did not prevent exactly that.

Two independent escapes, each needing its own control:

* **Approval escalation.** `sandbox_mode` sets where the sandbox starts, not where the run ends.
  With `approval_policy="on-request"` Codex asks to step outside, and a configured
  `approvals_reviewer` grants it with no human involved. Measured: read-only alone created a file;
  `approval_policy="never"` denies it. Anyone hardening a Codex invocation should pin the approval
  policy first and the sandbox second — the sandbox is the weaker of the two.
* **Ambient tool surfaces.** Hooks, configured MCP servers, and the built-in `apps` server all run
  outside the sandbox. `apps` is the dangerous one: it ships GitHub read *and write* tools with
  their own credentials, so no filesystem policy touches it.

The general lesson is the same one the billing guard keeps teaching: a guarantee that rests on one
setting is a guess. Both of these are now asserted per-profile by tests, because a control that goes
missing here fails silently and looks like a working review.

Web search is deliberately left on. It cannot write, and the round that found these gaps used it to
check Codex's own documentation. The honest cost is that a query is outbound traffic.

## Rounds resume; the framing is half the point

Sessions are keyed to checkout plus branch and resumed on later rounds, mirroring what the
Codex-side package does for PR review rounds. The token saving is real but secondary. The reason is
that a reviewer asked cold to find defects for the fifth time will find something whether or not
anything is there — so a later round is told which findings it already made, asked to check those
were addressed first, and told outright that no defects is a correct answer.

`codex exec review` spawns a child thread that does the work under a thin parent, and only the
parent id reaches the JSON stream. Both resume, very differently: the parent carries the verdicts at
about 16k tokens, the child the full working context at about 293k. The parent is what this skill
records — it is the documented surface, it holds the judgements that matter across rounds, and it
does not grow toward the context limit the way the child would. Finding the child would mean parsing
Codex's private session store.

## Cloud sessions: a seeded plan login

A Claude Code on the web session starts with no Codex CLI and no login, on a disk that is discarded
when the VM is reclaimed. Three ways of getting a login there were weighed on 2026-09-02:

* **Device-code auth works** — `codex login --device-auth` reached `auth.openai.com` through the
  TLS-intercepting egress proxy (Codex trusts the proxy CA via the preset `SSL_CERT_FILE`) and
  printed a real code. Rejected as the primary path only because it is a login per fresh VM: the
  user has to enter a code every time the container is reclaimed.
* **An API key is permanent and rejected.** `OPENAI_API_KEY` is already in the environment for the
  image endpoint, and Codex accepts it non-interactively, but it bills metered credits, and the
  billing guard exists to refuse exactly that. Relaxing the guard for cloud would reverse the
  skill's premise for the one place where reviews would run unattended.
* **A seeded `auth.json`** is what shipped: `tools/seed-codex-auth.mjs` writes it from the
  `CODEX_AUTH_JSON` environment variable at SessionStart, only when no file exists, after running
  the seed through `assertSubscriptionAuth` plus a refresh-token check. The setup script installs
  the CLI but never touches the login, because the environment snapshot must not hold a credential.
  Base64 is the documented paste form because the dialog takes `.env` lines and a raw JSON value's
  quotes are at the mercy of its parser.

The seed's shelf life is set by refresh-token rotation, not expiry. Codex refreshes a bundle whose
`last_refresh` is older than about eight days and rotates the refresh token as it does; the rotated
file lands on the VM's disk and nothing writes it back into the dialog, so the first session to
refresh retires the seed for every later VM. The hook warns from day six. The seed must come from a
dedicated login (`CODEX_HOME=~/.codex-cloud codex login`): rotation retires the previous token in
the same chain, so a copy of the user's working `auth.json` would log the laptop out at the first
cloud refresh, while independent logins on one account coexist. The path past the ceiling is the
restore-run-write-back pattern OpenAI documents for ephemeral CI runners, which needs a store the
sandbox can reach; it was left as a follow-up rather than built into this package.

## Unvalidated

The eight-day refresh interval and the rotation semantics come from OpenAI's documentation and the
Codex issue tracker, not from a measured cloud run; the first re-seed will show whether the warning
leads the rotation by enough. Whether a 401 ever triggers a refresh earlier than that — an idle seed
whose access token expired before its eighth day — is the case that would shorten the shelf life
below what the note above claims.

Sessions persist under Codex's own store; the skill exposes no `--persist` or `--end-session`
controls the way the Codex-side package does, on the grounds that a reviewer thread is useful to
reopen in the Codex TUI. If review transcripts turn out to accumulate in a way that matters, the
ledger-and- end-session shape from the Codex-side package is the precedent to copy.

The wrapper reviews its own diff, and both rounds found real defects — the provider-precedence gap,
a health probe that ignored nonzero exits, a prompt sized only after being read, and a cancelled run
that orphaned a still-billing Codex process. That is the strongest evidence available that the skill
does what it claims, and re-running it on a change to this package is the cheapest regression test
it has.

Two limits of using the skill on its own package showed up in the second round. Codex cannot run the
test suite from inside the read-only sandbox — Vitest needs to write a Vite cache — so it can review
a test's shape but never whether that test fails against the behavior it claims to pin. That has to
be checked by hand, by reverting the fix and rerunning, and doing so caught a test that passed in
both states: the log-flush ordering is unobservable through a real file, because the flush always
wins the race in practice. Pinning it needed the injected `createLogStream` seam, which follows the
injectable-timeout precedent already in that function. A volume-based attempt at 20,000 lines was
tried first and could not distinguish the two versions either; it was removed rather than kept as
false assurance.

The ten-minute stall timeout is inherited from the Codex-side package rather than measured. Observed
reviews of a small diff run three to eight minutes end to end with roughly one command every fifteen
seconds, so the timeout has never fired; a repo-wide review might legitimately approach it.
