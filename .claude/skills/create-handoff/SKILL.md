---
name: create-handoff
description: Write a session-to-session transfer packet to docs/handoff/ so another Claude session can pick up in-flight work without re-deriving it — or, when asked for a copyable prompt instead, render the same handoff as one fenced continuation prompt in chat. Use when wrapping up before /clear, running low on context, or when the user says to "hand this off", "write a handoff", "give me a prompt for the next session", or pause work for later. To pick a handoff back up, use resume-handoff instead.
---

# Handoff

Write a **transfer packet** for the work in flight, so the next session can resume it cold. Read
`docs/handoff/CLAUDE.md` first — it defines the folder conventions this skill produces.

A handoff is transient. If what you're about to record is really a durable decision, a backlog item,
or behavioural feedback, route it to the `create-adr` skill, a **GitHub issue** (the live backlog —
see `docs/ISSUE-WORKFLOW.md`), or `memory/` instead — see the table in the root `CLAUDE.md`.

## Prompt mode

When the user asks for a **copyable prompt** — "give me a prompt for the next session", "something I
can paste" — deliver the same content as one fenced, self-contained prompt in the chat reply instead
of a packet file. Same state model and honesty rules as the packet (objective and non-goals, current
state with exact branches/PRs/commits, decisions and reverted approaches, done-and-verified vs
unverified assumptions, blockers, what the receiving session is authorized to do, the exact next
step, and the completion condition), written as instructions to a session that has none of this
context. Skip steps 1 and 4 below — there is no file to name, commit, or push — but push the working
branch itself if it has unpushed commits, for the same dead-link reason. Refresh the live state
(branch, PR, CI, processes) immediately before rendering; a prompt assembled from memory hands off a
state that no longer exists. A request to have other PRs *reviewed* is not this mode — that prompt
is `create-pr-feedback-handoff`'s.

## Steps

1. **Pick the topic name.** `docs/handoff/<brief-kebab-topic>.md`, two to four words for *what is
   being handed off* (`magic-brush-drift.md`, not a date). If a handoff for this exact work already
   exists, update it in place rather than making a second file.

2. **Write the packet** with the status line and the required sections from
   `docs/handoff/CLAUDE.md`:
   * Status line: `> <today> · branch \`<branch>\` · PR [#NN](url) ·
     <objective>`(get the date from the environment context, the branch from`git branch
     --show-current`; drop the PR segment if there's no PR).
   * Objective & non-goals · State (branch, PR, commit table, files touched) · Decisions made and
     why (including reverted approaches) · Unverified assumptions · Done & verified (the checks you
     ran and their result) · Risks & next 3 steps · Reread first (links to files/ADRs/skills).
   * Keep it a packet, not a recap. Prefer a `file:line` pointer over a paragraph re-explaining the
     code. The `docs/handoff/coloring-fill-drift.md` handoff is a worked example of the right
     density.

3. **Be honest about what's verified.** Anything you *believe* but did not run a check on goes under
   **Unverified assumptions**, not **Done & verified** — `resume-handoff` tests that section first,
   so mislabelling it there wastes the next session's trust.

4. **Commit and push.** The doc is only useful if it survives the container:
   ```
   git add docs/handoff/<topic>.md
   git commit -m "Add handoff for <topic>"
   git push -u origin <branch>
   ```
   Push the working branch too if it has unpushed commits — a handoff that points at commits only on
   this container's disk is a dead link.

5. Tell the user the file path and that the `resume-handoff` skill will pick it up.
