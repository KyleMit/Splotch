## Conventions

* **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation.
* **TypeScript everywhere.** No plain `.js` source files in `src/`.
* **Svelte 5 runes only.** No legacy stores (`writable`, `readable`, `derived` from `svelte/store`).
* All npm scripts must run on macOS, Linux, and Windows `cmd.exe` (ADR-0017): env vars go through
  `cross-env`, and platform-specific tools (the Gradle wrapper, the file-manager opener) are invoked
  via Node helpers in `scripts/` rather than inline shell.
