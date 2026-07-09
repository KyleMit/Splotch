# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

### [Docs] Point the asset-gen review workflow at Artifact-publish (and the Chromium fallback) so cloud sessions stop reinventing headless screenshots

**File(s):** `tools/asset-gen/README.md` (the review-sheet lines, ~47 and ~91); cross-refs `tools/asset-gen/night-twins.md` (Artifact steps) and `.claude/skills/run-splotch/SKILL.md` (custom-screenshot + Chromium fallback)

#### Problem

`slow`. This session regenerated five colored twins and needed to *view* the generated review sheet (`night-twins-gallery.mjs` output — self-contained HTML with base64 images). Reviewing **light** twins, I entered from `tools/asset-gen/README.md`, which mentions the review sheet (`gen:coloring-sheet ... review sheet (gitignored)`, line 47; "review the scratch", line 91) but gives **no** guidance on how to actually view it in a headless cloud session. So I hand-rolled a Playwright screenshot and burned ~6 attempts on friction that is *already solved elsewhere in the repo*:

- `import { chromium } from 'playwright'` → `ERR_MODULE_NOT_FOUND` (bare `playwright` not resolvable), then `@playwright/test` ESM import also failed from the scratchpad cwd, then a CommonJS `require` launched but died with `Executable doesn't exist at .../chromium_headless_shell-1228` — the exact Chromium-revision drift `docs/CLOUD.md` (§ "Chromium revision must match `@playwright/test`") documents.
- I finally `find`-ed `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and passed `executablePath` by hand.

Both answers already exist but weren't reachable from where I was:
- **The intended path is not to screenshot at all** — publish the self-contained HTML with the **Artifact tool**. That's documented only in `night-twins.md` (the *dark-mode* runbook), so a light-twin / general review never surfaces it.
- **If you must screenshot**, `.claude/skills/run-splotch/SKILL.md` (lines ~68–82) already shows the custom-Playwright pattern and says to *copy `driver.mjs`'s `chromiumExecutablePath()` fallback or set `PLAYWRIGHT_CHROMIUM`*. But `run-splotch` is framed as "run the **app**" (spins up `vite dev`), so screenshotting a standalone generated HTML file doesn't cue it.

The knowledge is siloed under triggers ("night twins", "run the app") that don't match the actual task ("view an asset-gen review sheet"). `docs/AUDIT-LOG.md` shows a Playwright-screenshot detour was already fixed once (2026-07-08, custom-script location added to `run-splotch`), so this class of friction **recurs** — the fix keeps landing where the next person won't look.

#### Proposed solution

Add a short "Viewing a review sheet" note to `tools/asset-gen/README.md` beside the review-sheet lines, so the general (light + dark) workflow points to the existing answers:

1. The sheets are self-contained HTML (base64 images) built to be **published with the Artifact tool** — preferred in a cloud session; link `night-twins.md`'s existing Artifact steps instead of re-explaining.
2. `night-twins-gallery.mjs` now accepts page/cell targets (`nature/ant-wide`) and `--theme light` for a focused light-twin review (added this session) — mention it here.
3. If a raw PNG is genuinely needed, don't launch Chromium directly — reuse `run-splotch/driver.mjs`'s `chromiumExecutablePath()` fallback or set `PLAYWRIGHT_CHROMIUM` (`.claude/skills/run-splotch`, `docs/CLOUD.md`).

Optionally widen the `run-splotch` skill description so "screenshot a standalone/generated HTML page (e.g. an asset-gen review sheet)" is an explicit trigger, not just "run the app".

#### Verification

A future cloud session that generates a coloring-twin review sheet finds the "publish as an Artifact / focused `--theme light` / Chromium-fallback" pointer in `tools/asset-gen/README.md` and reaches a rendered review in one step — no `ERR_MODULE_NOT_FOUND`, no `Executable doesn't exist … chromium-<rev>`, no manual `find` under `/opt/pw-browsers`.
