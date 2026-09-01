## Agent instruction files (ruler)

`.ruler/` is the source of truth for generated agent instructions and shared skills. Claude Code
(local and cloud sessions) reads `CLAUDE.md` files and `.claude/skills/`; OpenAI Codex and other
AGENTS.md-standard agents read `AGENTS.md` files and `.agents/skills/`. See ADR-0058.

* Root instructions live in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first); each
  nested `<dir>/.ruler/AGENTS.md` holds that directory's orientation and generates the sibling
  `<dir>/CLAUDE.md` + `<dir>/AGENTS.md`.
* Skills are authored in `.ruler/skills/<name>/SKILL.md` and copied verbatim to `.claude/skills/`
  and `.agents/skills/` — including helper files (`driver.mjs`, extra `.md` references).
* A skill whose implementation genuinely differs by runner is absent from the shared tree. Its
  complete, independent packages live in `.ruler/skill-forks/<runner>/skills/<name>/`.
  `tools/ruler/apply-skill-forks.mjs` replaces that whole generated skill directory after Ruler's
  shared pass (`claude` → `.claude`, `codex` → `.agents`). It rejects a name that also exists under
  `.ruler/skills/` or lacks a package for either configured runner, preventing either fork from
  inheriting shared implementation files or disappearing from one agent. Markdown fork sources end
  in `.template`; the suffix is removed at the destination and keeps Ruler's recursive rule loader
  from concatenating them into root instructions.
* Direct-maintained exceptions are declared in `tools/ruler/lib/direct-provider-skills.mjs`.
  `burn-down-audits` has independent Claude and Codex packages; `run-claude` and
  `implement-issue-stack` have only Codex packages because they orchestrate a standalone Claude
  process and Codex-native subagents respectively; `run-codex` has only a Claude package for the
  mirror-image reason, orchestrating a standalone Codex process; `analyze-session-transcripts` has
  independent provider packages because Claude Code and Codex persist different transcript formats.
  Edit registered packages and notes directly, never through `.ruler/`, and never create an
  undeclared provider by copying one.
* Skill notes are authored in `.ruler/skill-notes/<name>.md.template` and mirrored, suffix stripped,
  to `.claude/skill-notes/` and `.agents/skill-notes/` by `tools/ruler/mirror-skill-notes.mjs`. The
  `.template` suffix is load-bearing for the same reason it is on a skill fork's Markdown: ruler's
  recursive rule loader concatenates every `.md` under `.ruler/` into the root instruction files, so
  a plain `.md` note would land in every session's context — exactly what this tree exists to avoid.
  The mirror script refuses to run if it finds one. A forked skill's independent note instead lives
  under `.ruler/skill-forks/<runner>/skill-notes/` and must be absent from the shared note tree. The
  registered direct notes stay beside their direct provider trees. Notes are deliberately *not* part
  of a skill — see below.
* `npm run ruler:apply` snapshots every path in the direct-provider registry, runs Ruler, mirrors
  shared skill notes, applies managed skill forks, restores the direct paths even on failure, and
  dprint-formats the output. `npm run ruler:check` repeats that pipeline and fails if generated
  output changed — the CI drift gate. `npm run ruler:dry-run` previews Ruler's shared output only;
  it does not preview the post-apply layers.

`ruler:apply` rewrites both `.claude/` and `.agents/`. In a filesystem sandbox that makes either
provider tree read-only, run it with host/escalated write access from the first attempt. An `EPERM`
mid-pass can interrupt restoration of a registered direct-provider package; if a retry reports a
missing direct-provider source, restore that exact tracked path before running Ruler again.

**If asked to update agent instructions, docs, or skills: change `.ruler/**` sources, never the
generated files.** A generated file carries a `<!-- Source: ... -->` marker pointing back to its
source. For a registered direct package, edit its selected `.claude/` or `.agents/` package and note
instead.

Not generated — edit in place: registered direct provider implementations and notes,
`.claude/rules/` (path-scoped rules), `.claude/hooks/`, `.claude/settings.json`,
`.claude/audit-conventions.md`, `.claude/cloud/`, and everything under `docs/`.

`.ruler/skill-notes/` and the fork-specific `skill-notes/` directories hold the **design history and
open questions** for a skill — why it is shaped the way it is, which failures earned which rule,
what was rejected, what is still unvalidated. They are deliberately *not* linked from any
`SKILL.md`: a skill pays context for everything it references, and this material is for someone
working on the skill, not running it. Notes live beside skills rather than inside a skill package,
which would file design history inside the very skill it is kept out of. See
`.ruler/skill-notes/README.md.template` for the convention.
