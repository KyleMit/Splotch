# Run Codex — design notes

`run-codex` is a direct Claude-only package for the same reason [run-claude](run-claude.md) is
Codex-only: its defining boundary is one agent runner launching another vendor's local authenticated
CLI. A Codex-side copy would tell Codex to orchestrate an independent Codex process, which is not a
second opinion.

## Why this one has no installer

The two skills are mirror images in purpose but not in size. `run-claude` needs an installer,
`~/.local/libexec` wrappers, hashed settings, and a Codex exec-policy because Codex runs inside a
Seatbelt sandbox that cannot read the macOS Keychain, so reaching Claude at all requires a reviewed
escalation boundary. Claude Code's Bash tool already runs on the host, so `run-codex` needs none of
that: `npm run run-codex:*` reaches the Codex CLI directly, and `Bash(npm run *)` is already
allowed, so the skill added no new permission rules.

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

Stripping rather than refusing on an inherited `OPENAI_API_KEY` is deliberate. Refusal is what
`run-claude` does, because it cannot be sure which of several selectors Claude will honor. Here the
precedence is known, so removing the variable from the child is both stricter and usable from a
shell that exports one for unrelated work.

## Two profiles, not three

`review` wraps `codex exec review`, whose harness already produces file-and-line anchored findings
with `[P1]`–`[P3]` priorities. `ask` is the free-form read-only fallback. Both are read-only; no
write-capable profile exists, and the PR-publishing profile that `run-claude` carries has no analog
because `leave-pr-review` already owns posting to GitHub from this side.

`codex exec review` rejects a scope flag and a custom `PROMPT` in the same invocation, which is not
documented in its help text and was found by running it. The wrapper therefore has two shapes: with
no focus instructions it passes the scope flag and lets Codex's harness drive; with instructions it
passes `-` and moves the scope into the prompt text. If a future Codex release lifts that
restriction, collapse the two shapes back into one.

## Unvalidated

Sessions persist under Codex's own store; the skill exposes no `--persist` or `--end-session`
controls the way `run-claude` does, on the grounds that a reviewer thread is useful to reopen in the
Codex TUI. If review transcripts turn out to accumulate in a way that matters, the ledger-and-
end-session shape from `run-claude` is the precedent to copy.

The wrapper reviews its own diff, and both rounds found real defects — the provider-precedence gap,
a health probe that ignored nonzero exits, a prompt sized only after being read, and a cancelled run
that orphaned a still-billing Codex process. That is the strongest evidence available that the skill
does what it claims, and re-running it on a change to this package is the cheapest regression test
it has.

The ten-minute stall timeout is inherited from `run-claude` rather than measured. Observed reviews
of a small diff run three to eight minutes end to end with roughly one command every fifteen
seconds, so the timeout has never fired; a repo-wide review might legitimately approach it.
