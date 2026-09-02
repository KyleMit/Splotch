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
* **Maintain complete runner-specific packages for the exceptional skill** (chosen, later amended):
  accept duplication where the workflows genuinely differ and keep shared discovery text high-level.
  The first version replaced both generated packages from provider-specific `.ruler/` templates.
  After both implementations stabilized, `burn-down-audits` moved to direct provider ownership so
  editing either runbook no longer required a generation indirection.

## Decision

`.ruler/` is the source of truth for generated agent instructions and skills
(`@intellectronica/ruler`, pinned exactly in `devDependencies` — the drift gate depends on
byte-stable output, so bumps are deliberate). A deliberately small registry in
`tools/ruler/lib/direct-provider-skills.mjs` declares provider-native packages that are edited
directly:

* **Sources:** root instructions in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first);
  per-directory orientation in nested `<dir>/.ruler/AGENTS.md` (ruler's experimental `nested = true`
  mode); skills in `.ruler/skills/<name>/`.
* **Generated and committed:** `CLAUDE.md` + `AGENTS.md` at the root and beside every nested source
  (Claude Code reads `CLAUDE.md` locally and in cloud sessions; Codex and other AGENTS.md-standard
  agents read `AGENTS.md`), plus verbatim skill copies in `.claude/skills/` and `.agents/skills/`.
  Committing the output keeps fresh clones and web-UI browsing correct without requiring
  contributors to run ruler.
* **Runner-specific skill forks:** shared skills still live in `.ruler/skills/`. A managed workflow
  that genuinely needs independent implementations can be authored as complete packages in
  `.ruler/skill-forks/<runner>/skills/<name>/` (`claude` → `.claude/skills`, `codex` →
  `.agents/skills`). `tools/ruler/apply-skill-forks.mjs` runs after Ruler and replaces the whole
  destination package while enforcing paired providers and shared-source isolation. Direct packages
  are intentionally not managed by that layer. `burn-down-audits` has complete, independent
  implementations in `.claude/skills/burn-down-audits/` and `.agents/skills/burn-down-audits/`.
  `analyze-session-transcripts` likewise has independent provider packages because Claude Code and
  Codex use different transcript stores and record formats; sharing the name preserves one user
  concept without imposing a shared parser or runbook. `run-rival-agent` has one package per
  provider, each launching the *other* vendor's local CLI: the Codex package launches a fresh local
  Claude Code process through fixed permission-reviewed wrappers, and the Claude package launches a
  read-only Codex process (see the 2026-09 amendment below). `implement-issue-stack` exists only in
  `.agents/skills/implement-issue-stack/`: it orchestrates Codex-native implementers and consumes
  the Codex package of `run-rival-agent` for independent adversarial review; a Claude package would
  misrepresent the workflow. The registry declares exactly which providers exist; changing one never
  implies creating or syncing another provider.
* **Config:** `.ruler/ruler.toml` — `default_agents = ["claude", "codex"]`, gitignore/MCP/backup all
  disabled (files are tracked; there are no project MCP servers; `.bak` files would be noise).
* **Skill design notes:** shared notes in `.ruler/skill-notes/` are mirrored to both agents. A
  managed fork keeps independent notes in `.ruler/skill-forks/<runner>/skill-notes/`. Every direct
  package keeps its note in the matching provider's `skill-notes/` tree.
* **Commands:** `npm run ruler:apply` (`tools/ruler/apply-ruler.mjs`) snapshots every package and
  note path derived from the direct registry, regenerates shared output, mirrors shared skill notes,
  applies managed skill forks, restores the direct paths even when generation fails, and then runs
  `dprint fmt` (Ruler's raw output carries extra blank lines dprint collapses — formatting
  post-apply keeps the committed files inside the ADR-0057 gate). `npm run ruler:check`
  (`tools/ruler/check-generated-files.mjs`) repeats the whole pipeline and fails on any worktree
  change or untracked generated file; the Quality CI job runs it. Registered direct packages and
  notes are excluded from generated-file drift accounting and are reviewed like ordinary tracked
  source. `ruler:dry-run` previews only Ruler's shared pass because upstream has no concept of the
  fork layer.
* **Not generated** (edited in place): `.claude/rules/` path-scoped rules, `.claude/hooks/`,
  `.claude/settings.json`, `.claude/audit-conventions.md`, `.claude/cloud/`, registered direct
  provider packages and notes, and `docs/`.

Gotchas encoded here: the blanket `build/` ignore needs negations for all three `skills/build/`
locations (`.gitignore`); deleting a skill from `.ruler/skills/` makes the next apply delete its
generated copies, which must be committed too; and the generated-files warning lives in the
`.ruler/` sources themselves so every agent is told both the normal `.ruler/**` rule and the direct
provider registry exception. The apply needs write access to both provider trees: a filesystem
sandbox that makes `.claude/` or `.agents/` read-only can fail after generation has started and
interrupt restoration of a registered direct-provider package, so sandboxed runners escalate the
first attempt rather than retrying after a partial pass.

## Consequences

* \+ Codex (and any AGENTS.md-reading agent) gets the same shared project knowledge as Claude Code
  from one authored `.ruler/` tree. Exceptional runner-native workflows can diverge completely
  without direct edits to generated output.
* \+ Drift is structurally impossible to land for generated surfaces: CI re-generates and fails on
  any difference in either direction. Direct provider packages are ordinary reviewed source rather
  than generator output.
* \+ Skill helper files (`driver.mjs`, extra reference docs) propagate verbatim, so skills stay more
  than just prose.
* \+ A managed fork replaces the complete package and rejects a shared package or note with the same
  name. The direct registry is even more explicit: each skill declares exactly which providers own
  packages in the paths they execute.
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
* − Contributors (human and agent) must learn a narrow exception to the indirection: editing the
  file an agent loaded is normally wrong, but is correct for a package registered to that provider
  in `scripts/direct-provider-skills.mjs`.

## Amendment (2026-09): one skill name for the cross-vendor launcher

`run-claude` (Codex launches Claude) and `run-codex` (Claude launches Codex) were registered as two
one-sided direct packages. They were the same capability pointed in opposite directions, but a
shared skill could only reference them conditionally — "from Codex use `run-claude`; otherwise use
`run-codex`" — and the `skills-guide` spent two rows on one concept.

Both packages now carry the single name `run-rival-agent`, registered for both providers. Nothing
detects the running agent: a Claude session only loads `.claude/skills/`, a Codex session only
`.agents/skills/`, so each runner receives the package that launches the *other* vendor by virtue of
which tree it reads. Shared prose names `run-rival-agent` without knowing where it runs.

Alternatives rejected:

* **A thin shared router skill** that detects the runner and points at the provider-specific skill.
  It unifies only the reference, not the invocation, and the agent pays context for two skills while
  trusting the first to describe the second correctly.
* **A runtime dispatcher script** behind one npm entry. From Codex the dispatcher runs inside the
  sandbox and cannot reach the installed Keychain-backed wrappers, so it could only print the
  escalated command for Codex to run — a worse contract than the direct one, and a new entry the
  Codex exec-policy would have to review.
* **Managed skill forks** under `.ruler/skill-forks/`. The mechanism fits, but it would turn the
  installer and Codex exec-policy scripts into generated output with a regeneration step on every
  edit, and no fork exists yet to prove the path. Direct registration for both providers is the
  in-use precedent (`burn-down-audits`).

Kept deliberately: the `run-claude:*` / `run-codex:*` npm namespaces, the installed
`~/.local/libexec/splotch-claude-*.mjs` wrapper names, and the install/health log strings. Each
names the process it launches, which is unambiguous from either side; a shared `run-rival-agent:*`
namespace would have to answer "which rival?" in every variant name, and the exec-policy patterns
key on the installed paths, so leaving them means the rename never touches the trust boundary.

The two packages remain asymmetric in capability. Only the Codex side carries a write-capable
profile (the fixed Splotch PR-review publisher); the Claude side is read-only by design. Giving the
Claude side a publishing profile is a separate decision with its own trust-boundary consequences and
is not part of this amendment.
