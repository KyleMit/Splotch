# Ruler tooling

This capability generates the repository's provider-facing instructions and shared skill packages
from `.ruler/` while preserving the provider implementations that are intentionally maintained in
place. It also mirrors skill design notes, applies complete runner-specific skill forks, and checks
the committed generated output for drift.

## Entry points

| Entry point                 | Public command        | Purpose                                            |
| --------------------------- | --------------------- | -------------------------------------------------- |
| `apply-ruler.mjs`           | `npm run ruler:apply` | Generate, layer exceptions, and format output      |
| `check-generated-files.mjs` | `npm run ruler:check` | Fail when generated output differs from its source |
| `apply-skill-forks.mjs`     | Internal apply step   | Replace complete runner-specific skill packages    |
| `mirror-skill-notes.mjs`    | Internal apply step   | Mirror shared note sources into provider trees     |

`npm run ruler:dry-run` invokes Ruler directly and previews only the shared generation pass. It does
not run the note mirror, managed-fork layer, direct-provider preservation wrapper, or final dprint
formatting. Despite its name, `npm run ruler:check` is not read-only: it regenerates and formats
files in place before comparing them with the staged or committed versions, so run it only with
unrelated work committed or stashed.

## Ownership model

`.ruler/` is the source of truth for generated `AGENTS.md`, `CLAUDE.md`, shared skills, and shared
skill notes. `lib/direct-provider-skills.mjs` is the registry for packages and notes whose Claude
and Codex implementations are maintained directly in their destination trees. `apply-ruler.mjs`
snapshots every registered direct path, runs Ruler, restores those paths even when generation fails,
applies managed forks and shared notes, then formats the committed output.

Managed runner forks are complete packages under `.ruler/skill-forks/<runner>/`; a fork cannot also
have a shared implementation, and every configured runner must provide the package. Shared skill
notes use the `.md.template` suffix under `.ruler/skill-notes/` so Ruler's recursive rule loader
cannot concatenate design history into root instructions.

## Inputs and outputs

The inputs are `.ruler/` sources plus the registered direct-provider packages and notes preserved
from `.claude/` and `.agents/`. The generated outputs are every root or nested `AGENTS.md` and
`CLAUDE.md`, the `.claude/skills/` and `.agents/skills/` trees, and the `.claude/skill-notes/` and
`.agents/skill-notes/` trees. Direct-provider paths inside those trees remain authored sources and
are excluded from generated-file drift checks through the registry.

## Prerequisites and failure behavior

The apply command requires the repository's installed Node dependencies plus `ruler` and `dprint` on
the project command path. Missing registered provider paths, competing shared/direct sources,
incomplete forks, unsafe Markdown suffixes, generation failures, or formatting failures produce a
nonzero exit. Direct provider paths are restored in a `finally` path even when an intermediate
generation step fails. Other files already regenerated before a failure remain modified and may be
unformatted because dprint runs last; recover by rerunning `npm run ruler:apply` on a worktree with
no unrelated edits.

Edit `.ruler/**` sources rather than generated files, except for packages explicitly listed in
`lib/direct-provider-skills.mjs`. Adding a direct package to that registry also requires matching
`linguist-generated=false` entries in `.gitattributes`; `tests/direct-provider-linguist.test.mjs`
enforces the pair. After any instruction, skill, or note change, run:

```sh
npm run ruler:apply
npm run ruler:check
npm run test:tools -- tools/ruler/tests
npm run format:check
```
