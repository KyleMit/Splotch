# Run Rival Agent (Codex side: Codex handles, Claude rivals) — handler-side notes

This is the Codex-side package of `run-rival-agent`: Codex is the **native handler**, Claude Code
the **rival agent**. The design history both packages share — why a handler and a rival, what the
probes changed, the 2026-09-02 decisions and their rejected alternatives, the accepted exposures,
the seeded-defect bench, and the Claude versus Codex parity table — lives in
`tools/rival-agent/NOTES.md`, beside the code, so that neither provider's note is the primary one.
Read that first. This note keeps only what is specific to Codex being the handler and Claude the
rival. The Claude-side package, with its own note under `.claude/skill-notes/`, has the roles
swapped.

## What is different when Codex is the handler

Codex runs its `exec_command` inside a Seatbelt sandbox that cannot read the macOS Keychain, and
both the Claude plan login and the GitHub token live there. So the three things that need them —
launching the rival, posting the review, and the health probe — are installed under
`~/.local/libexec/splotch-rival-agent/` as trusted bytes and invoked through `exec_command` with
`sandbox_permissions: "require_escalated"` under `prefix_rule` prompts that Auto-review evaluates.
Everything else stays in the sandbox: `broker next`, `broker reply`, and the rival's commands only
touch the session directory under the temp root and the worktree beside it, which the
workspace-write sandbox allows. That split is the reason the broker CLI is not an escalated wrapper
and has no policy rule.

The installed copy verifies itself. The installer writes a manifest hashing every file it copied,
and every wrapper hashes its siblings against that manifest before doing anything; in the checkout
there is no manifest and nothing to verify, because the checkout is the source. Earlier versions
hashed a fixed list of files by name in each wrapper; hashing the whole directory means a file
nobody expected in there fails the check too. The reviewed worktree is untrusted material, and the
installed wrappers import nothing from it — which is why the vendor-neutral core is *copied* into
the install rather than referenced from the checkout, and why the package files' core imports are
rewritten to point at their new siblings on the way in. A package file that still reaches outside
the install directory after rewriting fails the installer.

The install is not a review-quality choice and is not up for deletion on those grounds: it is the
Keychain workaround, and it stays until Codex's sandbox can read the login some other way.

## The Claude rival's launch shape

`--restricted`, not `--safe-mode`. Safe mode disables `--mcp-config` along with CLAUDE.md, skills,
plugins, and hooks, which is how the first probe of this design attached no broker at all and
reported the tool absent. Restricted mode removes the command-running tools, confines the file tools
to the working directories (`--add-dir` for the packet), refuses `bypassPermissions`, and ignores
user and project settings *files* — which also retired the hashed `settings.json` the previous
runner carried. It still honours `--settings` on the command line, which is how a sandboxed Bash can
be added later. `--tools Read,Grep,Glob` plus `--allowedTools` naming the broker tool, under
`--permission-mode dontAsk`, gives the rival exactly reads and the one door. `--json-schema` with
the findings schema puts the document on the result event as `structured_output`, which the reducer
prefers over the prose result.

`MCP_TOOL_TIMEOUT` is raised to the pending-request budget in the rival's environment; without it a
brokered call that waits through a handler turn and a test run times out inside Claude.

Session ids are wrapper-issued (`--session-id` on the first round, `--resume` later) because Claude
does not report a thread id the way Codex does; the ledger records the issued id. `--end-session`
deletes that conversation's transcript and sidecar under `~/.claude/projects/` — only for an id the
ledger holds, which only ever holds ids this launcher issued, so it can never reach a human's
interactive session.

## The orchestrated alias

`implement-issue-stack` invokes `~/.local/libexec/splotch-claude-review-publish.mjs --pr <n>` by
fixed path and expects one command to review and post. A pairing needs a handler to serve the
broker, and an unattended orchestrator is not one. The alias therefore launches the rival, declines
every request it makes with one fixed reason, waits for it to finish, and posts. That review is what
the rival can establish by reading alone; its unverified list says what it wanted to run. It keeps
the fixed path, the `--pr`/`--end-session` contract, the one-`COMMENT`-review rule, the hidden
marker, and the three-round budget the orchestrator relies on.

This is a deliberate downgrade from the Auto-mode publisher it replaces, which gave Claude its full
tool set in the disposable worktree and let it post its own review. That publisher was the second
policy engine the pairing exists to remove. Once the Claude rival has a sandboxed shell of its own,
the alias gains empirical reviews for free — the rival runs its tests locally and the alias keeps
declining only the escalations. Giving the orchestrator a real handler is the step after that and is
out of scope here.

## What was deleted and why

* The `ask` and `inspect` profiles and the ask-to-inspect widening rule. One paired profile covers a
  question (a fresh, unrecorded turn with `--question-file`) and a review alike.
* The Auto-mode publisher, its rubric injection of `leave-pr-review`, and the runner-boundary and
  reviewer-rubric prompts. The rival prompt in the core carries the analysis half of that rubric
  without its posting section; posting belongs to the handler.
* The Claude-side stream wrapper, which was a near-copy of the Codex-side one. One runner in the
  core, two event renderers.
* The hashed `settings.json`, retired by `--restricted`.

## Unvalidated on this side

* Whether the workspace-write sandbox lets a brokered command write inside the disposable worktree
  under the temp root without escalation on every Codex version. The skill tells the handler to try
  the sandbox first and escalate only a legitimate denial through Auto-review.
* Whether `exec_command`'s yield and `write_stdin` polling stay comfortable with
  `broker next --timeout-seconds 60`; the number was chosen to sit under the yield, not measured
  against it. One real Codex-handler round found the 30-second yield shorter than the wait, so each
  quiet wait needed one follow-up poll.
* The whole Codex-as-handler loop has been exercised from the checkout with a Claude session serving
  as the handler, which proves the launcher, the rival, the broker, and the poster, but not Codex's
  own `exec_command` ergonomics around them. The installer is fixed to the canonical checkout and is
  only ever run there by the owner.
