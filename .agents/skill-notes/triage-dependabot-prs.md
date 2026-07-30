<!-- Source: .ruler/skill-notes/triage-dependabot-prs.md.template -->

# triage-dependabot-prs — design notes

Design history for the skill. Not linked from `SKILL.md` by design — see the README in this
directory.

## Where it came from

Written after a 2026-07-28 session that triaged a batch of nine open Dependabot PRs (\#573–\#581).
Outcome: seven merged, one closed as blocked upstream, one closed pending a required fix, two
tracking issues filed. Every rule in the skill is something that session paid for; nothing in it is
speculative.

## Why it exists separately from `dependency-update-audit`

The obvious objection is that the repo already has a dependency-upgrade skill. They are inverses:

* `dependency-update-audit` — *you* choose what to upgrade, from `npm outdated`. One package per
  commit, driven by migration guides. Proactive.
* `triage-dependabot-prs` — the PRs already exist and each is a merge/hold/close decision. The work
  is verification and **sequencing**, not authoring. Reactive.

The sequencing half has no analogue in the other skill and is where the session actually spent its
time, which is what settled it as a separate skill rather than a section.

## Rules that earned their place

**Read upstream source, not release notes.** `WebFetch` on GitHub release pages returned a v4.0.0
dated before the v3.0.1 that preceded it, and an abbreviated 2.69.2 changelog that the PR body
showed was missing half its entries. The `upload-pages-artifact` finding only became actionable by
diffing `action.yml` at both tags and seeing `--exclude=.[^/]*`. Treating release notes as a lead
rather than evidence is the single highest-value rule here.

**`npm audit` before/after.** This was nearly skipped as bureaucratic and turned out to reclassify
SvelteKit from routine bump to security fix (two moderate advisories, `<=2.69.0`). It changed the
merge order. The count-goes-up-while-posture-improves wrinkle is included because it genuinely looks
like a regression at a glance: 21 → 23, because kit's moderate resolved and the masked transitive
`cookie` low resurfaced on kit plus both adapters.

**Simulate the merge sequence, not just each branch.** All six branches tested clean against `main`
individually. After status-bar landed, quicksand conflicted — adjacent lines in the lockfile root
block. Pairwise-clean is a genuinely misleading signal and the loop that catches it is three lines.

**Never push a fix to a Dependabot branch.** The next rebase discards it. This is why \#574 became
an issue instead of a one-line edit, and it is the non-obvious constraint that shapes the whole
"handle the ones that can't just be merged" section.

**Closing suppresses that version.** Dependabot won't re-raise a manually closed PR — only a newer
version reopens the topic. Without an issue, closing silently drops the work. This is *why* the
skill insists on file-issue-then-close rather than close-and-move-on.

**Environmental vs. real test failures.** 17 E2E canvas specs failed locally; they fail identically
on unmodified `main` (no GPU in the container). Without the baseline re-run the obvious conclusion
is "the bump broke drawing," which would have been wrong and expensive.

**`cancelled` ≠ failed.** Cost a wrong statement to the user mid-session: a `main` run was reported
as still running when it had already been cancelled by the concurrency group after an unrelated PR
landed behind it. Hence the explicit instruction to re-check rather than assume, and to find the
superseding commit.

## Deliberately not included

* **A fixed merge order by ecosystem.** Tried and rejected — the right order depends on which
  branches actually conflict this week and what `npm audit` flags. The skill teaches deriving the
  order instead of prescribing one.
* **`gh` CLI recipes.** Cloud sessions have no `gh`; the GitHub MCP tools are the interface. The
  local-git steps (`merge-tree`, the simulation loop) work in both environments, which is why the
  verification steps lean on git rather than the API wherever there's a choice.
* **Auto-merge / `@dependabot merge`.** The session's whole value was the two PRs that shouldn't
  merge. Automating the merge step optimizes the part that was never the bottleneck.

## Open questions

* **Overlap with the automated review** (`dependabot-review.yml`, ADR-0081, merged as \#598 during
  the same session). That workflow posts a per-PR APPROVE/FLAG verdict, so some of step 2 may be
  redundant once its verdicts are trusted in practice. Unvalidated: the session predated its first
  real run. If those verdicts prove reliable, step 2 could shrink to "verify the FLAGs and
  spot-check the APPROVEs" — but note it cannot install, cannot run tests, and usually posts before
  CI finishes, so the `npm audit` diff and the local `npm ci` verification have no automated
  equivalent today.
* **Batch size.** The flow was exercised on nine PRs. A grouped github-actions PR (per
  `.github/dependabot.yml`, minor+patch bumps arrive as one PR) may want per-action verdicts inside
  a single comment; untested.
* Whether the merge-sequence simulation should just be a repo script rather than an inline loop. It
  would need to enumerate Dependabot branches itself; not obviously worth it below ~10 PRs.
