# ADR-0058: Agent Instruction Files Generated from `.ruler/` (Claude Code + Codex)

**Status:** Active **Date:** 2026-07

## Context

Project knowledge for coding agents lived in Claude Code-native files only: a root `CLAUDE.md`,
nested `CLAUDE.md` files (`web/src/`, `web/tests/`, `scripts/`, `android/`, `tools/asset-gen/`,
`docs/handoff/`), and skills in `.claude/skills/` (ADR-0018). Agents that follow the cross-vendor
`AGENTS.md` convention — OpenAI Codex foremost — found nothing, so running them against this repo
meant working blind or hand-maintaining a parallel `AGENTS.md` tree that would inevitably drift.

Alternatives considered:

* **Hand-maintain `AGENTS.md` beside each `CLAUDE.md`.** No tooling, but every edit must be made
  twice and nothing catches a missed copy; guaranteed drift.
* **Symlink `AGENTS.md` → `CLAUDE.md`.** Zero duplication, but symlinks are unreliable on Windows
  checkouts (ADR-0017 makes Windows a first-class platform) and can't cover the skills tree, where
  Codex reads `.agents/skills/` rather than `.claude/skills/`.
* **[ruler](https://github.com/intellectronica/ruler)** (chosen): one source tree, a generator, and
  a CI gate. Ruler concatenates `.ruler/*.md` into each agent's native instruction file and copies
  `.ruler/skills/` to each agent's native skills directory.

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
* **Config:** `.ruler/ruler.toml` — `default_agents = ["claude", "codex"]`, gitignore/MCP/backup all
  disabled (files are tracked; there are no project MCP servers; `.bak` files would be noise).
* **Commands:** `npm run ruler:dry-run` previews generator changes without writing.
  `npm run ruler:apply` regenerates and then runs `dprint fmt` (ruler's raw output carries extra
  blank lines dprint collapses — formatting post-apply keeps the committed files inside the ADR-0057
  gate). `npm run ruler:check` (`scripts/ruler-check.mjs`) re-applies and fails on any worktree
  change or untracked generated file; the Quality CI job runs it.
* **Not generated** (edited in place): `.claude/rules/` path-scoped rules, `.claude/hooks/`,
  `.claude/settings.json`, `.claude/cloud/`, and `docs/`.

Gotchas encoded here: the blanket `build/` ignore needs negations for all three `skills/build/`
locations (`.gitignore`); deleting a skill from `.ruler/skills/` makes the next apply delete its
generated copies, which must be committed too; and the generated-files warning lives in the
`.ruler/` sources themselves so every agent that loads instructions is told to edit `.ruler/**`,
never the output.

## Consequences

* \+ Codex (and any AGENTS.md-reading agent) gets the same project knowledge as Claude Code,
  including skills, from one authored tree — no parallel maintenance.
* \+ Drift is structurally impossible to land: CI re-generates and fails on any difference, in
  either direction (unapplied source edit, or a direct edit to a generated file).
* \+ Skill helper files (`driver.mjs`, extra reference docs) propagate verbatim, so skills stay more
  than just prose.
* − Instruction content is duplicated three ways in the repo (source + two generated trees);
  reviewers see every skill edit twice more in diffs, and the checkout grows accordingly.
* − Ruler's nested mode and skills propagation are marked experimental; a future ruler release may
  change output format or file layout, which the exact version pin converts into a deliberate,
  reviewable upgrade rather than surprise CI failures.
* − Claude Code-specific routing (skill auto-invocation, path-scoped rules, `memory/`) has no Codex
  equivalent — the shared text can only *ask* other agents to read those files, not make it
  automatic.
* − Contributors (human and agent) must learn the indirection: editing the file an agent actually
  loaded is now wrong, and only the notice block plus the CI gate teach that.
