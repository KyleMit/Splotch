# Handoff — rename artifacts → scrapbook

> 2026-07-22 · branch `claude/rename-artifacts-directory-072h83` · Rename the committed run-outputs
> tree `/artifacts` (ADR-0059, GitHub Pages) to `/scrapbook` to stop colliding with Claude Code's
> Artifact tool.

## Objective & non-goals

Rename the **committed run-outputs tree** and everything that names it: the `/artifacts` directory
itself, the `artifacts:publish` / `artifacts:index` npm scripts, the Pages workflow, the shared page
chrome ("Splotch Artifacts" masthead / "Artifacts" breadcrumbs → "Scrapbook"), and the docs/ruler
sources. Chosen name: **`scrapbook`** (picked over keepers/gallery/exhibits/fridge/showcase in the
session discussion — on-brand for a toddler drawing app, zero collision with any tooling term).

**Non-goals — the repo uses "artifact" in three senses; rename only sense 1:**

1. The committed run-outputs tree (ADR-0059) — **rename this**.
2. The Claude Code **Artifact tool** (`--artifact=` flags and "Artifact fragment" output in
   `tools/asset-gen/crayon-brush-samples/build-sheet.mjs:129` and `build-compare-sheet.mjs:10`,
   Artifact-tool mentions in `.ruler/skills/session-audit/SKILL.md`,
   `tools/asset-gen/.ruler/AGENTS.md:112`) — **leave as-is**; that tool is the reason for this
   rename.
3. **Release/build artifacts** (.aab/.ipa in `.ruler/skills/build/SKILL.md`,
   `.ruler/skills/release/SKILL.md:61`, `scripts/release.mjs`, `releases/README.md`), perf-capture
   "artifacts" (`scripts/perf/*.mjs`, `.gitignore:9`), the dev-only `/dev/ai-timer` artifacts route
   (`web/src/routes/dev/ai-timer/artifacts/[name]/+server.ts`, `web/tests/ai-timer.spec.ts`,
   `web/tests/engine.spec.ts`), and the `actions/upload-pages-artifact` action name in `pages.yml` —
   **all unrelated, leave alone**. A blind find/replace will corrupt these.

Live GitHub Pages URLs (`kylemit.github.io/Splotch/<type>/<name>`) do **not** change — the workflow
deploys the folder's *contents* to the site root, so the folder name never appears in URLs.

## State

Branch `claude/rename-artifacts-directory-072h83`, forked from main. No PR. **No rename work has
started** — this branch contains only this handoff. The full touchpoint map below was verified by
grep on 2026-07-22.

### Rename surface (verified by grep, excludes the non-goal senses)

* **The tree**: `git mv artifacts scrapbook` (contents: `README.md`, `index.html`,
  `coloring-book-proof-sheets/`, `crayon-brush-samples/`, `icons/`, `model-eval/`).
* **`package.json`**: scripts `artifacts:publish` / `artifacts:index` (lines 95–96) →
  `scrapbook:publish` / `scrapbook:index`, plus their `scripts-info` entries (lines 213–214) and the
  `gen:icons-sheet` description (line 210) which names `artifacts:publish`. ADR-0019 naming rules
  apply.
* **`scripts/publish-artifact.mjs`** → suggest `scripts/publish-scrapbook.mjs`: `ARTIFACTS_DIR`
  constant (line 21), usage text, log strings, path-escape error (line 55).
* **`scripts/lib/artifacts-index.mjs`** → `scrapbook-index.mjs`: `buildArtifactsIndex` (line 154),
  empty-state copy naming `artifacts:publish` (line 182), masthead title `'Artifacts'` (line 196),
  `<title>Splotch artifacts</title>` (line 214).
* **`scripts/lib/artifact-chrome.mjs`** → `scrapbook-chrome.mjs`: brand-sub `Artifacts` (line 245),
  footer text naming `artifacts/README.md` + "All artifacts" (line 262). **Importers to update**:
  `publish-artifact.mjs:14`, `artifacts-index.mjs:15`, `gen-icons-sheet.mjs:18`,
  `model-eval-report.mjs:13`, and the cross-boundary relative imports in
  `tools/asset-gen/crayon-brush-samples/build-sheet.mjs:13` and `build-compare-sheet.mjs:16`.
* **`scripts/gen-icons-sheet.mjs`**: `.artifacts-scratch` default out-dir (line 29), breadcrumb
  `'Artifacts'` (line 147).
* **`scripts/lib/model-eval-report.mjs`**: breadcrumb (line 240), promote-flow comment (line 349).
* **`tools/asset-gen/crayon-brush-samples/`**: hardcoded `../../../artifacts/crayon-brush-samples`
  out-dirs in `build-sheet.mjs:17`, `build-compare-sheet.mjs:19`, `gen.mjs:18`; breadcrumbs in
  `build-sheet.mjs:114`, `build-compare-sheet.mjs:137`; README mentions.
* **`.github/workflows/pages.yml`**: `paths: ['artifacts/**']` (line 15), `path: artifacts` (line
  46), workflow name (line 10), header comments.
* **Lint/format config**: `.prettierignore:8` (`artifacts/`), `eslint.config.js:20`
  (`'artifacts/'`), `.gitignore:195` + `210–211` (`.artifacts-scratch/` → `.scrapbook-scratch/`,
  matching the `gen-icons-sheet.mjs` default).
* **`netlify.toml:18`**: comment naming `artifacts/` in the build-ignore rationale.
* **Ruler sources (edit sources, then `npm run ruler:apply`)**: `.ruler/knowledge-map.md:58–61` (the
  `/artifacts` paragraph in the root CLAUDE/AGENTS files), `tools/asset-gen/.ruler/AGENTS.md`
  (mentions of the committed tree — but its line 112/114 Artifact-tool mentions stay). Never edit
  generated `CLAUDE.md`/`AGENTS.md`/`.claude/skills/`/`.agents/skills/` directly.
* **Docs**: `scrapbook/README.md` (currently `artifacts/README.md` — self-references throughout),
  `web/tests/model-eval/README.md` (points at `artifacts/model-eval`), `docs/adrs/README.md` (index
  line for ADR-0059).
* **Committed HTML with a baked-in "Artifacts" crumb/label**: top-level `index.html` (regenerate via
  the renamed index script), `icons/index.html` (regenerate:
  `npm run gen:icons-sheet -- --out scrapbook/icons/index.html`), the **hand-authored**
  `coloring-book-proof-sheets/index.html` hub (edit its masthead/breadcrumb by hand — publish never
  regenerates it, per `artifacts/README.md:34–41`), and `crayon-brush-samples/*.html` +
  `model-eval/report/index.html` (source renders are gitignored/absent, so `sed` the visible
  "Artifacts" label in the committed HTML rather than regenerating).

## Decisions made (and why)

* **Name = `scrapbook`**, chosen by the user from ~15 candidates across two rounds. Rationale:
  on-brand (toddler keepsakes, dated snapshots fit the metaphor), self-explanatory enough, and no
  collision with Claude Artifacts, build artifacts, or CI vocabulary.
* **Rename rather than qualify** ("run artifacts") — the user is already paying a disambiguation tax
  in every conversation.
* **ADR handling**: don't rewrite ADR-0059's history. Add a short amendment/status note to ADR-0059
  recording the rename (and consider `/create-adr` for a tiny superseding note if the amendment
  feels too big). Historical mentions in ADR-0018/0019/0070 stay untouched.

## Unverified assumptions

* GitHub Pages URLs survive the rename because `pages.yml` uploads the folder contents as the site
  root — read `pages.yml` in full to confirm no other path reference exists before relying on this.
* `sed`-ing the committed crayon-brush-samples / model-eval HTML is safe (i.e., their generator
  inputs really are absent in a fresh clone) — verify before choosing sed over regeneration.
* The grep-derived touchpoint list is complete. Re-run
  `grep -rn -i artifact --exclude-dir={node_modules,android,ios,.git}` after the mechanical rename
  and re-classify every remaining hit against the three senses above.
* Nothing under `.claude/rules/` or `docs/CLOUD/` references the tree (grep found no hits, but those
  files weren't read).

## Done & verified

* Nothing implemented or run yet — no checks to trust. The only verified work is the touchpoint map
  above (grep + reading the key files on 2026-07-22).

## Risks & next 3 steps

Risks: blind find/replace corrupting the other two "artifact" senses (see Non-goals); forgetting
`npm run ruler:apply` (CI drift gate fails); editing generated `CLAUDE.md`/skills instead of
`.ruler/` sources; Markdown edits failing CI dprint (`npm run format:check`).

1. `git mv artifacts scrapbook`, then do the mechanical renames in `scripts/`, `package.json`,
   `pages.yml`, lint/format configs, and `tools/asset-gen/crayon-brush-samples/` per the surface
   list; regenerate `scrapbook/index.html` and `scrapbook/icons/index.html`; hand-edit the
   coloring-book hub and sed the baked crumbs.
2. Update `.ruler/` sources + `scrapbook/README.md` + ADR-0059 amendment + `docs/adrs/README.md` +
   `web/tests/model-eval/README.md`, then `npm run ruler:apply`.
3. Verify: re-run the classification grep, `npm run scrapbook:index` (round-trips the renamed
   scripts), `npm run gen:icons-sheet` smoke, `npm run ruler:check`, `npm run format:check`,
   `npm run check`, `npm test`; commit and push `claude/rename-artifacts-directory-072h83`. Delete
   this handoff when consumed.

## Reread first

* `artifacts/README.md` — the tree's own conventions (publish flow, bloat rules, the hand-authored
  hub carve-out).
* `docs/adrs/0059-committed-run-artifacts-github-pages.md` — why the tree exists.
* `.github/workflows/pages.yml` — the deploy mechanism (confirm the URL-stability assumption).
* `scripts/publish-artifact.mjs` + `scripts/lib/artifacts-index.mjs` + `artifact-chrome.mjs` — the
  code being renamed.
* Root `CLAUDE.md` ruler section + `.ruler/knowledge-map.md:58` — the generated-files rule.
* `docs/adrs/0019-npm-script-naming-and-scripts-info.md` — script rename rules.
