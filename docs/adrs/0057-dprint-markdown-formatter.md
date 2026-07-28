# ADR-0057: dprint Formats Markdown (Prettier Can't Match House Style)

**Status:** Active **Date:** 2026-07

## Context

ADR-0031 adopted Prettier for source but left Markdown in `.prettierignore`, marked as removable
"when docs formatting is brought into scope." When that time came, a hard constraint surfaced:
Prettier hardcodes dash bullets (`-`), underscore italics (`_em_`), and single blank lines, with no
config options and no maintained plugin to change them. House style — captured in the maintainer's
markdownlint settings (`MD004`/`MD049`: asterisk) and dominant in the docs themselves (~380 asterisk
italics vs 5 underscore) — is asterisk bullets and asterisk emphasis, plus a hard wrap at the repo's
existing `printWidth` of 100.

Alternatives evaluated against all ~156 tracked `.md` files:

* **Prettier**: rejected — cannot produce asterisk bullets or asterisk emphasis, period.
* **markdownlint-cli2 --fix**: honors the style rules exactly, but it is a linter, not a formatter —
  no wrap-at-width (MD013 can only warn, never fix), no table alignment, and a trial run left ~184
  violations that needed hand-fixing before it could gate CI.
* **remark-cli**: marker styles are configurable, but its stringifier cannot hard-wrap prose and it
  backslash-escapes innocent characters, churning the source.
* **mdformat**: supports `--wrap 100` but hardcodes dash bullets (Prettier's dealbreaker again) and
  drags Python into an all-Node toolchain.
* **Prettier + post-processing**: swapping markers safely outside code blocks requires a Markdown
  parser; that is writing a formatter. Rejected as fragile.

**dprint** (`dprint-plugin-markdown`) was the only tool that met every requirement:
`unorderedListKind`/`emphasisKind`/`strongKind: asterisks`, `textWrap: always` at `lineWidth: 100`,
tables column-aligned (never wrapped), `---` horizontal rules, fenced code preserved, and a
`dprint check` mode for CI.

## Decision

Markdown formatting is owned by **dprint**; Prettier keeps everything else. The split is permanent
and encoded in both tools' configs:

* `dprint.json` (repo root): markdown options above; `includes` is `**/*.md` only, with `excludes`
  mirroring the gitignored trees so dprint's scope is exactly the tracked Markdown files. The
  `typescript`/`json` wasm plugins are loaded solely to format fenced `` ```js/ts/json `` blocks
  inside docs (`quoteStyle: preferSingle` to match Prettier's style for real source).
* Plugins are referenced as local `node_modules/@dprint/*/plugin.wasm` paths, version-pinned through
  `package.json` like every other dev tool — no plugin-URL fetch at runtime, works offline in CI.
* `.prettierignore` keeps `*.md`, now marked as dprint-owned rather than "for now."
* Scripts (ADR-0019): `format:md` / `format:md:check` run dprint; the existing `format` /
  `format:check` chain both tools, so the CI `quality` job needed no workflow change.
* Editor alignment: `.vscode/settings.json` sets `dprint.dprint` as the Markdown formatter, and a
  repo `.markdownlint.json` mirrors the maintainer's lint rules so markdownlint agrees with dprint
  output (`MD013` explicitly off — dprint owns line length).
* The one-wave reformat of all tracked Markdown is isolated in a dedicated `style:` commit, listed
  in `.git-blame-ignore-revs` (same blame-hygiene pattern as ADR-0031's source reformat).

Known accepted behaviors (render-neutral on GitHub, where soft line breaks display as spaces):
multiple blank lines collapse to one, and adjacent short lines within a paragraph merge when
rewrapped (e.g. ADR `**Status:**` / `**Date:**` lines join into one source line).

## Consequences

* \+ Docs are now mechanically formatted and CI-gated in the exact house style — asterisk
  bullets/emphasis, wrap at 100, aligned tables — which Prettier could never produce.
* \+ Doc code samples are formatted to match real source style, so snippets can't drift.
* \+ `npm run format` / `format:check` still mean "the whole repo"; contributors and CI didn't have
  to learn a new entry point.
* − Two formatters, two configs, two editor extensions. The partition is clean (Prettier ignores
  `*.md`; dprint includes only `*.md`), but both scopes must be kept complementary by hand.
* − dprint's ecosystem is smaller than Prettier's; its embedded-code style is near-Prettier but not
  byte-identical (acceptable for doc snippets).
* − `dprint.json`'s `excludes` is a third copy of the ignore list that `eslint.config.js` and
  `.prettierignore` already duplicate (ADR-0031 accepted that trade for two).
* − Hard-wrapped prose means a mid-paragraph edit can reflow the rest of the paragraph, adding diff
  noise on future doc changes — accepted in exchange for deterministic, enforced wrapping.
