# Fix Next TODO (Auto)

Autonomous mode — work through **every** item in `docs/TODO.md` on a dedicated branch with a
draft PR, one commit + one PR comment per item, without stopping to ask the user anything.
For the one-item-at-a-time interactive variant, use `/fix-next-todo-manual`.

This skill's workflow **overrides** the "do not `git add` or `git commit`" instruction in the
`docs/TODO.md` header — that instruction is for manual mode. Here, review happens on the PR.

## Setup (once per run)

1. Ensure the working tree is clean; if not, stop and tell the user — never mix their
   uncommitted work into this run.
2. If an open draft PR from a previous auto run exists (branch `claude/todo-sweep-*`), check
   out that branch and resume. Otherwise, from `main`, create `claude/todo-sweep-<YYYY-MM-DD>`,
   push it, and open a **draft PR** with `gh pr create --draft` titled "TODO sweep: <date>" and
   a body noting the run is in progress (final summary comes at the end).

## Per-item loop

Process items **top to bottom** (they're ordered by impact). For each item:

1. **Delegate to a fresh subagent.** Launch a `general-purpose` agent whose prompt contains the
   item's full text verbatim plus repo conventions (run `npm run check` and the tests covering
   the touched files). A fresh agent per item is what keeps each fix's context clean — do not
   implement items in the orchestrator conversation, and do not pull the subagent's diff into
   your own context; rely on its report. The subagent must report back one of:
   - **Fixed** — with a summary of what changed and why, files touched, check/test results,
     and any caveats or follow-ups.
   - **Skip** — the fix turned out not to be helpful, is riskier than the item claims, or
     requires a product/user decision to proceed. It must revert all its changes
     (`git restore .` + delete any new untracked files) and state exactly what decision is
     needed or why the item doesn't hold up.
2. **On Fixed:**
   - Verify the tree has changes and the reported checks passed (re-run `npm run check` if the
     report is ambiguous).
   - Remove the item from `docs/TODO.md` (bullet + body; keep the header block and any section
     intro text intact; delete a section header once its last item is gone).
   - Commit the fix **and** the `docs/TODO.md` edit together as one commit with a descriptive
     message, then push.
   - Post a PR comment (`gh pr comment`) containing: the item title, the commit SHA, the
     subagent's summary, test/check results, and any caveats worth a reviewer's attention.
3. **On Skip:**
   - Confirm the working tree is clean again (revert it yourself if the subagent didn't).
   - Edit the item in place in `docs/TODO.md`: prepend a line
     `**⏸ Pending decision:** <what the user must decide, and why auto mode couldn't proceed>`
     to the item body. Commit that edit and push.
   - Post a PR comment flagging the skipped item and the pending decision.
4. Move to the next item. Do not stop between items, do not ask the user anything mid-run —
   a decision point is handled by step 3, not by pausing.

## Completion

When every item is either fixed or marked pending:

1. If **no items remain**, delete `docs/TODO.md` and commit. If pending items remain, leave
   the file containing only the header and the pending items.
2. Update the PR description (`gh pr edit --body`): a one-line summary per change (linking each
   commit), plus — if any — a **"Needs your decision"** section listing each remaining item and
   its pending decision.
3. Mark the PR ready for review: `gh pr ready`.
4. In your final response: how many items were fixed, how many are pending decisions (and what
   those decisions are), and the PR URL.
