## Conventions

* **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation.
* **TypeScript everywhere.** No plain `.js` source files in `src/`.
* **Svelte 5 runes only.** No legacy stores (`writable`, `readable`, `derived` from `svelte/store`).
* All npm scripts must run on macOS and Linux (ADR-0017; Windows dev support was dropped in
  ADR-0062): env vars are set inline (`VAR=value cmd`, no `cross-env`), and platform-specific tools
  (the Gradle wrapper, the file-manager opener) are invoked via Node helpers in `scripts/` rather
  than inline shell.
* **Formatting is split: Prettier owns code, dprint owns Markdown** (`*.md` is in `.prettierignore`;
  ADR-0057). The `format-edited-file.sh` PostToolUse hook auto-formats each file you edit through
  the right one, but if you write Markdown any other way (or aren't sure), run
  `npm run format:check` before you commit — CI's `dprint check` fails on unwrapped Markdown, and
  that's the most common reason a fresh PR is red.
