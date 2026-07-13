# ADR-0019: npm Script Naming Conventions + scripts-info Self-Documentation

**Status:** Active **Date:** 2026-06

## Context

`package.json` had grown to ~48 scripts with organically inconsistent naming: generators were
scattered across three patterns (`icons:types`, `releases:gen`, `gen:large-image`), three Playwright
variants (`test:ui`, `test:headed`, `test:debug`) sat outside the `test:e2e` namespace they belong
to, and `test:e2e:update` didn't touch tests at all (it refreshes the browserslist database). Worse,
the only way to learn what a script did was to hunt through `docs/CONTRIBUTING.md` and the
`testing`/`mobile` skills — there was no single in-repo catalog, and nothing a contributor (or
Claude) could run to see it.

Alternatives considered for the catalog:

* **Keep descriptions only in the docs.** Already the status quo; the docs cover the common scripts
  well but a third of the scripts appeared nowhere, and prose docs can't be listed from the
  terminal.
* **`npm run` bare output.** Lists every script with its raw command — no descriptions, and the
  command text often doesn't reveal intent (`node scripts/android-verify.mjs`).
* **Richer tools (`better-scripts`, `ntl`).** Add config formats or interactive pickers; overkill
  for "print a table of names and descriptions."

[`scripts-info`](https://www.npmjs.com/package/scripts-info) won because it is zero-dependency,
reads a plain `scripts-info` JSON block colocated with the scripts it describes, and degrades
gracefully (an undescribed script falls back to printing its command).

## Decision

Scripts in `package.json` follow `namespace:variant` naming and are self-documented via a
`scripts-info` block; `npm run info` prints the catalog.

Naming rules:

* **Namespace by domain, variant narrows it:** `dev:*`, `build:*`, `check:*`, `test:*`, `gen:*`,
  `cap:*`, `android:*`, `ios:*`, `adb:*`. The bare namespace name is the most common action (`dev`,
  `build`, `test`, `check`).
* **Generated artifacts live under `gen:*`** (`gen:icons`, `gen:releases`, `gen:large-image`) — the
  renames `icons:types` → `gen:icons` and `releases:gen` → `gen:releases` enforce this.
* **Tool variants nest under the tool's script:** the Playwright modes are `test:e2e:ui` /
  `test:e2e:headed` / `test:e2e:debug` (renamed from `test:ui` / `test:headed` / `test:debug`).
* **Name by what it does, not where it sits:** `test:e2e:update` became `update:browserslist`
  because it updates `caniuse-lite`, not the tests.
* **npm lifecycle hooks** (`pre*`/`post*`) keep npm's standard names and are grouped next to the
  script they wrap.
* The `scripts` block is ordered by workflow: `info`, lifecycle/install, dev, build, check, test,
  gen, cap, android, ios, adb, maintenance, release.

Documentation rules:

* **Every** script gets a one-line entry in the `scripts-info` block, including the `pre*`/`post*`
  lifecycle hooks — a hook's entry says what it does and which script it gates (e.g. "check:assets
  gate before release"), which the raw command alone doesn't convey.
* Description wording matches the prose docs (`CLAUDE.md` command table, `docs/CONTRIBUTING.md`, the
  `testing`/`mobile` skills) so the catalog and the guides never disagree about what a script is
  for.
* Scripts that wrap platform-specific tooling (`android:apk`/`run`/`bundle`/ `clean`/`open`) go
  through a Node helper in `scripts/` (e.g. `gradle.mjs`, `open-path.mjs`) so they run on every OS
  (ADR-0017); their descriptions name the artifact, not a platform caveat.
* **Adding or renaming a script means updating `scripts-info` in the same change** — a script
  showing its raw command in `npm run info` output is the signal that a description is missing.

## Consequences

* \+ `npm run info` is a single discoverable catalog of all scripts, usable by contributors and by
  Claude without reading four documents.
* \+ Consistent namespaces make scripts guessable (`test:e2e:` + tab) and group related commands
  together in listings.
* − The renames break muscle memory and any uncommitted notes; all in-repo references (docs, skills,
  rules, code comments) were updated in the same change, but downstream habits like
  `npm run test:headed` now fail.
* − The `scripts-info` block is a second list that can drift from `scripts`; a script showing its
  raw command in `npm run info` output is the visible signal of a missing entry, but nothing
  prevents the drift.
* − Descriptions intentionally duplicate doc wording, so rewording a script's purpose means touching
  both places.
