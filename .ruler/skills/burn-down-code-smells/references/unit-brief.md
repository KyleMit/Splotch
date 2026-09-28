# Unit implementer brief

You are one unit of an unattended code-quality campaign (the orchestrator names the tracking issue).
The orchestrator gives you:

* a unit spec;
* a branch slug;
* a Playwright port;
* the files other in-flight units own. Stay off them.

Ship the unit as a **free-form unit** through `ship-issue` in `mode=autonomous`, with the spec in
place of an issue number. Nobody is watching, so never stop to ask a question.

## Authorization

Paste `ship-campaign`'s authorization block here verbatim, along with any grant the user added in
their own words. A denied tool call is not a withdrawn authorization: find another route, or
quarantine.

## Setup

1. Run `git fetch origin main`, then `git checkout -b <slug> origin/main`.
2. If `node_modules` is missing, run `pnpm install --frozen-lockfile --prefer-offline`. Never
   `npm install`.
3. Read the root `CLAUDE.md` conventions and `docs/CODING-STANDARDS.md`. Consult the area skill
   (`architecture`, `design`, `api`, `testing`, `mobile`) rather than guessing.

## Guardrails

* **The bar:** remove a real cost, and never harm performance, readability, or maintainability, for
  humans or agents. If a change adds indirection, an abstraction, or a file without removing a
  concrete cost, don't make it.
* **Verify first.** Re-check every finding in the spec against current code, and check
  `docs/audit-deferred/decisions/`. If a finding is wrong or already fixed, say so and ship nothing
  for it.
* **Startup and hot path.**
  * If you touch any module reachable at startup, run `npm run build` and `npm run build:cap`. Both
    pin the startup modulepreload count exactly. Report both counts and the byte deltas.
  * A runtime import from a startup module into a module that lazy code also imports can create a
    new startup chunk.
  * Leave the per-pointer drawing path unchanged unless you can measure it.
  * Respect bundle-boundary copies.
* **Tests.**
  * Every bug fix and every guard ships with a test **and a negative control noted in the PR body**:
    break the behaviour, watch the test fail, then restore it.
  * Run `npm run check`, `npm run lint`, the Vitest files covering what you touched, and
    `npm run test:tools` when you touch `tools/` or a type that a tools drift guard reads.
  * **Never run the full Playwright suite or the full `npm test`**; they are host-exclusive. Run
    targeted specs with `SPLOTCH_E2E_PORT=<port> npm run test:e2e -- <spec> --workers=1`.
  * Never kill a listener you didn't start.
* **User-visible changes.** Copy and behaviour a parent or child sees are the user's decision unless
  an ADR already made it. Park them in the PR body.
* **Ambiguity** goes through `walk-through-decision mode=autonomous`. Record every decision in the
  PR body.

## PR, review, and merge

* The PR body gives the spec (the "why"), what changed with `file:line` pointers, the alternatives
  weighed, the commands run and their results, and `Refs #<tracking issue>` (never a closing
  keyword). Follow the attribution rules in the root instructions. Copy every SHA from command
  output, and verify it with `git rev-parse --verify`.
* Review follows `drive-pr-to-mergeable`: at most two rival rounds. A clean round one skips round
  two.
* **Merging while other units merge.** Follow the per-unit merge gate in `ship-campaign`'s parallel
  reference:
  * After review, merge `origin/main` into your branch once (with the attribution line in the merge
    message) and wait for CI.
  * If `main` moves again, run the `reconcile-with-main` survey before merging. Take the trial-merge
    path when the relation is `unrelated` or `adjacent`, and run the full skill when it's `coupled`.

  Apply any broadcast the orchestrator sends before you merge, and record which path you took.
* Merge with `gh pr merge <n> --merge --delete-branch`. Treat a nonzero exit as an unknown outcome
  and read the PR state first. Afterwards, detach at `origin/main` and delete the local branch with
  `git branch -d`.
* **Budget.** Two product repair attempts for CI failures your change caused, and 45 minutes of
  waiting per head. Compare head against base before blaming yourself. Past a budget, or with a
  blocking finding still standing after round two, quarantine: convert the PR to draft, add a
  postmortem to its body, and stop.

## Report back (under 30 lines)

* the outcome, PR, and merge SHA;
* the review rounds: what the rival found, and what you fixed or rejected;
* CI;
* every autonomous decision;
* the startup numbers, if relevant;
* perf campaigns needing `--accept-instrument-change`;
* leftovers, drafted as a PR comment and not filed;
* anything a later unit should know.

## Traps that each cost a campaign unit a CI round

* **Doubles and types:**
  * Several tests replace the settings store with a plain-object `vi.mock` double. Grep for them
    before changing a store's surface.
  * `lint:dead` (knip) fails on a newly exported type that nothing imports by name.
* **Copy pins:**
  * Copy tests must compare rendered text exactly. Prettier re-wrapping a template line changes DOM
    text; a short local alias for a long constant keeps the line intact.
  * `__IS_CAPACITOR__` compiles to true in unit tests, so a rendered-output guard needs a
    `*.webSsr.test.ts` twin to cover the web build.
* **Source-text guards:** tools drift guards read `web/src` text (type unions, constants, CSS). Run
  `npm run test:tools` before changing a declaration they read.
* **Docs:** the `docs/ARCHITECTURE.md` table pads every row to its longest cell. Keep edits shorter
  than the longest row. Resolve conflicts by taking `main`'s table and re-applying your rows in one
  edit.
* **`tools/` size and imports:**
  * `tools/` is size-ratcheted (`TOOLS_GRANDFATHERED_MAX_LINES`). A net line added to a listed file
    fails lint, and a file you shrink gets its cap lowered in the same PR.
  * `tools/asset-gen` and `tools/rival-agent` must not import `tools/lib`.
* **Test environment:**
  * Vitest fake timers don't drive Node's `AbortSignal.timeout`.
  * `vi.resetModules()` detaches Svelte's runtime from a test's `$effect.root`.
  * The API smoke uses `SMOKE_PORT`, not `SPLOTCH_E2E_PORT`.
* **Main-merge checks:** a push to `main` runs fewer checks than a PR (no ADR-integrity job, no
  Dependabot review). Don't wait for a PR-sized count after a merge.
* **Sandbox friction:** the auto-mode sandbox refuses compound shell commands that chain `git` or
  `gh`, heredoc scripts, and some bare words. Write the script to a file under `/tmp` and run it as
  a separate command. `ruler:apply` needs sandbox-disabled writes to `.claude/` and `.agents/`.
