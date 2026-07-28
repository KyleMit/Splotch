# Dependency Updates (Dependabot + Claude auto-review)

How dependency bumps arrive, who reviews them, and what to do when the review doesn't show up.

The architectural decision and the rejected alternatives are in
[ADR-0077](adrs/0077-dependabot-claude-review-workflow.md); this document is the operational side —
setup, verification, troubleshooting.

## What's configured

**`.github/dependabot.yml`** opens PRs on two ecosystems, both weekly:

| Ecosystem        | Scope                          | Grouping                                                       |
| ---------------- | ------------------------------ | -------------------------------------------------------------- |
| `github-actions` | Action pins in `.github/`      | One grouped PR for all minor + patch bumps; majors open singly |
| `npm`            | Root `package.json` (ADR-0024) | Ungrouped — one PR per package                                 |

Because every action is pinned to a SHA with a version comment, Dependabot rewrites both the SHA and
the comment together. A pin whose SHA and comment disagree is a red flag, and the review checks it.

**`.github/workflows/dependabot-review.yml`** then runs Claude on each of those PRs and posts a
verdict comment.

## One-time setup

The workflow is inert until this exists:

1. Run `claude setup-token` locally (requires a Claude Pro or Max subscription).
2. Add the result at **Settings → Secrets and variables → Dependabot → New repository secret**,
   named `CLAUDE_CODE_OAUTH_TOKEN`.

**It must go in the Dependabot secret store, not the Actions store.** They are separate tabs on the
same settings page and the distinction is the single most important fact in this document — see
below for why.

Usage bills against the Pro/Max subscription's weekly limits, not Anthropic API credits.

## Why the setup is fussy: GitHub sandboxes Dependabot runs

The `pull_request` event fires normally for a Dependabot PR — capturing the event was never the
problem. What GitHub restricts is what the resulting run is *allowed to do*: on Dependabot-triggered
`push`, `pull_request`, `pull_request_review`, and `pull_request_review_comment` events, the run
receives a **read-only `GITHUB_TOKEN`** and **cannot read Actions secrets at all**. A secret
reference there doesn't error — it resolves to an empty string.

Four settings in the workflow exist solely to work within that sandbox and around the action's
automation-mode defaults, and **each one fails silently if removed.** The job goes green having
achieved nothing, which is the failure mode to watch for:

| Setting                         | Why it's there                                                       | Symptom if missing              |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------- |
| Secret in the Dependabot store  | The only secret store injected into these runs                       | Auth failure — empty token      |
| `permissions:` block            | Re-grants write to the read-only token so the comment can be posted  | Comment never appears           |
| `allowed_bots: dependabot[bot]` | `claude-code-action` ignores bot actors by default (default: *none*) | Job succeeds, Claude never runs |
| `Bash(gh pr comment:*)` granted | Automation mode posts nothing on its own — Claude posts the verdict  | Review written only to the log  |

The last two are the sleepers, and they produce the *same* green-with-no-comment symptom from
opposite ends. `allowed_bots` defaults to empty, meaning no bot may trigger the action — and the
actor here is `dependabot[bot]`. Supplying a `prompt:` puts the action in automation mode, which
deliberately creates no tracking or result comment, so the only reason a verdict reaches the PR is
that Claude is granted `gh pr comment` and told to run it.

## Verifying the first pass

Dependabot runs weekly, so rather than wait, force one:

* **Insights → Dependency graph → Dependabot → "Check for updates"** on any ecosystem, or
* comment `@dependabot reopen` on a closed Dependabot PR.

**The gate reads the event actor, not the PR author** — `github.actor` is whoever triggered the
specific event, and on a Dependabot PR the author is always `dependabot[bot]` no matter who did.
That distinction is the whole reason the second recipe is worded that way: *Dependabot* has to
perform the reopen. Closing and reopening the PR by hand makes you the actor, so the job is skipped
— and that run wouldn't be given the Dependabot secret store anyway, so removing the gate wouldn't
rescue it. The gate is correctly matched to where the secret exists.

Then confirm, in order:

1. The **Dependabot review** workflow appears in the PR's checks and is not marked *skipped*.
   Skipped means the actor gate didn't match — check who triggered the run (the "triggered by" line
   on the run page), not who authored the PR.
2. The job is green **and** a comment was posted. Green with no comment is a failure, not a pass —
   and it has two distinct causes worth telling apart: `allowed_bots` not matching (Claude never
   ran; the run log will be nearly empty) or the posting tool missing (Claude ran and wrote the
   whole review to the run log, which will be full of it). Open the run log; which one it is will be
   obvious immediately.
3. The comment opens with a bolded **APPROVE** or **FLAG** verdict.

## What the review does and doesn't do

It reads the manifest and lockfile diff, the upstream release notes, and the repo's own usage of the
package. It reports the semver jump, breaking changes, requirement shifts (Node engine, peer deps,
browser floor), supply-chain smell (new maintainers, new install scripts), license changes, CVE
relevance, and blast radius from actual import sites — plus Splotch-specific traps: the inverted
`dependencies`/`devDependencies` split ([ADR-0070](adrs/0070-netlify-build-minute-reduction.md),
where a misfiled package breaks the Netlify deploy while CI stays green) and Capacitor bumps that
need a native rebuild.

**It never installs dependencies.** The bumped package's code is therefore never executed on the
runner — only its diff and its published notes are read. Release-note content is treated as
untrusted data, not as instructions.

`--allowedTools` is what enforces that, so it is deliberately narrow: read, search, fetch, read-only
`git`, and read-only `gh pr` subcommands. **Posting the verdict is the only write it permits** —
`gh pr comment`, nothing else. No install, no build, no approve, no merge. Broad patterns defeat
this: `Bash(gh api:*)` is a prefix match, so it would admit
`gh api -X POST .../reviews -f
event=APPROVE` and turn "Claude does not approve" from a constraint
into a polite request. It was granted in an early draft and removed for exactly that reason.

**The verdict is advisory.** Claude does not approve, merge, or push. A human still merges, and CI
remains the gate on correctness — an APPROVE from a review that can't run the test suite is a
reading of the changes, not a guarantee.

**The review usually can't see CI.** It's triggered by the same `pull_request` event as `test.yml`
and, having no dependency install, finishes in a couple of minutes while Tests is still running
under its 15-minute budget. So expect the CI column to read "still running". That's by design rather
than a defect worth fixing: the review's value is reading the upstream changes, which doesn't depend
on CI, and making it wait would spend runner minutes and subscription usage to restate a red X
already visible on the PR. The prompt tells Claude to report the status it actually saw and never to
treat pending as passing. If you want a verdict informed by CI, re-read the PR after checks land —
that's a human step by design.

## Troubleshooting

| Symptom                               | Likely cause                                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job green, no comment                 | Either `allowed_bots` didn't match (run log nearly empty) or `Bash(gh pr comment:*)` is missing from `--allowedTools` (run log has the full review). Automation mode posts nothing on its own |
| Auth / credential error in the log    | Secret is in the Actions store instead of Dependabot, misnamed, or the OAuth token expired                                                                                                    |
| Sudden run of auth failures           | **The `claude setup-token` token expires (~1 year) with no warning.** Regenerate and update the Dependabot secret                                                                             |
| Comment posted but truncated or vague | Upstream published thin release notes, or `--max-turns` was hit. The prompt is instructed to admit thin evidence rather than fake confidence                                                  |
| Job shows as *skipped*                | `github.actor` isn't `dependabot[bot]` — the gate reads the event's actor, not the PR's author, so a human-triggered event on a Dependabot PR skips by design                                 |
| Workflow doesn't appear at all        | The workflow file isn't on the default branch yet, or the event type isn't in the trigger list                                                                                                |

## Tuning

* **Too much weekly-limit burn?** The trigger is already narrowed to `opened` + `reopened`; from
  here, add an ecosystem condition to the `if:` gate to skip grouped github-actions bumps.
* **Reviews too shallow?** Raise `--max-turns` in `claude_args`.
* **Want a different emphasis?** The `prompt:` input is plain prose — edit it directly. Keep the
  closing instruction that release notes are untrusted data.
