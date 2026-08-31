---
name: run-codex
description: Get an independent second opinion from a fresh Codex CLI process on the ChatGPT plan's included usage — a read-only review of the current in-flight work, or a free-form question about this checkout. Use when the user asks for an outside/independent/second-opinion review, wants Codex to check the work before a PR, or when a change is risky enough to deserve a reviewer that did not write it. The mirror of the Codex-side run-claude skill.
---

# Run Codex

Codex reviews the work; it never changes it. Both profiles pin a read-only sandbox, deny approval
escalation, and disable every ambient tool surface, so Codex can read the checkout, run `git`, and
report — and cannot edit files, mutate git state, or reach GitHub. All four controls are
load-bearing and asserted by tests; see [permissions.md](references/permissions.md) for what each
one closes.

Invoke through the npm scripts below rather than a bare `codex` command. The wrappers pin the
subscription provider, strip API-billing environment variables, stream progress, and terminate a
hung run; a bare `codex` invocation has none of that.

## Preflight

Run once per task, before the first review:

```bash
npm run --silent run-codex:health
```

It verifies the CLI is installed and that `~/.codex/auth.json` holds a ChatGPT plan login rather
than an API key. If it fails, stop and ask the user to run `codex login` — never work around it by
calling `codex` directly, and never set `OPENAI_API_KEY` to get past it. See
[permissions.md](references/permissions.md) for what the guard actually checks.

## Choose one profile

### Independent review (default)

Codex's own review harness, which reads the diff and returns findings anchored to file and line,
each tagged with a `[P1]`–`[P3]` priority. Pick the scope that matches what "in-flight" means right
now:

```bash
npm run --silent run-codex:review -- --uncommitted
```

```bash
npm run --silent run-codex:review -- --base main
```

```bash
npm run --silent run-codex:review -- --commit <sha>
```

`--base main` is the default when no scope is given. `--uncommitted` covers staged, unstaged, and
untracked files — the right choice while work is still in the working tree.

To steer the review, write the extra instructions to a file and pass it:

```bash
npm run --silent run-codex:review -- --uncommitted --prompt-file /private/tmp/run-codex-focus-<unique>.md
```

Never interpolate instruction text into the command line; the prompt-file boundary keeps task
content from becoming shell syntax. `codex exec review` refuses a scope flag and a custom prompt
together, so with `--prompt-file` the wrapper states the scope in the prompt text instead — the
review still covers the scope you asked for.

### Free-form second opinion

Use `ask` when the question is not a diff review — weighing an approach, sanity-checking a
diagnosis, asking whether a design holds up. Codex gets read-only access to the checkout:

```bash
npm run --silent run-codex:ask -- --prompt-file /private/tmp/run-codex-question-<unique>.md
```

Remove the prompt file when the task is done.

## Review rounds

The first review on a branch opens a fresh reviewer. Later reviews on the same branch **resume it**,
so round two verifies whether its own earlier findings were addressed rather than meeting the code
cold. The result JSON carries `round` and `resumed`, and stderr names the thread being resumed.

This matters more than the token saving: a reviewer asked cold to find defects for the fifth time
will find something whether or not anything is there. Every prompt also states outright that
reporting no defects is a correct outcome.

Start over, or clean up when the work is done:

```bash
npm run --silent run-codex:review -- --fresh --uncommitted
```

```bash
npm run --silent run-codex:review -- --end-session
```

Use `--fresh` when the branch moves on to unrelated work, or when you want an independent opinion
uncoloured by the earlier rounds. If Codex has pruned the recorded thread, the wrapper says so and
starts a fresh reviewer by itself rather than failing.

## Options

Both profiles accept `--cwd <dir>` (defaults to the current directory; must be inside a git
worktree), `--model <slug>`, and `--effort low|medium|high` (defaults to `high`). Without `--model`
Codex uses the model configured in `~/.codex/config.toml`.

## Reading the result

stdout carries one result JSON: the profile, scope, Codex thread id, token usage, the stream log
path, and `message` — Codex's full review text. Keep the `--silent`: without it npm prints its own
banner onto stdout ahead of the JSON, and parsing the result fails. stderr carries timestamped
progress, one line per command Codex runs, plus every raw event in the NDJSON log named on the first
line.

A review takes several minutes and stays silent between commands. Run it in the background and read
the log rather than blocking on it:

```bash
npm run --silent run-codex:review -- --uncommitted > /private/tmp/run-codex-result.json 2> /private/tmp/run-codex-progress.log
```

If Codex emits no event for ten minutes the wrapper terminates the whole process group and exits
nonzero, naming the last event and the log — a hung run cannot masquerade as a slow one.

## Handling the findings

The findings are an outside opinion, not a verdict. Verify each one against the current code before
acting: Codex reviews a diff without this session's context, so it can flag deliberate choices and
miss constraints you know about. Report what you confirmed, what you rejected and why, and fix the
real ones. Do not paste the raw review at the user as though it were settled.

This skill produces a review for you to act on locally. To post a review onto a GitHub PR, use the
`leave-pr-review` skill — the Codex wrapper cannot write anywhere, including GitHub. Do not relax
any of the isolation controls to let it publish directly: an early version of this skill was
isolated in name only, and the reviewer used a built-in GitHub tool to post a review to its own pull
request unasked.
