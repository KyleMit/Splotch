# Handoff — Vector-canonical coloring art

> 2026-08-20 · branch `codex/vectorize-coloring-campaign` · PR
> [#1171](https://github.com/KyleMit/Splotch/pull/1171) · Make SVG the sole canonical line-art
> format, including covers and picker tiles, then re-punch fills and retire raster line-art assets

## Objective & non-goals

Build a successor PR after #1171 merges that:

* vectorizes the eight light and eight dark book covers;
* uses the same theme-specific SVG for a page's picker tile and full-paper overlay;
* removes separate root and `max-240px` thumbnail files and their generation/runtime machinery;
* moves every authoring, audit, proof-sheet, and punch consumer from committed raster line-art
  masters to canonical SVGs or deterministic SVG rasterization;
* deterministically re-punches shipped light/night fills against the canonical vector geometry; and
* deletes committed `*.outline.webp` / `*.chalk.webp` line-art masters only after no consumer needs
  them.

Do **not** regenerate the creative colored fills through Gemini. Preserve the committed
`tools/asset-gen/fill-src/**/*.raw.webp` artwork and change only the deterministic inpaint punch. Do
not change the approved line-art design, theme fork, Magic Brush semantics, or runtime source-over
composition.

## State

PR #1171 is mergeable and CI-green at cb4545e9826563e904334f842d53b38fd4070976. It ships 96 light
and 96 dark page-overlay SVGs with no page-overlay WebP fallback.

| Commit                                   | What landed                                                   |
| ---------------------------------------- | ------------------------------------------------------------- |
| efed61160ea5306e71347c74677d265217ad9c30 | Vectorized all light page overlays                            |
| adf3229493ef593483d42034b681fc9ca04a2424 | Made page SVGs invariant compact/full pack members            |
| 6c2323d7430455d636804692e93e39015dfe4b99 | Added the first 83 dark page overlays                         |
| cb4545e9826563e904334f842d53b38fd4070976 | Completed all 96 dark page overlays and retired overlay WebPs |

No implementation file was changed during this follow-up analysis; this handoff is its only repo
change. The current contracts to replace are concentrated in:

* `web/src/lib/state/books.ts:133-185` — raster source/thumbnail suffixes and cover paths;
* `web/src/lib/state/books.ts:280-407` — invariant page SVGs beside raster thumbnail selection and
  responsive thumbnail derivation;
* `web/src/lib/state/books.ts:410-480` — validation and pack inventories currently include both
  thumbnails and page SVGs;
* `tools/asset-gen/lib/punch-fill.mjs:95-142` — light/night masks still come from raster pen/chalk
  luma; and
* `tools/vectorize/README.md:185-271` — campaign runner, ledgers, fidelity gates, and physical-iPad
  promotion procedure.

Read-only inventory on this commit:

| Asset class                              | Files |      Bytes |
| ---------------------------------------- | ----: | ---------: |
| Raster pen/chalk masters, pages + covers |   208 | 19,709,932 |
| Root picker thumbnails                   |   208 |  2,819,266 |
| `max-240px` picker derivatives           |   208 |  1,378,460 |
| Existing page overlay SVGs               |   192 |  7,532,218 |
| Cover masters alone (8 light + 8 dark)   |    16 |  1,421,690 |

The last reported Vectorizer.AI balance was 37.9 credits. Sixteen production cover traces would cost
16 credits, but the successor must query the account again before spending. The current campaign
driver excludes covers and caps one paid batch at 12.

## Decisions made (and why)

* **Vectorize all 16 covers.** The picker now displays covers/page tiles large enough that the 400
  px raster source can upscale on Retina iPads. A single cover SVG per theme improves zoomed
  fidelity and completes the line-art format boundary. Use a free dense-cover pilot first and one
  paid keeper per cover/theme only after parameters are fixed.
* **Treat SVG as the new canonical line art, then delete raster masters.** Git retains the original
  rasters as provenance, and future bitmap inputs can be deterministically rasterized from SVG. Do
  not describe that as reconstructing the old original: Vectorizer output is a deliberately lossy,
  fidelity-gated replacement. Deletion happens only after every tool and ledger has migrated.
* **Remove thumbnail assets, not the UI concept of a picker tile.** Page tiles should render the
  same light/dark overlay SVG that the paper uses; cover tiles should render the new cover SVG. Keep
  CSS sizing, lazy loading, accessibility labels, and picker semantics. Remove `thumbPath()`,
  `chalkThumbPath()`, thumbnail `srcset`, the `max-240px` tier, thumbnail generation, and duplicate
  pack entries once the SVG path passes performance gates.
* **Re-punch; do not AI-regenerate fills.** The creative raw fills remain valid. The deterministic
  inpaint mask should include canonical SVG alpha so the shipped fill is line-free under the exact
  geometry users see. For the migration punch, use the union of the legacy raster mask and the new
  SVG-alpha mask (or prove a safer equivalent): punching the raw fill with only a slightly narrower
  vector mask can re-expose pixels from the raw fill's old outline outside the SVG.
* **Approve the simplification empirically.** PR #1171 measured one full-paper SVG at a time; a
  picker simultaneously decodes/renders eight covers or twelve page-orientation tiles. The likely
  code/pack win does not prove that grid workload on physical WebKit. Retain only after the real
  iPad book-open/page-grid actions and visual scroll remain frame-bound.
* **Keep raw fill sources.** `fill-src/**/*.raw.webp` contains creative color information that
  cannot be recovered from line-art SVGs and is outside the raster-master purge.

## Unverified assumptions

* The current page-vector parameters produce acceptable cover fidelity and aggregate native/web
  size. No cover has been traced or analyzed.
* Eight or twelve simultaneously displayed SVGs stay within the picker action/scroll gates on the
  physical iPad. Existing evidence covers full-paper presentation, not a vector grid.
* A legacy-raster-mask ∪ canonical-SVG-alpha mask is sufficient to remove raw-fill outline remnants
  without erasing legitimate dark fill details. This needs pixel/composite proof sheets and negative
  tests before the old masters are deleted.
* The `rg` consumer inventory is complete. Raster assumptions span asset generation, golden audits,
  proof sheets, manifest checks, native stripping tests, and vector provenance; re-enumerate after
  rebasing onto post-#1171 `main`.
* One successor PR is reviewable. Prefer one PR with isolated commits, but split after the cover
  pilot if canonical-source migration or fill-punch review becomes independently risky.
* Manifest format 3 currently admits SVG only at page-overlay suffixes. Cover SVGs and removal of
  raster thumbnail paths may require a format bump and coordinated web/Android/iOS parser fixtures.

## Done & verified

* PR #1171: ADR Integrity and the complete Tests workflow passed at
  cb4545e9826563e904334f842d53b38fd4070976.
* Current page catalog: `vectorize:coloring:check` reports 96 light + 96 dark records;
  `vectorize:postprocess:check` reports 196 SVG fixed points.
* Current physical-iPad completed-catalog sweep: book opening 14/17/22 ms and page selection
  18/20/20 ms (first-frame P95 / post-action P95 / max).
* Read-only inspection confirmed `bookPackAssetPaths()` includes both theme-specific thumbnails and
  theme-specific page SVGs, so page-tile reuse can remove duplicate pack members.
* Read-only inspection confirmed `punchFill()` builds masks from `*.outline.webp` / `*.chalk.webp`
  luma, so deleting masters before the punch migration would break deterministic fill generation.
* No cover trace, new punch, thumbnail removal, or grid performance measurement was run in this
  follow-up.

## Risks & next 3 steps

1. After #1171 merges, resume this handoff, rebase from `main`, query credits, and extend the
   restart-safe vector campaign to covers. Run free simple/dense light+dark cover trials, then a
   paid keeper gate with fidelity, raw/gzip/native size, Chromium/WebKit decode, and physical-iPad
   cover grid checks before spending the remaining 15 credits.
2. Establish the canonical-source contract: choose cover SVG names, update/bump the pack manifest,
   point picker tiles/prefetch at SVGs, migrate proof sheets/audits/generators/ledgers to SVG inputs
   or deterministic rasterization, and create a new ADR (or explicitly supersede/amend ADR-0129)
   covering canonical SVG sources and the retired thumbnail tier.
3. Implement and visually prove the transition punch using raw fills plus the safe mask union;
   regenerate responsive fill derivatives and golden manifests. Only then delete all 416 thumbnail
   files and 208 raster line-art masters, run full tests/builds/offline pack checks, and repeat the
   physical-iPad theme/book/page/Magic/rotation/clear/export sweep with PR before/after imagery.

## Reread first

* `docs/adrs/0129-invariant-svg-overlays-in-coloring-packs.md`
* `docs/adrs/0045-coloring-picker-thumbnails-and-prefetch.md`
* `docs/adrs/0091-alpha-overlays-and-worker-magic-sheets.md`
* `docs/adrs/0103-progressive-coloring-book-packs.md`
* `web/src/lib/state/books.ts`
* `tools/asset-gen/lib/punch-fill.mjs`
* `tools/asset-gen/docs/inpainted-fill-punch.md`
* `tools/asset-gen/docs/asset-naming.md`
* `tools/asset-gen/docs/pipeline.md`
* `tools/vectorize/README.md`
* Skills: `resume-handoff`, `vectorize-image`, `profiling`, `mobile`, `testing`, `create-adr`,
  `update-adrs`, and `pr-screenshots`
