# tools/asset-gen/ — asset-generation pipeline

The AI/`sharp` tooling that produces Splotch's committed art. Read `README.md`
here for the full runbook; the architecture rationale is **`docs/architecture.md`**. For the
END-TO-END picture — outline normalization, the punch, day/night fills, every
quality gate and the shipped regression that motivated it, iteration methods,
and where future categories will likely break — read **`pipeline.md`** (its
illustrations are frozen copies in `pipeline-assets/`; keep both updated as the
pipeline evolves). Key rules when working in this folder:

- **Not a workspace, not separately installed.** Deps (`sharp`, `@google/genai`)
  live in the repo-root `package.json` so the root `node_modules` stays flat for
  `cap sync` + `patch-package` (ADR-0029). Never add a `dependencies` block here
  or `npm install` in this folder — binaries resolve upward from the root tree.
- **Paths go through `lib/paths.mjs`.** Use its exported constants (`REPO_ROOT`,
  `COLORING_DIR`, `STYLES_DIR`, `FILL_SRC_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`)
  — don't hardcode `../../..` walks or import from `scripts/lib/`.
- **Raw fills are the source of truth; shipped fills are derived.** The lined
  colored fills live in `fill-src/` (committed, never shipped); the shipped
  `web/static/coloring/**/*.{light,night}.webp` are their fills-only punch
  (`punch-fill-outlines.mjs`, root: `npm run gen:coloring-punch` — offline,
  deterministic). Never hand-edit a shipped fill, and after changing any raw,
  re-punch it. The drift audit scores the raws.
- **Line work is forked per theme (the pen/chalk split — see `pipeline.md`).**
  The PEN outline (`{page}.outline.webp`, black ink on white) drives light mode
  and every derivation; the CHALK outline (`{page}.chalk.webp`,
  `gen-coloring-chalk.mjs`) is the dedicated dark-mode line art with deliberate
  solid whites (eye sclera, catchlights), **stored ink-on-white** — negate it
  before showing it to Gemini or a human as "dark mode art". Night fills
  condition on the chalk and punch against it; after changing a chalk,
  regenerate the page's night fill and re-punch.
- **The only sanctioned imports from `web/src`** are the four modules listed in
  `README.md` (styles, prompt, geminiSafety, books) — the app's single source of
  truth for prompts/safety/catalog. Don't reach into anything else under `web/src`.
- **Cross-platform (ADR-0017):** plain Node `.mjs`, no bash-isms, forward-slash
  glob patterns with a resolved `cwd` (not `join`-built patterns).
- **sharp alpha gotcha:** never `joinChannel` an alpha plane and encode — sharp
  tags the 4th band as a generic extra channel, not alpha, so the webp/png encoder
  *silently* flattens it (output decodes `channels: 3, hasAlpha: false`, no error).
  Interleave an explicit RGBA buffer and construct `sharp(rgba, { raw: { width,
  height, channels: 4 } })` instead, and verify outputs with
  `sharp(out).metadata()` → `hasAlpha: true`. (No current asset ships alpha — the
  punch inpaints instead of cutting holes, `docs/inpainted-fill-punch.md` — this
  trap applies to any future alpha-carrying asset.)
- **Outputs are committed artifacts**, reviewed by a human before shipping. The
  generators write shipped art into `web/static/` and review scratch into the
  gitignored `.coloring-samples*/`. Never commit the scratch dirs.
- **`ISSUES.md` is the living list of known defects, gate blind spots, and
  tooling gaps.** Read it before regenerating a page or overriding a gate
  (several failure classes are gate-blind and only caught by composite
  review); when you fix or discover an issue, update it in the same task.
- **Manual/on-demand only** — the Gemini generators need `GEMINI_API_KEY` and are
  never run in CI (real API cost). The app never runs any of this at build time.
- **The contact sheet is the single fill-review surface — read
  `contact-sheet.md` before modifying `gen-contact-sheet.mjs` or anything under
  `contact-sheet/`.** It holds the CLI contract, the layer/compositing model,
  and the size constraints.
- **Always rebuild the contact sheet when you touch an asset.** Any time you
  generate, retouch, regenerate, or ship a coloring fill, re-run
  `gen-contact-sheet.mjs` (root: `npm run gen:contact-sheet -- <category>`) for
  the affected category — **one category per sheet** (`all` is rejected: the
  Artifact tool caps uploads at 16 MB and a whole-catalog sheet exceeds it). The
  default `--source shipped` rebuilds from committed assets only (no
  key/network, ~3s). Then **publish the resulting HTML with the Artifact tool**
  so the change is visible in the session — the sheet is self-contained (images
  inlined as base64), so it renders in the sandbox; do NOT hand-composite a PNG.
  Judge on the **Combined** view.
- **Retired techniques and failed approaches live in `legacy/`** (the
  canonical-eye era's `night-fills.md` runbook and `retouch-line-art.mjs`,
  plus the history chronicle in `legacy/README.md`). Nothing in there is part
  of the current pipeline — `pipeline.md` is the live runbook; borrow from
  legacy, don't follow it.
- **`ideas-exploration/` is the frozen 2026-07 empirical burn-down of
  `IDEAS.md`** — one report, evidence set, and (mostly) re-appliable patch per
  idea, plus a self-contained review dashboard (`ideas-review.html`). Read its
  README before working any IDEAS.md item: 24 of 25 ideas were validated there,
  and several carry finished patches/assets waiting to be promoted. Like
  `legacy/`, nothing in it is live pipeline code.
