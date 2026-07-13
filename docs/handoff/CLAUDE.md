

<!-- Source: .ruler/AGENTS.md -->

# Handoff Conventions

This folder holds **transfer packets**: short, disposable notes that carry one piece of
in-flight work from one agent session to the next.

Handoffs are **transient**, not documentation. A durable decision belongs in an ADR
(`create-adr` skill); a durable TODO belongs in `docs/BACKLOG.md`; behavioral feedback
belongs in `memory/`. A handoff is deleted the moment it is consumed.

Write one with the `create-handoff` skill; consume one with the `resume-handoff` skill.

## One File Per Handoff

Name it `<brief-kebab-topic>.md`: two to four words describing what is being handed off, not
the date.

## Every Handoff Starts With A Status Line

The first line after the `#` heading is a blockquote carrying the metadata
`resume-handoff` reads to list and disambiguate open handoffs:

```md
# Handoff - <topic>

> <YYYY-MM-DD> · branch `<branch>` · PR [#NN](url) (omit if none) · <one-line objective>
```

## Required Sections

Keep it a packet, not a prose recap. Link to files to reread rather than re-explaining them.

* **Objective & non-goals**: what this work is trying to do, and what it is explicitly not
  doing.
* **State**: branch, PR, commits that landed, and files touched. In cloud sessions, a
  handoff is only useful if its branch is pushed.
* **Decisions made (and why)**: include approaches tried and reverted.
* **Unverified assumptions**: things believed but not checked. `resume-handoff` must test
  these first.
* **Done & verified**: commands already run and their result.
* **Risks & next 3 steps**: concrete next actions, ordered.
* **Reread first**: links to source files, ADRs, and skills to open before doing anything.

## Lifecycle

1. Commit and push the handoff with its branch. In a cloud session, the container is
   reclaimed after inactivity; an uncommitted handoff and the work it describes are lost.
2. `resume-handoff` consumes then deletes it. Its first job is to verify the packet against
   the repo, then proceed. It deletes the file immediately once absorbed and commits the
   deletion.
3. Prune stale handoffs. If a handoff's PR merged or its work is abandoned, delete the file.
