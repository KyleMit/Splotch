## Conventions

* **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation. A
  comment that does survive states stable facts: no temporal phrasing ("now", "previously") and no
  restating mutable facts (counts, dates, values, paths) owned elsewhere — name the owning
  identifier or file instead.
* Numbered step comments (`// 1. …`) or section banners inside one function are the signal to
  extract each step into a named helper — write it that way the first time.
* **Tuning literals get names.** A numeric literal that encodes a tunable decision — threshold,
  duration, dimension, curve shaping, byte offset, retry count — gets a named module-scope constant
  with the unit in the name (`_MS`, `_PX`, `SNAP_BAND_FRACTION`); the WHY comment lives on the
  constant. Plain geometry arithmetic stays inline. (ESLint's `no-magic-numbers` was evaluated and
  rejected: ~750 hits in this canvas-heavy codebase.)
* **Cross-file agreement is never maintained by prose.** A value that must agree with another module
  is imported from one exported constant; when the agreeing sites can't share code (the `app.html`
  boot script, YAML, native config, generated output), add a drift-guard test that reads both sides
  and fails on divergence — the pattern of `web/src/app.html.test.ts`,
  `tools/mobile/android/tests/android-config.test.mjs`, and `web/src/browserFloor.test.ts`. A "keep
  in sync with X" comment marks a defect, not a mitigation. Same rule for boundary strings (storage
  keys, query params, event names, special-case ids): declared once, imported everywhere (tests
  deliberately excepted). A **bundle boundary** is one of the places that can't share code: a static
  import into a startup-path module hands Rollup an edge that re-partitions chunks no matter how
  small the imported module, so there the duplication is deliberate and the sharing itself is the
  defect (`web/src/lib/state/saveFolder.svelte.ts` vs `folderSave.ts`, drift-guarded by
  `saveFolder.svelte.test.ts` and pinned by `web/tests/startup-bundle.spec.ts`). Such a site keeps
  its inline copy, adds the drift-guard test, and carries a comment stating the constraint and
  naming the enforcing spec — that comment is load-bearing evidence of intent, not the "keep in
  sync" defect above, and refactoring the duplication away past it breaks the boundary it protects.
* **TypeScript everywhere.** No plain `.js` source files in `src/`.
* **Close finite value sets in the type.** A value drawn from a fixed vocabulary (style names,
  platforms, sizes, themes) is a literal union or `keyof typeof`, threaded end to end — never bare
  `string`/`number` plus a runtime fallback; constant maps are `Record<UnionType, V>` (or
  `satisfies`), not `Record<string, V>`.
* **`as` is a boundary tool.** Cast only where typed code meets untyped input (storage, wire,
  non-standard browser APIs) after runtime validation, or augment globals in `app.d.ts` (the
  `WindowEventMap` pattern). Never cast to silence a generated union — fix the type at its source.
* **No speculative surface.** A new prop, option, or optional parameter needs a production caller
  that exercises it; a seam kept only for tests gets a comment saying so at the declaration.
* Module-scope mutable `let` is either a pure memoization cache or lives behind a `createX()`
  factory so tests get fresh instances — never a shipped `*ForTests` reset export. A memoized
  promise resets itself on rejection (see `web/src/lib/idb.ts`) unless permanent failure is
  intended.
* **Svelte 5 runes only.** No legacy stores (`writable`, `readable`, `derived` from `svelte/store`).
* All npm scripts must run on macOS and Linux (ADR-0017; Windows dev support was dropped in
  ADR-0062): env vars are set inline (`VAR=value cmd`, no `cross-env`), and platform-specific tools
  (the Gradle wrapper, the file-manager opener) are invoked via Node helpers in `tools/` rather than
  inline shell.
* **pnpm installs; npm runs** (ADR-0119). `npm run <script>` is correct everywhere and stays the
  documented way to invoke the script graph (ADR-0019) — pre/post hooks and all. But **never run
  `npm install` or `npm ci` here**: both succeed, both produce a working flat `node_modules`, and
  both write a `package-lock.json` that resolves the tree independently of `pnpm-lock.yaml` and then
  drifts from it with nothing to announce the divergence. Use `pnpm install` (or
  `pnpm install --frozen-lockfile` to reproduce the committed tree exactly), and `pnpm add <pkg>` to
  add one. `package-lock.json` is gitignored and `tools/tests/package-manager.test.mjs` fails if any
  CI, hook, or bootstrap file starts installing with npm again. pnpm itself comes from
  `corepack enable pnpm` — re-run that after every `nvm install`, since the shim is written into the
  active Node's `bin/`.
* **The `dependencies`/`devDependencies` split is inverted** (ADR-0070): `dependencies` = what the
  Netlify web build needs (runtime imports + vite/SvelteKit/adapter/`marked`); `devDependencies` =
  local/CI-only tooling (Playwright, dprint, sharp, the Capacitor CLIs, …). Netlify installs with
  `--prod`, so a build-needed package filed under `devDependencies` breaks the deploy (CI stays
  green — it installs everything). When adding a dependency, ask "does the Netlify web build import
  or execute this?"
* **Formatting is split: Prettier owns code, dprint owns Markdown** (`*.md` is in `.prettierignore`;
  ADR-0057). The `format-edited-file.sh` PostToolUse hook auto-formats each file you edit through
  the right one, but if you write Markdown any other way (or aren't sure), run
  `npm run format:check` before you commit — CI's `dprint check` fails on unwrapped Markdown, and
  that's the most common reason a fresh PR is red. The cloud-only `session-start.sh` and
  `cloud-branch-preview.sh` SessionStart hooks run only when `CLAUDE_CODE_REMOTE=true`; see
  `docs/CLOUD/Claude.md` for details.
