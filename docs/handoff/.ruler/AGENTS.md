# Handoff conventions

> This directory's `CLAUDE.md` and `AGENTS.md` are generated from the `.ruler/AGENTS.md` beside them
> — edit that source, then run `npm run ruler:apply` at the repo root (ADR-0058).

This folder holds **transfer packets** — short, disposable notes that carry one piece of in-flight
work from one Claude session to the next. A handoff answers "if I got hit by a bus mid-task, what
would the next session need to pick this up without re-deriving it?"

Handoffs are **transient**, not documentation. A durable decision belongs in an ADR (`/create-adr`);
a durable TODO belongs in a **GitHub issue** (the live backlog — see `docs/ISSUE-WORKFLOW.md`);
behavioural feedback belongs in `memory/`. A handoff is deleted the moment it's consumed.

Write one with the `create-handoff` skill (`/create-handoff`); consume one with the `resume-handoff`
skill (`/resume-handoff`).

## One file per handoff

Name it `<brief-kebab-topic>.md` — two to four words describing **what is being handed off**, not
the date (`magic-brush-drift.md`, `undo-button.md`, `ios-notch-band.md`). Multiple handoffs can
coexist; the topic name is how a human picks between them at a glance, and the status line (below)
is how `resume-handoff` disambiguates when a name isn't enough.

## Every handoff starts with a status line

The first line after the `#` heading is a blockquote carrying the metadata `resume-handoff` reads to
list and disambiguate open handoffs:

```
# Handoff — <topic>

> <YYYY-MM-DD> · branch `<branch>` · PR [#NN](url) (omit if none) · <one-line objective>
```

## Required sections

Keep it a **packet, not a prose recap**. Link to files to reread rather than re-explaining them.

* **Objective & non-goals** — what this work is trying to do, and what it is explicitly *not* doing
  (so the next session doesn't scope-creep).
* **State** — branch, PR, the commits that landed (short table: sha · what), and which files were
  touched. This repo is ephemeral in cloud sessions, so a handoff is only useful if its branch is
  **pushed** — see Lifecycle.
* **Decisions made (and why)** — including approaches tried and *reverted*, so they aren't
  revisited.
* **Unverified assumptions** — the things believed-but-not-checked. This is the section
  `resume-handoff` is required to test first.
* **Done & verified** — commands already run and their result (`npm run check`, `npm test`,
  `npm run gen:*:audit`, …), so the next session knows what it can trust vs. must re-run.
* **Risks & next 3 steps** — the concrete next actions, ordered.
* **Reread first** — links to the source files, ADRs, and skills to open before doing anything. Not
  a summary of them — pointers.

## Lifecycle

1. **Commit and push the handoff with its branch.** In a cloud session the container is reclaimed
   after inactivity; an uncommitted handoff (and the work it describes) is lost. `create-handoff`
   commits the doc and pushes the branch.
2. **`resume-handoff` consumes then deletes it.** Its first job is to verify the packet against the
   repo (mark each item confirmed / stale / missing) — *then* proceed. It deletes the file
   immediately once absorbed and commits the deletion, so a later resume never re-picks a spent
   handoff.
3. **Prune stale handoffs.** If a handoff's PR merged or its work is abandoned, delete the file —
   don't let the folder accumulate dead packets.
