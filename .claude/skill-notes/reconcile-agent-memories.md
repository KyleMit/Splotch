# reconcile-agent-memories — design notes

Issue #2328 required a real memory pass before writing the skill. The complete change list and
judgment log are in `docs/scratchpad/reconcile-agent-memories-2026-09-26.md`.

## Provider decision

The observed Splotch memory store is Claude Code's `MEMORY.md` plus one Markdown file per entry.
This host's `~/.codex` has no analogous project memory directory to reconcile. Codex persists
threads and other state, but no tested indexed memory format was found here. A shared skill would
promise Codex behavior we cannot verify; a paired managed fork would manufacture a second workflow
with no input. Register a Claude-only direct provider package under
`tools/ruler/lib/direct-provider-skills.mjs`, as ADR-0058 permits. This package and note are edited
directly; `npm run ruler:apply` preserves them. If Codex gains a concrete memory store, inspect its
format and access rules before adding a provider package or moving to a managed fork.

## What the first pass taught

The initial 44 entries had a complete index, yet still contained a broken wiki link, a retired
script, renamed skill text, and many expired PR and epic states. Index consistency alone is weak.
The deterministic checker gates only index membership, missing frontmatter names, wiki targets, and
npm scripts. Differing display names, unscanned entries, paths, possible skill names, and flags
remain advisory because local ignored files, historical examples, prose compounds, and external CLI
flags cannot be classified safely by syntax. The first pass retired 14 entries and corrected 12,
leaving 30 indexed memories and zero mechanical errors.

The most consequential judgment was retiring completed run plans rather than updating every stale
line in them. The completed work is preserved on GitHub and in historical notes; keeping a
present-tense queue in recall would invite a new session to act on it. Permission and merge memories
also needed a live source check before their advice could be narrowed to current authority.

The checker is deliberately an on-demand CLI, with tests over temporary fixtures but no CI scan of
the personal memory directory. That directory is not part of a clone, so a CI gate would test the
wrong machine or no memory at all.
