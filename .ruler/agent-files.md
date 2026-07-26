## Agent instruction files (ruler)

`.ruler/` is the single source of truth for the instructions coding agents load — Claude Code (local
and cloud sessions) reads the generated `CLAUDE.md` files and `.claude/skills/`; OpenAI Codex and
other AGENTS.md-standard agents read the generated `AGENTS.md` files and `.agents/skills/`. See
ADR-0058.

* Root instructions live in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first); each
  nested `<dir>/.ruler/AGENTS.md` holds that directory's orientation and generates the sibling
  `<dir>/CLAUDE.md` + `<dir>/AGENTS.md`.
* Skills are authored in `.ruler/skills/<name>/SKILL.md` and copied verbatim to `.claude/skills/`
  and `.agents/skills/` — including helper files (`driver.mjs`, extra `.md` references). Ruler
  0.3.44 cannot vary skill content per output, so the apply then overlays any files under
  `.ruler/agent-overrides/<runner>/` onto that runner's generated root (`claude` → `.claude`,
  `codex` → `.agents`) via `scripts/apply-ruler-agent-overrides.mjs`. Override sources end in
  `.template`; the suffix is removed in the generated path, and it keeps Ruler's recursive Markdown
  rule loader from concatenating the variant into root instructions. An override must replace a file
  Ruler just generated; it cannot create a runner-only file. Use one only when a workflow genuinely
  differs by runner; shared content stays in `.ruler/skills/`. When you delete an override, the next
  apply restores the shared generated copy; commit that change too.
* Skill notes are authored in `.ruler/skill-notes/<name>.md` and mirrored to `.claude/skill-notes/`
  and `.agents/skill-notes/` by `scripts/mirror-skill-notes.mjs`, which the apply runs after ruler.
  ruler itself only knows how to copy skills, and these are deliberately *not* skills — see below.
  Deleting a note deletes both copies on the next apply.
* `npm run ruler:apply` runs Ruler, applies runner-specific overlays, mirrors skill notes, and
  dprint-formats the output. `npm run ruler:check` repeats that pipeline and fails if anything
  changed — the CI drift gate. `npm run ruler:dry-run` previews Ruler's shared output only; it does
  not preview the post-apply overlays.

**If asked to update agent instructions, docs, or skills: change `.ruler/**` sources, never the
generated files.** A generated file carries a `<!-- Source: ... -->` marker pointing back to its
source.

Not generated — edit in place: `.claude/rules/` (path-scoped rules), `.claude/hooks/`,
`.claude/settings.json`, `.claude/audit-conventions.md`, `.claude/cloud/`, and everything under
`docs/`.

`.ruler/skill-notes/` holds the **design history and open questions** for a skill — why it is shaped
the way it is, which failures earned which rule, what was rejected, what is still unvalidated. It is
deliberately *not* linked from any `SKILL.md`: a skill pays context for everything it references,
and this material is for someone working on the skill, not running it. It also lives beside the
skills rather than inside `.ruler/skills/<name>/`, which would file a skill's design history inside
the very skill it is kept out of. See its `README.md` for the convention.
