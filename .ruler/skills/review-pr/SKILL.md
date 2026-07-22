---
name: review-pr
description: Splotch conventions that augment (not replace) the built-in review flow when reviewing a pull request — check out the PR branch locally for offline diffs and to run the code and empirically verify critiques, anchor every finding to a diff file + line as you analyze, present the full findings for approval, then on the user's go-ahead post each one as an inline review comment. Use in addition to the built-in review whenever asked to review a PR or leave review feedback on one.
---

# Review a PR

These conventions supplement the built-in review flow — follow them *in addition to* whatever the
built-in `/review` behavior already does, not instead of it. The output side of this skill is the
input side of [`review-pr-comments`](../review-pr-comments/SKILL.md): the comments posted here are
exactly what that skill later triages on the receiving branch, so every comment must stand on its
own as an actionable, anchored critique.

The flow has a hard gate in the middle: **analyze and present first, post only after the user
approves.** Nothing lands on GitHub until the user says so.

## Setup — always check out the PR branch locally

Never review from API diff hunks alone. Check out the PR's head branch so you can run offline git
diffs and actually execute the code:

1. Make sure the working tree is clean; never mix a review checkout with local work in progress.
2. Fetch and check out the head branch:

   ```sh
   git fetch origin <head-branch>
   git checkout <head-branch>
   ```

   For a fork PR (head repo ≠ origin), fetch the PR ref instead:
   `git fetch origin pull/<n>/head:pr-<n> && git checkout pr-<n>`.
3. Diff against the merge target locally: `git diff origin/main...HEAD` (three dots — changes the PR
   introduces, not drift from main). `git log origin/main..HEAD --oneline` gives the commit story;
   per-file diffs and `git blame` are all offline from here.

## Analysis — verify empirically, anchor as you go

* **Run the code when a critique depends on behavior.** A claimed bug, race, or regression should be
  reproduced, not asserted: run `npm run check`, the tests covering the touched files (see the
  `testing` skill), or the app itself (see `run-splotch`) as the claim requires. A reproduced
  failure upgrades a critique to fact — cite the repro in the comment. A critique you tried and
  failed to substantiate gets downgraded to a question or dropped; never post speculation phrased as
  fact.
* **Anchor every finding while analyzing, not after.** GitHub inline review comments require a
  `path` + `line` that exist **in the PR's diff** — you cannot comment on an untouched line. So as
  you spot each issue, record where the comment will attach:
  * the file path and the line number in the **new** file version (`side: RIGHT`); use `side: LEFT`
    only for critiques of deleted lines;
  * for a multi-line span, the `startLine`..`line` range;
  * a finding about unchanged code the diff merely exposes → anchor to the nearest changed line that
    motivates it, or plan it for the review summary body instead.

  If you defer anchoring to posting time, you will find some comments have nowhere to attach — think
  about placement during the initial analysis.

## Each critique

Every finding carries, from the moment it's drafted:

* **Anchor** — `path` + `line` (+ range/side) as above.
* **Severity** — `blocking` (defect or real risk; should not merge as-is), `suggestion` (better way,
  author's call), `nit` (style/polish), or `question` (genuine ask, not a request).
* **Claim + why it matters** — one issue per comment; what's wrong and the consequence.
* **Evidence** — the repro, failing test, code path, or ADR that backs it (check the `adrs` skill; a
  critique that contradicts a documented decision is probably wrong — or the ADR is stale).
* **Concrete fix** — what to do instead. When it's a small in-place replacement, include a
  ```suggestion`` block so the author can one-click apply it.

## Present findings — then stop

Show the user the full findings before anything is posted: a numbered list with severity,
`file:line`, and the draft comment text for each, plus the overall verdict and anything destined for
the summary body. This is the review deliverable; end the turn here.

**Post nothing until the user gives an affirmative go-ahead** ("proceed", "do it", "post them", …).
The user may cull or reword findings first — posting only what survives is the point of the gate. If
the user never says go, the review stays in chat.

## Posting — one pending review, on the go-ahead

Post as a **single review**, not N standalone comments (one notification, one atomic unit the author
can respond to):

1. `pull_request_review_write` with `method: "create"` to open a pending review.
2. `add_comment_to_pending_review` per finding, with the anchor recorded during analysis (`path`,
   `line`, `side`, `startLine` for ranges). Prefix each comment with its severity tag
   (`**blocking:**`, `**suggestion:**`, `**nit:**`, `**question:**`).
3. `pull_request_review_write` with `method: "submit_pending"` — event `COMMENT` unless the user
   explicitly asked to approve or request changes. Put the overall summary and any un-anchorable
   findings in the review body.

Escape `#`-numbers that aren't deliberate issue/PR references (`\#1` or backticks) — see "Writing on
GitHub" in the root instructions. If a comment fails to attach (anchor not in the diff), fix the
anchor or move it to the review body — don't silently drop it.

Afterwards, report what was posted (comment count, severities, review event) so the author knows
what to expect — and know that working through those comments is `review-pr-comments`' job on the
other side.
