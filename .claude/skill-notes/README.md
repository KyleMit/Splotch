# Skill notes

Design history and open questions for the agent **skills** in this repo — one file per skill, named
after it (`burn-down-audits.md`).

A skill's `SKILL.md` is a runbook: it tells an agent what to do *now*, and every line it carries is
context the agent pays for on each invocation. That leaves no room for the other half of the story —
why the skill is shaped the way it is, which failures earned which rule, what was tried and
rejected, and what is still unvalidated. This directory is where that half lives.

## Rules

* **A skill must not link to its notes file.** The whole point of keeping this out of `SKILL.md` is
  that an agent executing the skill should not pull the design history into its context window. A
  pointer is an invitation to read it. These notes are for a human (or an agent explicitly sent
  here) working *on* the skill, not for one running it.
* **Notes are not authoritative over the skill.** If the two disagree, `SKILL.md` and the code are
  the truth and the notes are stale — fix them.
* **Record the reasoning, not the diff.** Git already has the diff. What is expensive to reconstruct
  is why a knob has the value it does, what the failure looked like, and which plausible-sounding
  alternative was already ruled out.

## Why here, and not somewhere else

* **Not `docs/adrs/`.** ADRs are for decisions about the production app — the thing that ships to
  users. Skills are internal agent tooling with a different audience and a much faster churn rate;
  mixing them dilutes the ADR index. (Architectural decisions about the *repo* that happen to
  involve skills — like ADR-0058 on ruler — are still ADRs.)
* **Not `docs/`.** That tree is app documentation: compatibility floors, contributing, issue
  workflow, cloud setup. Skill design history is not app documentation.
* **Not `.ruler/skills/<name>/`.** Everything there is copied verbatim into `.claude/skills/` and
  `.agents/skills/` by `npm run ruler:apply`, so a notes file would be triplicated and would sit
  inside the skill it is deliberately kept out of.

`.claude/` already holds hand-edited agent infrastructure that is not itself a skill —
`audit-conventions.md`, `rules/`, `hooks/`, `cloud/`. This belongs with those, and like them it is
**edit-in-place**: ruler does not generate it.
