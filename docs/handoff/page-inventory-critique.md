# Handoff — page inventory critique pipeline

> 2026-08-09 · branch `agent/page-inventory-critique-pipeline` · Make page-inventory critiques
> repeatable, complete, content-bound, and inclusive of portrait and landscape captures for every
> inventory surface.

## Objective & non-goals

Build a resumable critique pipeline around the responsive page inventory so a finalized
`design-critique.json` contains exactly one current assessment for every expected screenshot. Expand
the capture matrix from the four existing portrait viewports to portrait **and landscape** for each
canonical device: 8 viewport variants and, at the current 46 surfaces, 368 screenshots.

The pipeline should be:

`capture + manifest → checkpointed critique batches → strict finalization → feedback attachment`

Coverage means every inventory surface at every device/orientation combination, not merely every
SvelteKit route. Preserve the existing source discovery for routes and Settings sections, while
keeping the manual transient-state catalog auditable.

**Non-goals:** redesigning application surfaces in response to findings, generating landscape
captures during this handoff, changing the four canonical device families, putting model calls in
the feedback renderer, or treating a partial critique as publishable. An orientation filter on the
report is optional follow-up work; severity filtering already exists.

## State

* Branch: `agent/page-inventory-critique-pipeline`.
* PR: none.
* Working tree was clean after the implementation commit; this packet is the only subsequent file.
* The committed critique currently has exact portrait coverage: 184 unique entries match 184 WebPs,
  spanning 46 surfaces × 4 viewports. This was checked with sorted file-set comparison and `jq`.

| Commit                                   | What                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| 7b746ebbdd28edee4702faa0dedd354c3470e65b | Added optional critique attachment, severity borders/notes/filter, and separate CLI |
| 530d985b                                 | Merged the original 184-entry responsive design critique                            |
| 1e4be879                                 | Merged the responsive page-inventory capture/report generator                       |

Files in 7b746ebbdd28edee4702faa0dedd354c3470e65b:

* `scripts/gen-page-inventory.mjs` — capture entry point; optionally reads/preserves a critique.
* `scripts/attach-page-inventory-feedback.mjs` — feedback-only entry point; never captures images.
* `scripts/lib/page-inventory-report.mjs` — viewport catalog, critique parser, report renderer,
  severity filtering.
* `scripts/tests/page-inventory.test.mjs` — atomic output, critique-present/absent, mapping, and
  rendered-filter coverage.
* `scrapbook/page-inventory/index.html` — regenerated portrait report with 184 attached entries.
* `scrapbook/page-inventory/design-critique.json` — unchanged original critique.
* `package.json` and `scrapbook/README.md` — command registration and workflow documentation.

## Decisions made (and why)

### Keep deterministic stages separate

`gen:page-inventory` owns browser capture. `gen:page-inventory:feedback` owns rendering existing
images plus optional feedback. Add critique generation/finalization as its own stage rather than
making the renderer invoke a vision model. This retains cheap rerendering and makes failures easier
to resume.

### Make a capture manifest the coverage authority

The capture stage should emit a schema-versioned manifest with one record per expected image:

* image path;
* SHA-256 of the encoded WebP;
* surface id/group/title/source;
* viewport id/device/logical width/logical height;
* explicit `orientation: "portrait" | "landscape"`.

The manifest, not counts written by a model, defines completeness. It is a deliberately normalized
data file allowed by the scrapbook conventions and fits ADR-0059's keeper-artifact model.

### Bind feedback to image content

Path-only mapping is unsafe because recapture overwrites a stable path. Record either each image's
SHA-256 in its critique entry or a manifest digest plus enough per-entry evidence to identify stale
records. Prefer per-image hashes so an interrupted rerun can retain unchanged assessments. The
attachment step must reject a critique whose hash differs from the current image.

### Require exact coverage for finalized output

When a critique is supplied for attachment/publishing, validation should require:

* expected image set equals critique image set;
* one entry per image, with no missing, duplicate, or unknown entries;
* all 8 viewport variants for every surface;
* current image hashes;
* valid closed severity vocabulary;
* a non-empty recommendation for every non-pass entry and `null` for pass;
* scope counts, severity counts, and completeness derived from entries rather than trusted from
  model output.

Allow an explicit `--allow-partial` only for scratch/WIP inspection. Never overwrite the committed
critique or report from a failed/incomplete run.

### Add landscape as four explicit viewport variants

For each existing device, add a landscape variant by swapping logical width/height:

| Device                | Portrait  | Landscape |
| --------------------- | --------- | --------- |
| iPhone 13 mini        | 375×812   | 812×375   |
| iPhone 16 Pro Max     | 440×956   | 956×440   |
| iPad mini 7th Gen     | 744×1133  | 1133×744  |
| iPad Pro 13-inch (M4) | 1032×1376 | 1376×1032 |

Keep the existing viewport ids/paths as the portrait ids for backward compatibility. Add
`-landscape` ids for the new variants and carry the explicit orientation in the manifest so code
does not infer it from dimensions or naming. The report's viewport key and each caption must name
orientation. Let the 8 shots wrap in the responsive grid rather than forcing an 8-column row.

### Batch critique work by surface and orientation

Review one surface's four device captures for one orientation together, producing exactly four
entries per batch. This keeps responsive comparisons together without asking the vision context to
hold all eight high-resolution images. At the current inventory size this is 92 deterministic
batches. Checkpoint completed batches in a gitignored work directory, retry only incomplete/invalid
batches, then atomically finalize after the full surface × orientation matrix passes validation.

Implement the agent-facing visual-review procedure as a reusable verb-noun skill such as
`critique-page-inventory`; keep manifest construction, validation, merging, and finalization in
plain Node scripts.

### Treat invalid captures as capture failures

Before critique, validate that each WebP decodes, has the expected logical dimensions, and reached
its surface-specific ready condition. Add conservative suspicious-blank detection for surfaces that
are not intentional workspaces. The four blank `/dev/engine` screenshots currently appear as
high-severity critique entries; future blank harness captures should fail before review.

## Unverified assumptions

* Every existing `prepare` callback works at the four landscape widths/heights. Pay particular
  attention to Settings crossing its 700px shell breakpoint, small-phone landscape vertical space,
  drag gestures, dialog scrolling, and the install banner.
* Swapping viewport dimensions with the existing iOS user agents is sufficient for the intended
  logical landscape representation; safe-area/browser-chrome simulation has not been evaluated.
* Eight captures per surface remain readable in the current report grid without an orientation
  switcher or separate portrait/landscape rows.
* A conservative blankness metric can distinguish intentional blank drawing workspaces from failed
  harness/UI captures without false failures. Prefer explicit ready/content assertions where
  available.
* The exact model, prompt packaging, retry budget, and checkpoint file format for the critique skill
  are undecided.
* The current 46-surface catalog may change before resume; derive counts from source/catalog rather
  than preserving 46/368 as constants.

## Done & verified

For commit 7b746ebbdd28edee4702faa0dedd354c3470e65b:

* `npm run gen:page-inventory:feedback` attached all 184 existing entries without generating or
  modifying WebPs.
* `npm run test:scripts` passed.
* `DPRINT_CACHE_DIR=/private/tmp/splotch-dprint-cache npm run format:check` passed.
* `npm run scrapbook:check` passed.
* A live Chromium check confirmed the severity filter starts at 184, High shows 4, and All restores
  184.
* Generated HTML contains the expected counts: pass 136, low 25, medium 19, high 4.
* No landscape capture, critique generation, manifest/hash validation, strict missing-entry gate, or
  blank-capture preflight has been implemented or verified.

## Risks & next 3 steps

Risks:

* `readDesignCritique()` currently rejects unknown/duplicate entries but accepts missing entries.
* Existing critiques are keyed only by stable image path, so `gen:page-inventory` can silently
  preserve stale feedback after replacing image contents.
* Controls, dialogs, AI states, and other transient surfaces are manually catalogued; source
  discovery guarantees routes and Settings sections, not every possible app state.
* Doubling the committed WebPs increases repository history. Follow ADR-0059's overwrite-in-place,
  keeper-only convention and do not create dated duplicate inventories by default.

Next steps, in order:

1. Extend the viewport catalog/capture stage to 8 explicit orientation variants; emit the
   schema-versioned image manifest with SHA-256 values; add decode/dimension/ready-content guards;
   update report labels/layout and unit tests. Make stale existing critique fail or detach rather
   than silently carrying forward.
2. Add strict manifest/critique validation plus atomic checkpoint merge/finalization, then create
   and register the `critique-page-inventory` workflow skill. Derive summary/scope fields and
   enforce non-pass recommendations.
3. Run the 368-image capture, complete all 92 surface-orientation critique batches, finalize and
   attach only after exact coverage/hash validation, then rerun script/format/scrapbook gates and
   visually inspect portrait and landscape report behavior.

## Reread first

* `scripts/lib/page-inventory-report.mjs:5` — current four-portrait viewport catalog and report.
* `scripts/gen-page-inventory.mjs:717` — capture orchestration and stale-critique risk.
* `scripts/attach-page-inventory-feedback.mjs:45` — feedback-only validation/attachment boundary.
* `scripts/tests/page-inventory.test.mjs:52` — current coverage.
* `scrapbook/page-inventory/design-critique.json` — schema version 1 and current 184 entries.
* `scrapbook/README.md:79` — documented inventory workflow and keeper-data convention.
* `docs/adrs/0059-committed-run-artifacts-github-pages.md` — committed keeper-output decision.
* `scripts/AGENTS.md` — script entry-point, validation, and atomic-output conventions.
* `.agents/skills/design/SKILL.md` — visual review criteria.
* `.agents/skills/testing/SKILL.md` — verification strategy.
* `skill-creator` Codex skill — use before creating the critique workflow skill.
