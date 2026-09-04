# `--experimental-strip-types --disable-warning=ExperimentalWarning` repeated and stale

**Original finding:** [P2][duplication] — `package.json` scripts (10 sites at pin SHA f934d43;
**16** at HEAD, plus 5 more in `tools/asset-gen/package.json`) — deferred because the implementer
failed to deliver a final fix round against an ever-growing sweep list. **Verdict:** FIX

## Context

Every TypeScript-importing script invocation carries the identical 60-character flag pair
`--experimental-strip-types --disable-warning=ExperimentalWarning`. The finding claimed the pair is
(1) copy-pasted duplication and (2) stale, because Node enables type stripping by default from 22.18
/ 23.6 onward, making both flags no-ops on a modern floor (`--disable-warning` exists only to
silence the warning the first flag used to trigger).

The burndown attempt did two solid rounds (raise `engines.node` to `>=22.18`, strip the flags from
all root scripts, then from the asset-gen aliases, sync the lockfile, update the `scripts/`
guidance) but was rejected with five unresolved objections — all "you missed a site" sweep items:

1. `tools/asset-gen/package.json:8-14` aliases still carry the flags. *(Actually addressed by the
   draft's second commit — the patch on file removes them.)*
2. `package-lock.json:63` still records `>=22.13`. *(Also addressed in the draft.)*
3. Guidance still claims the flags are required: `scripts/.ruler/AGENTS.md:19-20`,
   `scripts/api-smoke.mjs:15`, `scripts/strip-native-assets.mjs:10-11`. *(Also addressed in the
   draft.)*
4. Flags remain in `tools/asset-gen/tests/cli.test.mjs:209,244`, `crayon-brush-samples`, and
   `legacy`. **(Genuinely missing from the draft.)**
5. `.ruler/skills/architecture/SKILL.md`, `.ruler/skills/design/SKILL.md`, and ADRs 0003/0029/0047
   still state the flags are required. **(Genuinely missing from the draft.)**

## Current state (verified at HEAD 63a7aa49)

The problem is real and has grown since the pin: `grep -c experimental-strip-types` finds **16**
script lines in the root `package.json` (20, 25, 62, 68–70, 73–79, 86, 87, 92) and **5** in
`tools/asset-gen/package.json` (8–11, 14). `engines.node` is still `>=22.13` — a floor on which the
flags are NOT dead (default stripping starts at 22.18), which is exactly why the fix must bump the
floor, not just delete flags.

Empirical checks run in this triage session (Node v22.22.2):

* `node scripts/gen-tokens.mjs --check` (imports `web/src/lib/design/tokens.ts`) — exits 0
  flag-free, no warning on stderr.
* `GEMINI_API_KEY=test node tools/asset-gen/bin/gen-coloring-chalk.mjs nature/ant-tall --dry-run
  --invented-max invalid` — flag-free, produces byte-exact the canonical diagnostic that
  `tools/asset-gen/tests/cli.test.mjs` asserts, exit 1 as expected.
* The rolled-back draft patch
  (`docs/audit-deferred/p2-duplication-experimental-strip-types-disable-warning-experimentalwarn.patch`)
  **still applies cleanly at HEAD** (`git apply --check` passes).

> **Addendum (2026-07-28, at 30f0c7ef3068):** the patch **no longer applies** — `git apply --check`
> now fails on `package.json` and `scripts/api-smoke.mjs`, which both moved on after 63a7aa49. Treat
> it as a reference for *which* sites to touch, not as something to apply. Everything else in this
> section re-verified true at 30f0c7ef3068: `engines.node` is still `>=22.13`, with 16 flagged
> script lines in the root `package.json` and 5 in `tools/asset-gen/package.json`.

Node-floor bump safety, checked at every site the reviewer never mentioned:

* **CI:** every workflow uses the composite `.github/actions/setup-node`, which pins `node-version:
  24`. Node 24 strips types by default. (CI already doesn't exercise the 22.x floor — pre-existing,
  unchanged by this fix.)
* **Netlify:** the root `netlify.toml` sets no `NODE_VERSION`, and the production build path
  (`prebuild` = `svelte-kit sync` + `gen:icons` + `gen:releases`, then `vite build` +
  `stage-netlify.mjs`) executes **zero** `.ts`-importing scripts — Netlify never needs type
  stripping at all. Additionally, npm `engines` is advisory here (no `engine-strict` in any
  `.npmrc`), so the bump cannot fail a deploy; at worst it warns.
* **No `.nvmrc`/`.node-version` exists** to keep in sync (a separate P4 finding in `docs/AUDIT.md`
  proposes adding one — if that lands, it should pin ≥ 22.18).
* Node 22.18.0 shipped 2025-08; Node 22 is the active LTS line. Requiring `>=22.18` a year later is
  a modest ask, and anyone on 22.13–22.17 gets a clear "unknown file extension .ts"-style failure
  plus the engines warning pointing at the floor.

## Options considered

**Option A — bump the floor to `>=22.18` and delete the flag pair everywhere (chosen).** Pros: 21
script lines shrink, the duplication count goes to zero rather than one, docs get simpler ("scripts
just run"), and it removes the friction ADR-0029 recorded (bun rejects these Node-only flags). Cons:
raises the local-dev floor by five 22.x patch releases; npm only warns, so an out-of-date dev learns
at runtime. Empirically verified to work (above).

**Option B — keep the floor, factor the pair into a shared runner (`scripts/run-ts.mjs` re-exec, or
a `$npm_package_config_*` interpolation).** Pros: no floor change. Cons: adds a real indirection
layer (re-exec costs a process, obscures `node` argv in every alias), keeps stale "experimental"
flags alive indefinitely, still needs a second copy or a `../..`-relative path for the
`tools/asset-gen/package.json` aliases (different cwd), and none of the doc/skill/ADR text gets any
simpler. Strictly worse unless some supported environment is stuck below 22.18 — and none was found:
CI is 24, the cloud session is 22.22, Netlify doesn't run these scripts.

Ranking: **A over B**, decisively. B is the fallback only if the owner vetoes the floor bump.

## Decision / lean

**FIX — finish the sweep that the draft already 80% completed.** Start from the clean-applying draft
patch, then add the genuinely missing sites. The complete checklist at HEAD (from `git grep -n
experimental-strip-types`), so no further round can discover a new site:

**Covered by the existing draft patch (apply it, or redo equivalently):**

1. `package.json` — `engines.node` → `">=22.18"`; drop the flag pair from all 16 script lines (20,
   25, 62, 68, 69, 70, 73, 74, 75, 76, 77, 78, 79, 86, 87, 92).
2. `package-lock.json:63` — sync the root package's `engines.node` (run `npm install
   --package-lock-only` rather than hand-editing).
3. `tools/asset-gen/package.json:8,9,10,11,14` — drop the pair from the five aliases.
4. `scripts/.ruler/AGENTS.md:19-20` — reword to "TypeScript-flavored scripts run directly via
   `node`; the `>=22.18` engine floor strips types by default", then `npm run ruler:apply` to
   regenerate `scripts/AGENTS.md` + `scripts/CLAUDE.md` (the draft hand-edited the generated files
   consistently; re-running ruler and `npm run ruler:check` confirms zero drift).
5. Comment-only updates: `scripts/api-smoke.mjs:15`, `scripts/gen-large-image.mjs:12`,
   `scripts/model-eval-fixtures.mjs:7`, `scripts/strip-native-assets.mjs:10-11`,
   `tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs:6`,
   `tools/asset-gen/bin/gen-style-covers.mjs:5`, `web/src/lib/ai/prompt.ts:3`,
   `web/src/lib/server/ai/geminiSafety.ts:8`, `web/tsconfig.json:10`.
6. Runbook docs: `tools/asset-gen/docs/coloring-book-proof-sheet.md:23`,
   `tools/asset-gen/docs/pipeline.md:226`.

**Missing from the draft — the actual remaining work:**

7. `tools/asset-gen/tests/cli.test.mjs:209,244` — remove `'--experimental-strip-types'` from the two
   `spawnSync(process.execPath, …)` argv arrays so the tests exercise the same flag-free invocation
   path the aliases now use. Keep `NODE_NO_WARNINGS: '1'` in the env — the tests assert byte-exact
   stderr, and that guard protects them from any unrelated future warning.
8. `tools/asset-gen/crayon-brush-samples/README.md:30` and
   `tools/asset-gen/crayon-brush-samples/gen.mjs:5` — drop the pair from the documented invocation
   (the tool stays runnable; verified class of invocation works flag-free).
9. `tools/asset-gen/legacy/README.md:15`, `tools/asset-gen/legacy/night-fills.md:62,177`,
   `tools/asset-gen/legacy/retouch-line-art.mjs:25` — same one-line updates; `legacy/` is retired
   but explicitly "kept runnable", so its documented commands should not carry flags that imply a
   requirement that no longer exists. (Cheap: five lines total.)
10. `.ruler/skills/architecture/SKILL.md:107` — "…because the asset scripts import it via
    `--experimental-strip-types`" → "…because the asset scripts import it directly (Node strips
    types by default on the `>=22.18` floor)". `.ruler/skills/design/SKILL.md:18` — the
    parenthetical explaining why `gen:tokens` isn't in `prebuild` should stop naming the flag but
    **keep the design decision**: the Netlify build serves the committed `tokens.css` and
    deliberately doesn't regenerate it (platform-default Node isn't governed by the repo floor).
    Then `npm run ruler:apply` regenerates the `.claude/` and `.agents/` mirrors — the objection's
    demand to update four generated files is satisfied by two source edits.
11. ADR touch-ups (amend, don't rewrite history): `docs/adrs/0003-typescript-migration.md:35` — the
    con "adds a compile step … workaround is `node --experimental-strip-types`" gets a short
    trailing note that Node ≥ 22.18 (the current engines floor) strips types by default, no flag
    needed. `docs/adrs/0029-npm-as-package-manager.md:49,63` — the bun tradeoff bullet and the
    closing pointer both reference the flags; note they were removed when the floor reached 22.18
    (the bun friction is gone). `docs/adrs/0047-provider-agnostic-ai-adapter.md:42` — "import it
    directly via `--experimental-strip-types`" → "import it directly (default type stripping)".
12. Optional freebie while there: `docs/CONTRIBUTING.md:14` — "**Node 22**" → "**Node 22.18+**" so
    the human onboarding doc states the real floor.

**Explicitly out of scope (argued, not forgotten):**

* `tools/asset-gen/ideas-exploration/**` (idea-1/idea-9 code, the idea-21/22/23/25 `.patch` files,
  `ideas-review.html`, `report.md`) — a frozen 2026-07 empirical record; its own CLAUDE.md says
  nothing in it is live pipeline code, and editing committed evidence patches would corrupt the
  record they exist to preserve.
* `docs/AUDIT-DEFERRED.md`, `docs/AUDIT-LOG.md`, `docs/audit-deferred/*.patch` — audit history.
* `docs/AUDIT.md:317` — a separate pending finding (missing `.nvmrc`); interaction noted above.
* `scripts/lint-token-styles.mjs:75` — references Node ≥ 20.12 for recursive `readdir`, still
  factually true and unrelated to type stripping.

**Verification for the implementing session:**

* `git grep -l 'experimental-strip-types' -- ':!docs/audit-deferred' ':!docs/AUDIT*'
  ':!tools/asset-gen/ideas-exploration' ':!docs/adrs'` → empty (ADRs keep the term only in
  historical-note context).
* `npm run ruler:check` → no drift. `npm run gen:tokens:check`, `npm run check:assets`, `npm test`
  (includes the asset-pipeline `cli.test.mjs`) → green.

## Why the previous attempt failed, and how this path avoids it

The attempt didn't fail on substance — the draft is correct, applies cleanly at HEAD, and already
resolves objections 1–3 (asset-gen aliases, lockfile, scripts guidance). It failed on process: each
review round ran a fresh `git grep` and surfaced another stratum of mentions (tests, sample/legacy
docs, skills, ADRs), and the implementer ran out of rounds before the list converged. This doc
closes that loop by shipping the exhaustive grep-derived checklist *with an argued boundary*: every
runnable or normative site is enumerated above (items 1–12), and every remaining grep hit is
declared historical and out of scope. Objection 4 is items 7–9; objection 5 is items 10–11, with the
ruler-source rule (two edits, four regenerated mirrors) keeping it cheap. There is no third stratum
left for a reviewer to find.
