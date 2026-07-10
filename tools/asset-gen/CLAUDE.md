# tools/asset-gen/ — asset-generation pipeline

The AI/`sharp` tooling that produces Splotch's committed art. Read `README.md`
here for the full runbook; the architecture rationale is **ADR-0053**. Key rules
when working in this folder:

- **Not a workspace, not separately installed.** Deps (`sharp`, `@google/genai`)
  live in the repo-root `package.json` so the root `node_modules` stays flat for
  `cap sync` + `patch-package` (ADR-0029). Never add a `dependencies` block here
  or `npm install` in this folder — binaries resolve upward from the root tree.
- **Paths go through `lib/paths.mjs`.** Use its exported constants (`REPO_ROOT`,
  `COLORING_DIR`, `STYLES_DIR`, `TWIN_SRC_DIR`, `SAMPLES_DIR`, `SAMPLES_DARK_DIR`)
  — don't hardcode `../../..` walks or import from `scripts/lib/`.
- **Raw twins are the source of truth; shipped twins are derived.** The lined
  colored twins live in `twin-src/` (committed, never shipped); the shipped
  `web/static/coloring/**/*.{color,night}.webp` are their fills-only punch
  (`punch-twin-outlines.mjs`, root: `npm run gen:coloring-punch` — offline,
  deterministic). Never hand-edit a shipped twin, and after changing any raw,
  re-punch it. The drift audit scores the raws.
- **The only sanctioned imports from `web/src`** are the four modules listed in
  `README.md` (styles, prompt, geminiSafety, books) — the app's single source of
  truth for prompts/safety/catalog. Don't reach into anything else under `web/src`.
- **Cross-platform (ADR-0017):** plain Node `.mjs`, no bash-isms, forward-slash
  glob patterns with a resolved `cwd` (not `join`-built patterns).
- **Outputs are committed artifacts**, reviewed by a human before shipping. The
  generators write shipped art into `web/static/` and review scratch into the
  gitignored `.coloring-samples*/`. Never commit the scratch dirs.
- **Manual/on-demand only** — the Gemini generators need `GEMINI_API_KEY` and are
  never run in CI (real API cost). The app never runs any of this at build time.
- **Always rebuild the contact sheet when you touch an asset.** Any time you
  generate, retouch, regenerate, or ship a coloring twin, re-run
  `gen-contact-sheet.mjs` (root: `npm run gen:contact-sheet`) for the affected
  page/category — or `-- all --source shipped` for a whole-catalog pass, which
  rebuilds from committed assets only (no key/network, ~3s) — and **publish the
  resulting HTML with the Artifact tool** so the
  change is visible in the session — the sheet is self-contained (images inlined
  as base64), so it renders in the sandbox; do NOT hand-composite a PNG. Judge on
  the **Combined** view. **The Artifact tool caps uploads at 16 MB, which the
  whole-catalog `all` sheet now exceeds** (the generator warns when it does) —
  for a catalog-wide review, publish **per-category** (or 2–3 categories per
  sheet) rather than one `all` Artifact. See the "Viewing a review sheet" section
  of `README.md`.
- **Dark-mode night twins** have their own detailed runbook in `night-twins.md`
  (generate → review contact sheet → retouch line art if needed → ship → wire).
  Read it before generating more.
