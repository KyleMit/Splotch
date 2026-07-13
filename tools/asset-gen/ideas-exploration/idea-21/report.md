# Idea 21 — Before/after contact sheet from git history

**Verdict: WORKED.** `--source git:<ref>` and `--compare git:<ref>` were implemented in
`gen-contact-sheet.mjs` end-to-end, fully offline (0 Gemini calls), validated on real
historical refs for both suggested targets (`farm`, `creatures/owl-tall`), with normal
`--source shipped`/`--source samples` behavior verified untouched. The change is captured as a
clean re-appliable patch (`code/contact-sheet-git-source-and-compare.patch`, 5 files,
+187/-46); the repo was restored to pristine.

## What was built

Two new modes on the existing generator (no wrapper script needed — the CLI contract absorbed
them naturally):

- **`--source git:<ref>`** — every layer (pen outline, chalk, light fill, night fill) is read
  from the commit's blobs via `git -C REPO_ROOT cat-file blob <ref>:<path>` (spawnSync, buffer
  output, forward-slash tree paths so it stays cross-platform per ADR-0017). Nothing is
  materialized to disk and nothing is checked out. The ref is validated up front with
  `git rev-parse --short --verify <ref>^{commit}` and reported by short hash. The outline-keep
  badge is scored from the ref's own `tools/asset-gen/fill-src/` raw when it exists at that ref
  (it did at `46bc770`/`6e3f14f`; blank on pre-fill-src refs).
- **`--compare git:<ref>`** — before/after mode: each page orientation renders twice, the
  ref's light+night pair first, then the current `--source` pair (shipped or samples) directly
  below it. Every caption gets a provenance tag chip (`git:46bc770` / `shipped`).
  `--compare` + `--source samples` is deliberately allowed — that is the strongest use: judge a
  fresh regen against history *before* committing. `--compare` + `--source git:` is rejected.
- **Legacy-name fallback** — refs older than the dot-separated rename (`099204f`) resolve
  through the old names (`{page}-{orient}.webp` for the pen outline, `.color.webp` for the
  light fill; night name never changed; chalk is modern-only). This makes truly pre-fork refs
  like `34a606f` renderable.

### Supporting changes the compare mode forced

- **Image interning.** Cells now reference an `images` data-URI table by index instead of
  carrying their own URIs. In compare mode the outline/chalk/light layers are usually
  byte-identical on both sides, so a naive doubling (~11.4 MB for farm) collapses to **6.86 MB
  vs 5.72 MB** for the plain sheet — comfortably inside the 16 MB Artifact cap. Plain-mode
  sheets are size-neutral (5.72 MB before and after the change).
- **Per-cell `punch` flag.** The client previously keyed the in-browser punch on the global
  `source === 'samples'`. With mixed provenance on one sheet that must be per-cell: samples
  cells punch, shipped and git cells draw as-is (they are already inpainted fills-only).
- **Client null-index fix (bug found during the run).** With interned indices, index `0` is
  falsy — the first sheet rendered a perfectly good night fill *and* a red "no night fill"
  note on the same tile. The `!cell.night` / `!cell.chalk` caption checks became `== null`.
  Screenshot-verified fixed.

Docs were kept in sync in the same patch: `contact-sheet.md` (new CLI rows, interning note,
pre-punch-era caveat) and the `scripts-info` line for `gen:contact-sheet` in `package.json`.

## Empirical validation (all offline)

| Run | Result |
| --- | --- |
| `farm --source shipped` (regression) | 5.72 MB, identical size to pre-change baseline; screenshot: 24/24 canvases drawn, no tags, no console errors |
| `farm --source git:46bc770` | 5.65 MB, renders the pre-fork night fills |
| `farm --compare git:46bc770` | 6.86 MB, 24 pairs (12 cells x 2 sources), all 48 canvases drawn, tags correct |
| `creatures/owl-tall --compare git:6e3f14f` | 0.59 MB; old vs new night fill visibly differ (green-hat pre-fork take vs shipped blue-hat take); keep badge 100.0% on both light tiles |
| `creatures/owl-tall --compare git:34a606f` (pre-rename era) | 0.67 MB; legacy names resolved, "no chalk (inverted pen)" note correct, and the sheet surfaces the historical blown-out-sclera night owl — exactly the regression class the pipeline docs describe |
| `farm/cow-wide --source samples` (regression, real fresh take present) | punch path works, sample composites under chalk correctly, no tags in non-compare mode |
| `--compare git:doesnotexist` | clean failure: `git ref "doesnotexist" does not resolve to a commit`, exit 1 |
| ESLint on both modified JS files | clean |

**Refs compared against:** `46bc770` ("Add chalk outlines for all 12 farm pages" — the last
commit with farm's pre-fork night fills, parent of the `6a95c46` regen; all 12 farm night
fills differ from HEAD), `6e3f14f` (same point for creatures; owl-tall's night fill is the
only owl-tall asset that differs from HEAD), and `34a606f` ("Ship Creatures night twins" —
pre-rename, pre-punch, pre-chalk era) as the stress test.

## Limitations

- **Pre-inpaint-punch refs (before `48d38d4`) render Combined with doubled lines** — those
  committed fills still carry their own outlines and git cells draw as-is (punching them would
  recreate the dotted-ring artifact for post-punch refs, and the era can't be detected
  reliably from bytes). Documented in contact-sheet.md: judge such refs on the Color view.
  The `34a606f` owl night half actually looked fine because its own outlines are
  white-on-dark, but light halves of that era would double.
- The keep badge on git cells needs the ref to contain `fill-src/` raws under the modern
  name; older eras show no badge (graceful blank, same as a missing raw today).
- Compare mode doubles vertical scroll length rather than putting old/new in one row — chosen
  deliberately because the existing pair grid is 2 columns wide (light+night), and a 4-wide
  row would shrink tiles below judgeable size. Old-above-new with tag chips reads well in
  practice (see screenshots).
- The end-of-run log line says "N pages x 2 themes" where N is really cell count (pre-existing
  quirk; in compare mode it counts both sides).

## Recommendation

Adopt as-is. The patch is small, contract-respecting, and directly serves the set-by-set
cleanup pass: `npm run gen:contact-sheet -- farm --compare git:<pre-regen-ref>` (optionally
with `--source samples` to gate a regen against history before committing). Interning is a
free win for all modes. If adopted, consider also fixing the "N pages" log label, and note
the decision may deserve a line in pipeline.md.

## Files

- `code/contact-sheet-git-source-and-compare.patch` — the whole change (apply from repo root
  with `git apply`).
- `code/tmp-shoot-sheet.mjs`, `code/tmp-rects.mjs` — throwaway Playwright verification
  helpers used during the run (were placed in tools/asset-gen/ for import resolution, then
  deleted from the repo; chromium executablePath is hardcoded for this sandbox).
- `farm-compare-46bc770.html` (6.9 MB), `owl-tall-compare-6e3f14f.html`,
  `owl-tall-compare-34a606f-prerename.html`, `farm-git-46bc770.html` — real generated sheets,
  self-contained, openable/publishable directly.
- `overview-owl-compare.webp` — full-sheet view of the owl-tall compare.
- `pair-{cat-wide,cow-tall,horse-tall}-{before,after}.webp` — night-tile Combined-view crops
  from the farm compare sheet (before = `git:46bc770` pre-fork fill, after = shipped
  chalk-fork fill, same page).
