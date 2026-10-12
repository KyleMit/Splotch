# ADR-0107: Reference Skills Route to `docs/`; Workflow Skills Stay Inline

**Status:** Active **Date:** 2026-08

## Context

ADR-0058 made `.ruler/` the source of truth for agent instructions and generates a `.claude/` and an
`.agents/` copy of every skill. Each is committed, so one authored line of skill prose lands in the
repository three times and in every review three times. Over the 200 commits preceding this record,
the three skill trees together took 30,407 changed lines, of which 9,203 were canonical — 70% of the
churn was mechanical duplication of the other 30%.

The cost is specific, and naming it correctly determines the fix. A skill's **body** is not loaded
until the skill is invoked; only its `description` is always in context. So a long skill is already
free at rest, and the triplication is a git-and-review cost, not a token cost. Anything that shrinks
the body without reducing the number of stored copies treats the symptom.

The `mobile` skill had already arrived at the right shape from the other direction: a 25-line router
that names three reference files and says which to read for which task. Its files simply lived
inside the skill package, so they were triplicated like everything else.

Alternatives considered:

* **Symlink each generated skill directory at its `.ruler/` source.** Claude Code follows a symlink
  at `.claude/skills/<name>` and loads a target reachable from two locations once; Codex reads the
  tree with ordinary file tools, so links are transparent there too. This removes the duplication
  outright rather than reducing it. Deferred, not rejected: Ruler copies rather than links, so it
  needs a post-apply layer beside `apply-ruler-skill-forks.mjs` and a `ruler:check` that compares
  link targets, and it must be applied per skill so the direct-provider packages stay real
  directories. It also leaves the content addressable only through `.claude/`, where a human
  browsing the repository will not look. Worth revisiting on top of this record.
* **Stop committing the generated trees and regenerate them in a session hook.** Rejected: it
  reverses the explicit decision in `ruler.toml` that generated files are committed and drift is
  caught in CI, and any agent or session that reads a skill before the hook has run finds nothing.
* **Turn every skill into a pointer stub.** Rejected. A stub is still stored three times, so this
  shrinks the noise rather than removing it, and it pays a real price where the content is an
  imperative procedure: a step behind an indirection is a step that may not be read, and a step that
  was not read is a step that does not run.
* **Use `@path` imports inside `SKILL.md`.** Rejected because the mechanism does not exist. `@path`
  is a CLAUDE.md/memory-file feature and is **eager** — imports expand at session launch, which is
  the opposite of what a skill wants. `SKILL.md` bodies are not processed for it; the only
  substitutions available there are `$ARGUMENTS`/`$1`, `${CLAUDE_SKILL_DIR}`,
  `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`, and inline bash injection. The `adrs` skill
  carried an `@../../../docs/adrs/README.md` line that appeared to work only because a model reads
  the path and follows it with the Read tool; it is now written as the plain pointer it always was.

## Decision

Two independent changes, neither depending on the other.

**1. Mark the generated trees as generated.** `.gitattributes` sets `linguist-generated=true` on
`.claude/skills/**`, `.agents/skills/**`, the mirrored skill-note trees, and every generated
`CLAUDE.md`/`AGENTS.md`. GitHub collapses those files in a diff by default — still expandable, still
reviewable — and drops them from the language statistics. `.ruler/**` and the direct-provider
packages registered in `scripts/direct-provider-skills.mjs` are negated back to `false`, because
they are authored, not generated.

**2. Split skills by kind.** The repository already distinguishes **reference skills** (noun names,
load knowledge) from **workflow skills** (verb-noun names, perform a procedure). That line now also
decides where a skill's content lives:

* **Reference skills keep their bulk in `docs/` and are thin routers.** `architecture` →
  `docs/ARCHITECTURE.md`; `api` → `docs/API.md`; `testing` → `docs/TESTING.md`; `mobile` →
  `docs/MOBILE/{native,android,ios}.md`; `profiling` → `docs/PROFILING.md` and
  `docs/PROFILING-IPAD.md`. This content is documentation a human wants anyway, it is read by lookup
  rather than start to finish, and it is now stored once.
* **Workflow skills keep their procedure inline**, however long. Their content has no human reader
  that `docs/` would serve, and completeness of reading is load-bearing.

A router is not a bare path. It names the sections of the target document and says what each one
answers, so the agent reads the part that applies; it reaches past the pointer only for content
whose omission is expensive — invariants, footguns, and the constraints that make a wrong reading
costly.

The five reference skills went from 3,213 lines stored three times (9,639 tracked lines) to 151
lines stored three times plus 3,168 stored once (3,621 tracked lines).

## Consequences

* Editing this reference content is a single-file diff in `docs/`, and it is discoverable by humans
  from `README.md` and `docs/CONTRIBUTING.md`, which now link into `docs/` instead of into
  `.claude/skills/`.
* Invoking one of these skills costs one extra Read round-trip. That is real but small, and the
  content was never in context before invocation anyway.
* The risk this accepts is a partial read — an agent that skims the router and works from the
  section map without opening the document. The routers mitigate it by stating what each section
  answers, and by inlining the few rules that must not be missed. Workflow skills are exempt
  precisely because they cannot absorb this risk.
* Drift-guard tests that read this content (`scripts/tests/android-config.test.mjs`,
  `scripts/tests/ipad-console-driver.test.mjs`) now read the single `docs/` copy. They previously
  enforced only the `.ruler/` source and leaned on `ruler:check` to police the two mirrors; with one
  copy that qualification is gone.
* `.claude/rules/ipad-profiling-docs.md` shrinks from three `paths:` entries to one, for the same
  reason.
* The duplication is reduced, not eliminated — a router is still stored three times. The symlink
  approach above remains the way to remove it entirely, and this record does not preclude it.
