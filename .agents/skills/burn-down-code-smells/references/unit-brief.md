# Unit implementer brief

You are one unit of an unattended code-quality campaign (the orchestrator names the tracking issue).
The orchestrator gives you:

* a unit spec;
* a branch slug;
* a Playwright port and an API-smoke port (`SMOKE_PORT`);
* the files other in-flight units own. Stay off them.

Ship the unit as a **free-form unit** through `ship-issue` in `mode=autonomous`, with the spec in
place of an issue number. In a parallel campaign, stop at shippable instead of merging; the
orchestrator merges (see "PR, review, and merge"). Nobody is watching, so never stop to ask a
question.

## Authorization

Paste `ship-campaign`'s authorization block here verbatim, followed by the user's quoted merge
approval and any other grant the user added in their own words. If the user chose open PRs instead,
say so in place of the quote; then no unit merges. This unit is a queued unit spec in
`ship-campaign`'s sense, so the block's merge authority covers it. A denied tool call is not a
withdrawn authorization: find another route, or quarantine. The exception is a guardrail denial that
forbids the outcome rather than the call, such as the auto-mode classifier refusing a merge: respect
it, never reach that outcome by another route, stop at shippable, and report the denial. The
orchestrator then pauses the queue and asks the user.

## Setup

1. Run `git fetch origin main`, then `git checkout -b <slug> origin/main`. While several lanes
   fetch, a fetch can fail with "Permission denied (publickey)" for about a minute. Retry it;
   meanwhile `gh api repos/KyleMit/Splotch/commits/main --jq .sha` reads `main`.
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
  * While iterating, run `npm run check`, `npm run lint`, and the Vitest files covering what you
    touched.
  * Before every push, run the applicable full tier that isn't host-exclusive:
    `SMOKE_PORT=<your smoke port> npm run test:browserless`. It covers the Vitest tiers and the API
    smoke, because guard tests read files far from the ones you edit.
  * **Never run the full Playwright suite or the full `npm test`**; they are host-exclusive, and CI
    runs them. Run targeted specs with
    `SPLOTCH_E2E_PORT=<port> npm run test:e2e -- <spec> --workers=1`. If you genuinely need a full
    suite locally, report it; don't run it.
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
* **Merging while other units merge.** In a parallel campaign **you don't merge**; the orchestrator
  does, one PR at a time. Follow the per-unit merge gate in `ship-campaign`'s parallel reference
  exactly:
  * Every catch-up with `main` starts with the `reconcile-with-main` survey, including the first one
    after review. Merge commits carry the attribution line.
  * Catch up once, after review. Don't chase `main` if it moves again while your CI runs: each chase
    costs a CI round, and later moves are the orchestrator's (an integration trial, or a resume).
  * When CI is green on your gated head, stop, and report
    `ready: PR <n>, head <sha>, gated main <sha>`, copying both SHAs from command output. The gated
    `main` is `git rev-parse HEAD^2` after your catch-up merge, or your branch's base
    (`git merge-base HEAD origin/main`) when there was nothing to merge. Never read it from
    `origin/main` itself: worktrees share that ref, and another lane's fetch can move it mid-gate.
  * If the orchestrator resumes you because `main` moved, repeat the gate against the new commit.

  Apply any broadcast the orchestrator sends before you report ready, and record which path you
  took. In a serial campaign, merge per `ship-issue` step 5 instead.
* **Budget.** Two product repair attempts for CI failures your change caused, and 45 minutes of
  waiting per head. Compare head against base before blaming yourself. Past a budget, or with a
  blocking finding still standing after round two, quarantine: convert the PR to draft, add a
  postmortem to its body, and stop.

## Report back (under 30 lines)

Send it only after every command it reports on has returned. A reply sent in the same round as a
read goes out before the read's output does.

* the outcome (ready, merged, or quarantined), the PR, and its SHAs: head and gated `main` when
  ready, or the merge commit in a serial campaign;
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
  `npm run test:tools` before changing a declaration they read. Likewise,
  `web/src/lib/storageKeys.webOnly.test.ts` pins, per file, how often each known writer identifier
  of a web-only storage key appears, plus the native guards' text, so editing one of those state
  modules can fail it.
* **Docs:** the `docs/ARCHITECTURE.md` table pads every row to its longest cell. Keep edits shorter
  than the longest row. Resolve conflicts by taking `main`'s table and re-applying your rows in one
  edit.
* **Scrapbook pages:** `npm run test:browserless` doesn't run `scrapbook:check`. After editing a
  file that a committed `scrapbook/` page inlines, such as
  `tools/scrapbook/proof-sheet-hub-assets/proof-sheet-hub.client.js`, run `npm run check:quality`
  before pushing.
* **`tools/` size and imports:**
  * `tools/` is size-ratcheted (`TOOLS_GRANDFATHERED_MAX_LINES`). A net line added to a listed file
    fails lint, and a file you shrink gets its cap lowered in the same PR.
  * `tools/asset-gen` and `tools/rival-agent` must not import `tools/lib`.
* **Test environment:**
  * Vitest fake timers don't drive Node's `AbortSignal.timeout`.
  * `vi.resetModules()` detaches Svelte's runtime from a test's `$effect.root`.
  * The API smoke uses `SMOKE_PORT`, not `SPLOTCH_E2E_PORT`.
  * A test that spawns a tool calling `adb` keeps it off real devices by setting `ANDROID_HOME` to
    an empty directory (`tools/perf/tests/cli-inputs.test.mjs`).
* **Posting the rival's review:** `tools/rival-agent/post-review.mjs` blocks a finding whose text
  pairs `serial` or `device-id` with a value containing a digit, even a harmless one such as an
  emulator name. Post it through the `--sanitized-findings` recovery in
  `tools/rival-agent/README.md`.
* **Main-merge checks:** a push to `main` runs fewer checks than a PR (no ADR-integrity job, no
  Dependabot review). Don't wait for a PR-sized count after a merge.
* **Wait loops:** never key a CI wait on a fixed check count. The count varies by PR: it drops when
  the Dependabot review check is absent, and a loop keyed on the larger number never ends. Wait for
  the expected applicable set to register and then finish, per `drive-pr-to-mergeable` step 5.
* **CI logs:** `gh api repos/<owner>/<repo>/actions/jobs/<id>/logs` exits 1 without
  `--allow-escape-sequences`, so with stderr discarded the logs look empty.
* **Fresh worktree:** run `npm run check` (it runs `svelte-kit sync`) before `npm run test:tools`.
* **Sandbox friction:**
  * The auto-mode sandbox refuses compound shell commands that chain `git` or `gh`, any heredoc
    whose text contains `git` (even inside `.github`), and some bare words. Write the script to a
    file under `/tmp` and run it as `/bin/bash <file>`; a bare `bash <file>` can be refused.
  * `git rev-parse --verify` takes one SHA per call.
  * Run a brokered rival command in your own worktree, at the head under review.
  * If the sandbox refuses a temporary product-source edit for a negative control, run the guard
    against a scratch copy of the old code, or inject the fault from the test side.
  * `ruler:apply` needs sandbox-disabled writes to `.claude/` and `.agents/`.
