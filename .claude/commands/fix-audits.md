# Fix Audits

Work through **every** item in `docs/AUDIT.md` autonomously on a dedicated branch with a
draft PR — one commit + one PR comment per item — without stopping to ask the user
anything. Review happens on the PR.

## Setup (once per run)

1. **Check `docs/AUDIT.md` exists first.** It may be absent — this command deletes it once
   the backlog is cleared, so a missing (or header-only) file is a normal, expected state,
   not an error. If there's no `docs/AUDIT.md`, or it holds only the header with no `### `
   findings, there's nothing to fix: report "no audit backlog to fix" and stop cleanly —
   don't create a branch or PR.
2. Ensure the working tree is clean; if not, stop and tell the user — never mix their
   uncommitted work into this run.
3. If an open draft PR from a previous run exists (branch `claude/audit-sweep-*`), check
   out that branch and resume. Otherwise, from `main`, create `claude/audit-sweep-<YYYY-MM-DD>`,
   push it, and open a **draft PR** with `gh pr create --draft` titled "Audit sweep: <date>" and
   a body noting the run is in progress (final summary comes at the end).

## Per-item loop

Process items **top to bottom** (they're ordered by impact). For each item:

1. **Delegate to a fresh subagent.** Launch a `general-purpose` agent whose prompt contains the
   item's full text verbatim plus repo conventions. A fresh agent per item is what keeps each
   fix's context clean — do not implement items in the orchestrator conversation, and do not
   pull the subagent's diff into your own context; rely on its report. Instruct the subagent to
   work in this order:

   1. **Validate the problem first — empirically where possible.** Before changing anything,
      confirm the finding is real against the *current* code: run the finding's
      `#### Verification` steps if it has them, otherwise reproduce it yourself (a failing test,
      a profile capture, a log line, a query — whatever the item's category admits) rather than
      trusting the write-up. If the problem no longer holds, is intentional, or can't be
      reproduced, that's a **Skip** carrying the evidence.
   2. **Brainstorm the fix — the item's recommendation is a starting point, not gospel.** The
      suggested fix in `docs/AUDIT.md` was written by an earlier pass without implementation
      context, so treat it as one candidate among others. Weigh it against alternatives and
      choose the approach that is genuinely best for this codebase, even if that means diverging
      from or improving on the recommendation. Carefully consider the best way to proceed.
   3. **Implement the chosen fix, then verify it.** Run `npm run check` and the tests covering
      the touched files. Where the problem was reproduced empirically in step 1, re-run that
      same reproduction to prove the fix actually resolves it — not merely that the suite stays
      green.

   The subagent must report back one of:
   - **Fixed** — with a summary of what changed and why, the approach chosen (and how/why it
     diverged from the item's recommendation, if it did), the empirical validation of both the
     problem and the fix, files touched, check/test results, and any caveats or follow-ups.
   - **Skip** — the finding didn't hold up (couldn't be reproduced, already fixed, or
     intentional), the fix turned out riskier than the item claims, or it requires a
     product/user decision to proceed. It must revert all its changes (`git restore .` + delete
     any new untracked files) and state the evidence plus exactly what decision is needed or why
     the item doesn't hold up.
2. **On Fixed:**
   - Verify the tree has changes and the reported checks passed (re-run `npm run check` if the
     report is ambiguous).
   - Remove the finding's whole `###` block from `docs/AUDIT.md` (keep the file header and other
     sections intact; delete the `## Source:` section once its last finding is gone).
   - Commit the fix **and** the `docs/AUDIT.md` edit together as one commit with a descriptive
     message, then push.
   - Post a PR comment (`gh pr comment`) containing: the item title, the commit SHA, the
     subagent's summary, test/check results, and any caveats worth a reviewer's attention.
3. **On Skip:**
   - Confirm the working tree is clean again (revert it yourself if the subagent didn't).
   - Edit the finding in place in `docs/AUDIT.md`: add a
     `**⏸ Pending decision:** <what the user must decide, and why the sweep couldn't proceed>`
     line right under its `###` header (above `#### Problem`). Commit that edit and push.
   - Post a PR comment flagging the skipped item and the pending decision.
4. Move to the next item. Do not stop between items, do not ask the user anything mid-run —
   a decision point is handled by step 3, not by pausing.

## Completion

When every item is either fixed or marked pending:

1. **One final verification.** With all fixes now accumulated on the branch, run the full suite
   yourself once more (`npm run check` and `npm test`) to confirm the fixes *compose* — that no
   later fix silently undermined an earlier one and the branch is green as a whole, not just
   item-by-item. If anything fails, resolve it (delegate if it's substantial) before proceeding.
2. If **no items remain**, delete `docs/AUDIT.md` and commit. If pending items remain, leave
   the file containing only the header and the pending items.
3. Update the PR description (`gh pr edit --body`): a one-line summary per change (linking each
   commit), plus — if any — a **"Needs your decision"** section listing each remaining item and
   its pending decision.
4. Mark the PR ready for review: `gh pr ready`.
5. In your final response: how many items were fixed, how many are pending decisions (and what
   those decisions are), and the PR URL.
