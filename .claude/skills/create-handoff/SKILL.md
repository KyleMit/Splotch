---
name: create-handoff
description: Hand in-flight work to another session — by default as a copyable continuation prompt rendered in one fenced code block, or as a transfer packet committed to docs/handoff/ when the user asks for a file. Use when wrapping up before /clear, running low on context, or when the user says to "hand this off", "write a handoff", "give me a prompt for the next session", or pause work for later. To pick a handoff back up, use resume-handoff instead.
---

# Handoff

Hand off the work in flight so the next session can resume it cold, without re-deriving it. Both
modes carry the same content; they differ only in where it lands.

| Mode                     | Use when                                                                                                                                              | Output                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Prompt** — the default | every other case                                                                                                                                      | one fenced code block in the chat reply, ready to paste into a new session |
| **File**                 | the user asks for a *file*, *doc*, *packet*, or `docs/handoff/` — or the receiving session is a cloud/other-machine run that must find it in the repo | `docs/handoff/<topic>.md`, committed and pushed                            |

Prompt mode is the default because it is portable: it needs no repo, no branch, and no commit to
reach the next session, and it works when the receiver is a different machine, a different runner,
or a session with no checkout. File mode buys durability instead — the packet travels with the repo
and `resume-handoff` finds it — and costs a commit, a push, and a file someone has to prune.

A handoff is transient either way. If what you're about to record is really a durable decision, a
backlog item, or behavioural feedback, route it to the `create-adr` skill, a **GitHub issue** (the
live backlog — see `docs/ISSUE-WORKFLOW.md`), or `memory/` instead — see the table in the root
`CLAUDE.md`. A request to have this session's PRs *reviewed* is not a handoff at all — that prompt
belongs to `create-pr-review-prompt`.

## Before either mode: refresh the live state

Handoff content assembled from memory hands off a state that no longer exists. Immediately before
writing, re-read the facts you are about to assert — the current branch, the log, the working tree,
the PR and its CI, and any background processes or servers this session started:

```
git branch --show-current && git status --short && git log --oneline -10
```

**Push the working branch if it has unpushed commits** — in both modes. A handoff pointing at
commits that live only on this container's disk is a dead link.

## What the handoff carries

Same state model in both modes, and the same honesty rule: anything you *believe* but did not run a
check on goes under **Unverified assumptions**, never under **Done & verified**. `resume-handoff`
tests that section first, and a receiving session that finds a mislabelled claim there stops
trusting the rest.

* **Objective & non-goals** — what the work is trying to do, and what it is explicitly *not* doing,
  so the next session doesn't scope-creep.
* **State** — branch, PR, the commits that landed (short table: sha · what), files touched.
* **Decisions made (and why)** — including approaches tried and **reverted**, so they aren't
  revisited.
* **Unverified assumptions** — believed, not checked.
* **Done & verified** — the commands already run and their result, so the next session knows what it
  can trust versus must re-run.
* **Risks & next 3 steps** — concrete, ordered.
* **Reread first** — pointers to the source files, ADRs, and skills to open first. Pointers, not
  summaries.

Keep it a packet, not a recap: prefer a `file:line` pointer over a paragraph re-explaining the code.
`docs/handoff/coloring-fill-drift.md` is a worked example of the right density.

## Prompt mode (default)

Render the whole handoff as **one fenced code block**, written as instructions to a session that has
none of this context — second person, imperative, no "as we discussed".

1. **Open with the objective and the checkout it assumes** — repo, branch, and how to get there
   (`git fetch && git checkout <branch>`), then the sections above.

2. **Add the two things only a prompt needs**, which a packet gets from its folder conventions:
   * **Authorization** — what the receiving session may do without asking (commit, push, open a PR,
     merge, run device captures) and what it must not.
   * **Completion condition** — the observable state that means the work is finished.

3. **Make it one clean copy.** Nothing but the prompt inside the fence, and no commentary between
   fences that a copy would swallow. If the prompt body itself contains a fenced block, wrap the
   outer fence in four backticks so the inner one survives. Keep your own chat prose to a line
   before the fence and a line after.

Do not tell the receiving session to look for a `docs/handoff/` packet or to run `resume-handoff` —
in this mode the prompt *is* the packet.

## File mode

1. **Pick the topic name.** `docs/handoff/<brief-kebab-topic>.md`, two to four words for *what is
   being handed off* (`magic-brush-drift.md`, not a date). If a handoff for this exact work already
   exists, update it in place rather than making a second file.

2. **Write the packet.** Read `docs/handoff/CLAUDE.md` first — it owns the folder conventions. The
   packet opens with the status line, then carries the sections above:

   ```
   > <today> · branch `<branch>` · PR [#NN](url) · <objective>
   ```

   Take the date from the environment context and the branch from the refresh above; drop the PR
   segment if there's no PR.

3. **Commit and push.** The doc is only useful if it survives the container:
   ```
   git add docs/handoff/<topic>.md
   git commit -m "Add handoff for <topic>"
   git push -u origin <branch>
   ```

4. Tell the user the file path and that the `resume-handoff` skill will pick it up.
