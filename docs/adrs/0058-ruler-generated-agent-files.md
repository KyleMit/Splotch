# ADR-0058: Agent Instruction Files Generated from `.ruler/` (Claude Code + Codex)

**Status:** Active **Date:** 2026-07

## Context

Project knowledge for coding agents lived in Claude Code-native files only: a root `CLAUDE.md`,
nested `CLAUDE.md` files (`web/src/`, `scripts/`, `android/`, `tools/asset-gen/`, `docs/handoff/`),
and skills in `.claude/skills/` (ADR-0018). Agents that follow the cross-vendor `AGENTS.md`
convention — OpenAI Codex foremost — found nothing, so running them against this repo meant working
blind or hand-maintaining a parallel `AGENTS.md` tree that would inevitably drift.

The first implementation assumed every skill could be copied verbatim to every runner. That stopped
being true when `burn-down-audits` gained a Codex backend: process commands, authentication, model
selection, session resumption, liveness checks, and supervision are runner-native. Trying to keep
one detailed runbook with conditional sections made the already-tuned Claude Code workflow absorb
Codex-specific constraints and made the Codex workflow look like a patch on a canonical Claude
implementation. Ruler 0.3.44 supports per-agent instruction output paths but not per-agent skill
sources.

Alternatives considered:

* **Hand-maintain `AGENTS.md` beside each `CLAUDE.md`.** No tooling, but every edit must be made
  twice and nothing catches a missed copy; guaranteed drift.
* **Symlink `AGENTS.md` → `CLAUDE.md`.** Zero duplication, but it cannot cover independent skill
  packages: Codex reads `.agents/skills/` while Claude Code reads `.claude/skills/`.
* **[ruler](https://github.com/intellectronica/ruler)** (chosen): one source tree, a generator, and
  a CI gate. Ruler concatenates `.ruler/*.md` into each agent's native instruction file and copies
  `.ruler/skills/` to each agent's native skills directory.
* **Keep Claude as the shared skill and override Codex files after generation.** Minimal machinery,
  but the source layout still declares Claude canonical, a partial overlay silently inherits any new
  shared helper or reference, and neither implementation can safely change its package shape.
* **Maintain complete runner-specific packages for the exceptional skill** (chosen): accept
  duplication where the workflows genuinely differ, keep shared discovery text high-level, and
  replace the whole generated package so implementation details cannot leak across runners.

## Decision

`.ruler/` is the single source of truth for agent instructions and skills (`@intellectronica/ruler`,
pinned exactly in `devDependencies` — the drift gate depends on byte-stable output, so bumps are
deliberate):

* **Sources:** root instructions in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first);
  per-directory orientation in nested `<dir>/.ruler/AGENTS.md` (ruler's experimental `nested = true`
  mode); skills in `.ruler/skills/<name>/`.
* **Generated and committed:** `CLAUDE.md` + `AGENTS.md` at the root and beside every nested source
  (Claude Code reads `CLAUDE.md` locally and in cloud sessions; Codex and other AGENTS.md-standard
  agents read `AGENTS.md`), plus verbatim skill copies in `.claude/skills/` and `.agents/skills/`.
  Committing the output keeps fresh clones and web-UI browsing correct without requiring
  contributors to run ruler.
* **Runner-specific skill forks:** shared skills still live in `.ruler/skills/`. A workflow that
  genuinely needs independent implementations is removed from that tree and authored as complete
  packages in `.ruler/skill-forks/<runner>/skills/<name>/` (`claude` → `.claude/skills`, `codex` →
  `.agents/skills`). `scripts/apply-ruler-skill-forks.mjs` runs after Ruler and replaces the whole
  destination skill directory. It fails if a forked name also exists in `.ruler/skills/` or lacks a
  package for either configured runner, so no helper, reference, or future file can be inherited
  accidentally and the skill cannot disappear from one agent. Markdown fork sources use a
  `.template` suffix, removed at the destination, to keep Ruler's recursive rule loader from
  concatenating them into root instructions. Shared discovery surfaces such as `skills-guide` and
  the root knowledge map describe only the common capability, not either runner's procedure.
* **Config:** `.ruler/ruler.toml` — `default_agents = ["claude", "codex"]`, gitignore/MCP/backup all
  disabled (files are tracked; there are no project MCP servers; `.bak` files would be noise).
* **Skill design notes:** shared notes in `.ruler/skill-notes/` are mirrored to both agents. A
  forked skill instead keeps independent notes in `.ruler/skill-forks/<runner>/skill-notes/`; the
  fork step writes each note only to its matching runner and rejects a shared note with the same
  name.
* **Commands:** `npm run ruler:apply` regenerates shared output, mirrors shared skill notes, applies
  complete skill forks, and then runs `dprint fmt` (Ruler's raw output carries extra blank lines
  dprint collapses — formatting post-apply keeps the committed files inside the ADR-0057 gate).
  `npm run ruler:check` (`scripts/ruler-check.mjs`) repeats the whole pipeline and fails on any
  worktree change or untracked generated file; the Quality CI job runs it. `ruler:dry-run` previews
  only Ruler's shared pass because upstream has no concept of the fork layer.
* **Not generated** (edited in place): `.claude/rules/` path-scoped rules, `.claude/hooks/`,
  `.claude/settings.json`, `.claude/audit-conventions.md`, `.claude/cloud/`, and `docs/`.

Gotchas encoded here: the blanket `build/` ignore needs negations for all three `skills/build/`
locations (`.gitignore`); deleting a skill from `.ruler/skills/` makes the next apply delete its
generated copies, which must be committed too; and the generated-files warning lives in the
`.ruler/` sources themselves so every agent that loads instructions is told to edit `.ruler/**`,
never the output.

## Consequences

* \+ Codex (and any AGENTS.md-reading agent) gets the same shared project knowledge as Claude Code
  from one authored `.ruler/` tree. Exceptional runner-native workflows can diverge completely
  without direct edits to generated output.
* \+ Drift is structurally impossible to land: CI re-generates and fails on any difference, in
  either direction (unapplied source edit, or a direct edit to a generated file).
* \+ Skill helper files (`driver.mjs`, extra reference docs) propagate verbatim, so skills stay more
  than just prose.
* \+ A fork replaces the complete package and rejects a shared package or note with the same name;
  adding a file to one runner can never change the other runner's implementation implicitly.
* − Instruction content is duplicated three ways in the repo (source + two generated trees);
  reviewers see every shared skill edit twice more in diffs, while a forked skill additionally
  duplicates any high-level concepts each implementation chooses to restate.
* − Ruler's nested mode and skills propagation are marked experimental; a future ruler release may
  change output format or file layout, which the exact version pin converts into a deliberate,
  reviewable upgrade rather than surprise CI failures.
* − The post-apply fork layer is project-owned machinery outside Ruler. A future Ruler release with
  native per-agent skill sources should replace it; until then, every apply/check must keep the fork
  step between Ruler and formatting.
* − Claude Code-specific routing (skill auto-invocation, path-scoped rules, `memory/`) has no Codex
  equivalent — the shared text can only *ask* other agents to read those files, not make it
  automatic.
* − Contributors (human and agent) must learn the indirection: editing the file an agent actually
  loaded is now wrong, and only the notice block plus the CI gate teach that.
