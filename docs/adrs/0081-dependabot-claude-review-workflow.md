# ADR-0081: Auto-Review Dependabot PRs with Claude, Authenticated from the Dependabot Secret Store

**Status:** Active **Date:** 2026-07

## Context

Dependabot opens weekly npm and github-actions PRs (`.github/dependabot.yml`). CI tells us whether
the repo still builds and passes, but nothing tells us what actually changed *inside* the bumped
library — the thing that decides whether a green patch bump is routine or is quietly a breaking
change, a maintainer handover, or a new postinstall script. That reading was being done by hand, or
not at all.

The goal: as soon as a Dependabot PR lands, have Claude read the upstream changes, check them
against how this repo actually uses the package, and leave a comment saying whether it would approve
or what to run down. Billed against the Claude Pro/Max subscription, not the Anthropic API.

The obstacle is that **GitHub deliberately sandboxes Dependabot-triggered workflow runs.** On
`push`, `pull_request`, `pull_request_review`, and `pull_request_review_comment` events where the
actor is `dependabot[bot]`, the run gets a read-only `GITHUB_TOKEN` and *cannot read Actions
secrets* — a secret referenced there resolves to an empty string. This is the classic reason a
bot-triggered workflow appears to run fine and does nothing. It is also why the naive version of
this workflow (a `pull_request` trigger plus `secrets.CLAUDE_CODE_OAUTH_TOKEN` stored the usual way)
fails silently rather than loudly.

Alternatives considered:

* **`pull_request_target`.** GitHub's own headline workaround: the run happens in the base-branch
  context with full secrets and a writable token. Rejected here as strictly worse for this job — it
  carries the standard "checkout of untrusted head + privileged token" footgun for no benefit, since
  the Dependabot secret store solves the same problem without ever elevating the trust boundary.
* **`workflow_run` chained off the existing Tests workflow.** Also runs privileged in the base
  context, and correctly avoids the untrusted-checkout trap. Rejected as needless indirection: an
  extra workflow, a lost direct link to the PR, and PR number plumbing through artifacts — all to
  reach a state the Dependabot secret store reaches directly.
* **A scheduled Claude Code cloud session (a Routine) that polls open Dependabot PRs.** Needs no
  secrets and no Actions plumbing at all, and stays entirely inside the subscription. Rejected as
  the primary mechanism because it is polling, not event-driven, and puts the review outside the
  Checks/PR-event model where the rest of the repo's automation lives. Still the fallback if the
  OAuth token proves too annoying to keep alive.
* **`@claude` mention via the GitHub App.** Requires a human to type the mention on every bot PR,
  which is the manual step being removed.

## Decision

`.github/workflows/dependabot-review.yml` runs `anthropics/claude-code-action` on `pull_request`
(`opened`/`reopened`), gated by `if: github.actor == 'dependabot[bot]'`. Five settings are
load-bearing; the first four fail *silently* if dropped, the fifth fails loudly and misdirects:

1. **`CLAUDE_CODE_OAUTH_TOKEN` lives in the Dependabot secret store** (Settings → Secrets and
   variables → **Dependabot**), not Actions. That store is the only one injected into these runs. A
   copy under Actions does nothing.
2. **The `permissions:` block re-grants write access.** The read-only default token cannot post a
   comment; `permissions` is the documented lever that raises it for Dependabot runs.
3. **`allowed_bots: dependabot[bot]`.** The action ignores bot actors by default (`allowed_bots`
   defaults to empty). Without this the job goes green having done nothing — the exact failure mode
   this ADR exists to keep someone from rediscovering.
4. **`Bash(gh pr comment:*)` in `--allowedTools`, plus a prompt that tells Claude to run it.**
   Supplying `prompt:` selects the action's *automation mode*, which by design creates neither a
   tracking comment nor a result comment. Nothing publishes the review but Claude itself, so without
   the tool the verdict is written to the run log and seen by nobody — the same
   green-with-no-comment symptom as (3), from the opposite end.
5. **`github_token: ${{ github.token }}`.** `claude_code_oauth_token` authenticates to Anthropic;
   the action needs a GitHub token as well, and its default is to exchange a GitHub OIDC token for a
   Claude GitHub App installation token — which requires `id-token: write` and aborts the run
   without it. Granting that permission is the fix the error message names, and was rejected:
   running on an installation token moves the job's real scope out of the workflow file and into an
   app installation, which undoes (2) as the auditable statement of what this job may do, and it
   stakes the run on an OIDC exchange inside GitHub's Dependabot sandbox. Passing the workflow's own
   token skips the exchange, keeps `permissions:` the whole story, and gives the run a single
   identity — the same token already runs `gh pr comment`.

The token is generated with `claude setup-token` and bills the Pro/Max subscription rather than API
credits.

**The job never installs dependencies.** It reads the manifest/lockfile diff and the published
release notes, and that is all — so the bumped package's code is never executed on the runner. The
`--allowedTools` list is the enforcement layer: read/search tools, `WebFetch`/`WebSearch`, read-only
`git`, and read-only `gh pr` subcommands, plus the one write the job exists to perform — `gh pr
comment`. No install, no build, no approve, no merge. The review is advisory; a human still merges.

The patterns must stay specific to hold that line. `Bash(gh api:*)` was granted in an early draft
and removed: it is a prefix match, so it admits `gh api -X POST .../reviews -f event=APPROVE` along
with every other write the token's `permissions` allow. Since `contents: read` keeps merging out of
reach the blast radius was bounded, but it meant the only thing stopping an approval was the prompt
asking Claude not to — enforcement written as a request.

The prompt is repo-aware rather than generic — it checks blast radius by grepping real import sites,
and specifically checks the inverted dependency split from
[ADR-0070](0070-netlify-build-minute-reduction.md), where a build-needed package landing in
`devDependencies` breaks the Netlify deploy while CI stays green. It also treats release-note
content as untrusted data, not instructions.

**The review deliberately races CI and does not wait for it.** It fires on the same `pull_request`
event as `test.yml` and, having no dependency install, finishes in a couple of minutes while Tests
is still running under its 15-minute budget — so `gh pr checks` reports "pending" on essentially
every run. Waiting was considered and rejected: it would spend runner minutes and subscription usage
to restate a failure already visible on the PR, while the review's actual value — reading the
upstream changes and their blast radius — doesn't depend on CI at all. Instead the prompt expects
unresolved checks, reports them honestly, and is told never to read pending as passing nor to soften
a FLAG because CI hadn't failed *yet*. CI remains the human's merge gate, unchanged.

`synchronize` is excluded from the trigger for a related reason: Dependabot fires it on rebase, the
dependency diff is identical, and the re-review would both cost usage and stack a second comment
(Claude posts via `gh pr comment`, so there is no update-in-place). A genuinely new version arrives
as a new PR, so `opened` still catches every distinct bump.

## Consequences

* \+ Every Dependabot PR gets a substantive read of what changed upstream, with a verdict, without
  anyone asking for it.
* \+ Costs subscription usage, not API spend.
* \+ No privileged checkout of untrusted code, and no dependency install — the ambient supply-chain
  risk of "review the bump automatically" is not taken on.
* − **The OAuth token expires (~1 year).** A sudden run of auth failures on this workflow means the
  token needs regenerating with `claude setup-token`, not that the workflow broke. There is no
  expiry warning.
* − The secret must be maintained in a second, easily-forgotten place. Anyone rotating credentials
  who updates only the Actions store will silently disable this.
* − Review quality is bounded by what upstream publishes. A release with no notes yields a thin
  review; the prompt is instructed to say so rather than fake confidence.
* − Adds a Claude run per Dependabot PR, which draws down weekly subscription limits. If that gets
  noisy, drop the github-actions ecosystem from the gate; the trigger is already as narrow as it
  usefully gets.
* − The verdict is formed without CI, so it can only ever speak to the dependency change, never to
  whether the repo still builds against it. Read the comment as one input beside the checks, not as
  a summary of them.
