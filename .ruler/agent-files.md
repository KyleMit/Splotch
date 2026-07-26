## Agent instruction files (ruler)

`.ruler/` is the single source of truth for the instructions coding agents load — Claude Code (local
and cloud sessions) reads the generated `CLAUDE.md` files and `.claude/skills/`; OpenAI Codex and
other AGENTS.md-standard agents read the generated `AGENTS.md` files and `.agents/skills/`. See
ADR-0058.

* Root instructions live in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first); each
  nested `<dir>/.ruler/AGENTS.md` holds that directory's orientation and generates the sibling
  `<dir>/CLAUDE.md` + `<dir>/AGENTS.md`.
* Skills are authored in `.ruler/skills/<name>/SKILL.md` and copied verbatim to `.claude/skills/`
  and `.agents/skills/` — including helper files (`driver.mjs`, extra `.md` references).
* A skill whose implementation genuinely differs by runner is absent from the shared tree. Its
  complete, independent packages live in `.ruler/skill-forks/<runner>/skills/<name>/`.
  `scripts/apply-ruler-skill-forks.mjs` replaces that whole generated skill directory after Ruler's
  shared pass (`claude` → `.claude`, `codex` → `.agents`). It rejects a name that also exists under
  `.ruler/skills/` or lacks a package for either configured runner, preventing either fork from
  inheriting shared implementation files or disappearing from one agent. Markdown fork sources end
  in `.template`; the suffix is removed at the destination and keeps Ruler's recursive rule loader
  from concatenating them into root instructions.
* Skill notes are authored in `.ruler/skill-notes/<name>.md` and mirrored to `.claude/skill-notes/`
  and `.agents/skill-notes/` by `scripts/mirror-skill-notes.mjs`. A forked skill's independent note
  instead lives under `.ruler/skill-forks/<runner>/skill-notes/` and must be absent from the shared
  note tree. Notes are deliberately *not* part of a skill — see below.
* `npm run ruler:apply` runs Ruler, mirrors shared skill notes, applies complete skill forks, and
  dprint-formats the output. `npm run ruler:check` repeats that pipeline and fails if anything
  changed — the CI drift gate. `npm run ruler:dry-run` previews Ruler's shared output only; it does
  not preview the post-apply forks.

**If asked to update agent instructions, docs, or skills: change `.ruler/**` sources, never the
generated files.** A generated file carries a `<!-- Source: ... -->` marker pointing back to its
source.

Not generated — edit in place: `.claude/rules/` (path-scoped rules), `.claude/hooks/`,
`.claude/settings.json`, `.claude/audit-conventions.md`, `.claude/cloud/`, and everything under
`docs/`.

`.ruler/skill-notes/` and the fork-specific `skill-notes/` directories hold the **design history and
open questions** for a skill — why it is shaped the way it is, which failures earned which rule,
what was rejected, what is still unvalidated. They are deliberately *not* linked from any
`SKILL.md`: a skill pays context for everything it references, and this material is for someone
working on the skill, not running it. Notes live beside skills rather than inside a skill package,
which would file design history inside the very skill it is kept out of. See
`.ruler/skill-notes/README.md` for the convention.
