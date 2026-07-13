## Agent instruction files (ruler)

`.ruler/` is the single source of truth for the instructions coding agents load — Claude Code (local
and cloud sessions) reads the generated `CLAUDE.md` files and `.claude/skills/`; OpenAI Codex and
other AGENTS.md-standard agents read the generated `AGENTS.md` files and `.agents/skills/`. See
ADR-0058.

* Root instructions live in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first); each
  nested `<dir>/.ruler/AGENTS.md` holds that directory's orientation and generates the sibling
  `<dir>/CLAUDE.md` + `<dir>/AGENTS.md`.
* Skills are authored in `.ruler/skills/<name>/SKILL.md` and copied verbatim to `.claude/skills/`
  and `.agents/skills/` — including helper files (`driver.mjs`, extra `.md` references). When you
  delete a skill from `.ruler/skills/`, the next apply deletes the generated copies; commit those
  deletions too.
* `npm run ruler:apply` regenerates everything and dprint-formats the output. `npm run ruler:check`
  re-applies and fails if anything changed — the CI drift gate. `npm run ruler:dry-run` previews
  what an apply would regenerate without writing.

**If asked to update agent instructions, docs, or skills: change `.ruler/**` sources, never the
generated files.** A generated file carries a `<!-- Source: ... -->` marker pointing back to its
source.

Not generated — edit in place: `.claude/rules/` (path-scoped rules), `.claude/hooks/`,
`.claude/settings.json`, `.claude/audit-conventions.md`, `.claude/cloud/`, and everything under
`docs/`.
