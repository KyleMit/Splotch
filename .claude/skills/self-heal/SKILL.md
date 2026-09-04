---
name: self-heal
description: Sweep the session just worked for hiccups, surprises, workarounds, and hard-won lessons, judge which are durable, and write each into the home the next tripped-up session will actually see — a harness fix, code comment, rename, script change, doc or skill edit, ADR, GitHub issue comment, PR description, or scratchpad note — applied now rather than staged. Use when asked to self heal, when wrapping up a session that hit friction, or whenever a lesson is about to be lost because it lives only in this conversation.
---

# Self-heal

One question, asked while the session's scars are still visible: **what did this session learn the
hard way that the next session should get for free?** A lesson that lives only in this conversation
dies with it. For each hiccup, finding, or lesson, judge whether it is durable, pick the home the
next session that would trip on it will actually see, and write it there — now, in this session, not
as a note to do it later.

## The sweep

Work from the session's actual history, not from what felt memorable — the costliest lessons are
often absorbed without registering. Look for:

* **Failed attempts followed by the working form** — a command that took three tries, a wrong path,
  a guessed flag, an API called with the wrong shape. The lesson is whatever would have made the
  first attempt right.
* **Surprises** — something a doc, skill, name, or comment promised that reality contradicted; a
  tool that succeeded while doing the wrong thing; a plausible result that turned out wrong.
* **Workarounds** — anything done the long way because the short way is broken, missing, or
  undiscoverable. Sometimes the workaround is the knowledge worth keeping; sometimes the broken
  short way is the thing to fix.
* **Dead ends** — an approach tried and abandoned for a reason the next attempt would want to know
  before repeating it.
* **Advice you'd give the next session** — finish the sentence "I wish I'd known…" for this repo,
  this branch, this task.

## The durability bar

Durability is your own judgment call — there is no checklist that replaces it. The test: **is
another session, or another contributor, likely to trip on this?**

* A one-off typo, an immediately-corrected mistake, or a confusion an existing, reachable doc
  already answers is not durable — dropping it is the correct verdict.
* An empty sweep is a valid, honest result. Report "nothing worth healing" rather than inventing a
  finding; noise buries the lessons that matter.
* Repetition is the strongest signal: the same class of problem hit twice this session, or hit
  before by a past session (check `docs/AUDIT-LOG.md`, handoffs, PR threads), is durable by
  definition.

## Placement — put it where the next session will be looking

The rule that makes a lesson durable in practice: **if another session is likely to get tripped up
on something, put the finding in a place that session is likely to see.** Picture where the next
victim will be standing at the moment they trip — reading which file, running which command,
following which skill — and write the lesson there. A note filed somewhere merely "logical" that the
tripping session never opens heals nothing.

| The next tripped-up session will be…                | Durable home                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reading or editing the code that traps              | a comment stating the non-obvious WHY (repo comment rules apply), a rename that removes the ambiguity, or a clearer error message                             |
| running the script that failed                      | change the script — validate the input, handle the case, or fail with the message that names the fix                                                          |
| following the doc, skill, or rule that misled       | edit it — through its `.ruler/**` source when generated (`npm run ruler:apply`); registered direct packages and `docs/` in place                              |
| facing the same architectural choice                | an ADR, via the `create-adr` skill                                                                                                                            |
| hitting the same harness papercut                   | fix the harness — `.claude/settings.json`, a hook, a path-scoped rule — so it is enforced rather than described                                               |
| picking up a specific GitHub issue                  | a comment on that issue                                                                                                                                       |
| reviewing, resuming, or building on an open PR      | its PR description, or a PR comment                                                                                                                           |
| taking a physical-device or profiling capture       | `docs/PROFILING-CAMPAIGNS.md` — the trap catalogue every capture session reads; a capture-path mechanism filed anywhere else is unread at the moment it trips |
| re-litigating this session's investigation          | a `docs/scratchpad/` note holding the evidence and chronology                                                                                                 |
| needing Claude to behave differently here           | `memory/` behavioral feedback (see "Memory vs. ADRs" in the root instructions)                                                                                |
| eventually landing a fix too large for this session | a GitHub issue (`docs/ISSUE-WORKFLOW.md`) — the backlog is issues, never a Markdown list                                                                      |

Two placement traps, both learned from prior sessions:

* **Siloed under the wrong trigger.** A lesson filed under the task that happened to hit it, rather
  than the entry point the next session will actually come through, gets "fixed" once per trigger
  and keeps resurfacing. When the knowledge already exists under a differently-framed doc or skill,
  the heal is a cross-reference from the entry point you actually used — not a second copy.
* **Describing what should be enforced.** A "remember to X" sentence is the weakest durability.
  Prefer, in order: make the failure impossible (fix the code or script), make it loud (a check, a
  drift-guard test, a hook), and only then describe it.

## Apply now, small and verified

This skill **applies** its fixes; it does not stage them for later. Each heal is the smallest
confident change, verified like any other edit: generated files only via `.ruler/**` plus `npm run
ruler:apply`; Markdown through `npm run format:check`; code and scripts through `npm run check` and
the tests covering them. Commit the heals with the session's work, or as their own clearly-messaged
commit when the session's branch is already spoken for.

## When another skill is the better home

Close cousins, split by what happens to the finding:

* **`session-audit`** — recurring repo friction whose fix deserves adversarial vetting, isn't
  obvious, or is bigger than this session can land: stage it into the audit pipeline instead. Rule
  of thumb: self-heal when you know the fix and its home and can land it now; `session-audit` when
  the finding needs vetting, aggregation, or a later fix agent.
* **The audit skills' shared §3** (`.claude/audit-conventions.md`) — method knowledge about the
  audit that just ran folds into that skill's own file. That is the in-file special case of this
  sweep, and audit runs keep doing it inline.
* **`create-adr` / `update-adrs`** — a significant decision with real alternatives is an ADR, not a
  note.
* **`create-handoff`** — in-flight work to continue is a transfer packet, not a lesson.

## Report

Close with a short list: each lesson → the home chosen → the change applied (file and commit) — plus
any candidate judged not durable and why, so the judgment is visible without being filed. "Clean
session — nothing worth healing" is a complete, successful report.
