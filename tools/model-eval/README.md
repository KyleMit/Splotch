# Image-model evaluation harness

A **manual** quality / cost / latency bake-off between the two candidate production image models for
`/api/generate-image`:

| model                    | role         |
| ------------------------ | ------------ |
| `gemini-2.5-flash-image` | current prod |
| `gemini-3.1-flash-image` | candidate    |

It sends a corpus of **canvas-plausible toddler drawings** to a **real Gemini call per model** using
the **exact production request config** (the same `DEFAULT_PROMPT`, `SAFETY_SYSTEM_INSTRUCTION`, and
`SAFETY_SETTINGS` the app sends — asserted byte-for-byte against the source at runtime), then
persists a self-contained side-by-side **report** you review by eye. Like the red-team suite
(ADR-0023) it is **not** part of `npm test`, makes real model calls, and its verdict is your review.

The production model lives in `web/src/lib/server/ai/gemini.ts` (`IMAGE_MODEL`). Use this harness
before changing it.

## Entry points

| Entry point                | Public command                  | Purpose                                     |
| -------------------------- | ------------------------------- | ------------------------------------------- |
| `run-model-evaluation.mjs` | `npm run model-eval`            | Run or resume the two-model evaluation      |
| `gen-model-fixtures.mjs`   | `npm run model-eval:fixtures`   | Regenerate deterministic local input images |
| `gen-model-inputs.mjs`     | `npm run model-eval:gen-inputs` | Add Gemini-authored input images            |

All three commands need installed project dependencies, including the Playwright Chromium browser:
the evaluation renders its report bundle in-page, and both generators rasterize their PNGs there.
The evaluation and the Gemini-authored input generator also require `GEMINI_API_KEY` and network
access; fixture generation is deterministic and needs only the committed coloring assets. All three
commands write only under this capability's `inputs/` or `output/` directories. If the report step
fails after the calls land, rebuild it with `REPORT_FROM=<run dir>` instead of paying twice.

## What's in git

* The harness: `tools/model-eval/run-model-evaluation.mjs`,
  `tools/model-eval/gen-model-fixtures.mjs`, `tools/model-eval/gen-model-inputs.mjs`,
  `tools/model-eval/lib/model-eval.mjs`, `tools/model-eval/lib/model-eval-report.mjs`.
* The Gemini-authored inputs (`inputs/gen__*.png`) — not reproducible, so committed.
* The **reference report** lives in the committed `/scrapbook` tree (ADR-0059), not here, so GitHub
  Pages serves it rendered: [`scrapbook/model-eval/report/`](../../../scrapbook/model-eval/report/)
  → <https://kylemit.github.io/Splotch/model-eval/report/>. It's a folder — `index.html` plus an
  `assets/` folder of thumbnail files (referenced by relative path, not base64-inlined, so diffs
  stay readable and unchanged thumbnails dedupe in git) and its `results.json` + `summary.json`.

The rest is gitignored: the regenerable local `inputs/` and every `output/<runId>/` run.

## Promoting a new run to `/scrapbook`

A run writes its report bundle to a gitignored `output/<runId>/report/` (`index.html` + `assets/` +
the JSON). To make a run the published reference, copy that whole folder into the scrapbook tree
(ADR-0059) at the stable path so the URL never changes:

```bash
npm run scrapbook:publish -- tools/model-eval/output/<runId>/report model-eval/report
```

then commit. The Pages deploy runs on merge to `main`.

## The corpus

`inputs/<category>__<name>__<aspect>.png`. The filename prefix is the category:

| category           | what it mimics                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| `coloring-outline` | a coloring page just opened / barely colored                            |
| `coloring-manual`  | a coloring page with palette-color regions scribbled in                 |
| `coloring-magic`   | a coloring page revealed with the magic brush (flat fill along strokes) |
| `night`            | dark-mode: chalk line art on dark paper (+ night reveal / pen)          |
| `magic-plain`      | the magic brush on blank paper (rainbow revealed along strokes)         |
| `scribble-1color`  | a few sporadic strokes of a single palette color, toddler-placed        |
| `art-detail`       | freehand scenes at low / medium / high line counts                      |
| `safety`           | pretend-play boundary probe (toy sword) — should be allowed             |
| `gen`              | canvas-plausible art authored by `gemini-3.1-flash-image`               |

Inputs are built to match what `/api/generate-image` actually receives — a flattened canvas of the
theme paper, real `web/static/coloring` line art, and the child's marks in the app's 10-color
palette — so the models see production-representative pixels.

## Running it

```bash
npm run model-eval:fixtures     # (re)generate the local input corpus (deterministic)
npm run model-eval:gen-inputs   # optional: add the Gemini-authored gen__* inputs (real calls)
npm run model-eval              # A/B both models over the corpus, 1 sample each, write the report
```

`npm run model-eval` prints a `file://` link to `output/<runId>/report/index.html`: cost, latency
(overall + per category), format/safety, and a per-category input→output gallery.

### Useful env

| var           | default | effect                                                                                                             |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `FILTER`      | —       | only inputs whose id contains this substring                                                                       |
| `SAMPLES`     | `1`     | samples per (input × model); >1 surfaces run-to-run variance                                                       |
| `CONCURRENCY` | `1`     | parallel calls; keep at 1 for clean latency numbers                                                                |
| `OUT_TAG`     | —       | suffix on the run-dir name                                                                                         |
| `SKIP_REPORT` | —       | skip the HTML report (results.json only)                                                                           |
| `RESUME`      | —       | `=<run dir>`: fill only the missing/failed cells, keeping images already on disk                                   |
| `REPORT_FROM` | —       | `=<run dir>`: rebuild `report/index.html` from an existing `results.json`, no API calls (pair with `VERDICT_FILE`) |

```bash
FILTER=coloring npm run model-eval                       # just the coloring categories
SAMPLES=3 FILTER=art-detail__cat npm run model-eval      # variance probe on one drawing
```

## Reviewing (this is the test)

Open `output/<runId>/report/index.html`. Per category, each row is **input → 2.5 output → 3.1
output**; tap any generated image to flip it in place to the input and back, to see exactly what
changed. Judge prompt adherence (flat fills, filling the scene, subject fidelity, color
faithfulness), watch for text hallucination or unwanted embellishment, and confirm every image is
child-safe. Cost and latency are aggregated at the top, computed from measured `usageMetadata`.

## Not covered

Full safety re-validation of the **block-\*** corpus (guns, etc.) still needs `REDTEAM_FIXTURE_KEY`
and `npm run redteam`. This harness covers quality/cost/latency plus a pretend-play false-positive
probe; run the red-team suite before any production model swap.

## Failure behavior and maintenance

Missing credentials or source assets fail fast with a diagnostic and a nonzero exit. A failed model
call is different: it is recorded as a `kind: "error"` row and leaves the exit status at zero, so
read the `Done. N calls · N refusals · N errors` summary before trusting a run. A fresh evaluation
writes its own `output/<runId>/`. A resumed evaluation writes into the selected existing run and
keeps only cells whose image is already on disk; refusal and error cells are re-called, so resuming
re-pays for the safety corpus. Generated `gen__*` inputs are intentionally preserved by
deterministic fixture regeneration.

The production request contract is mirrored here, not imported: `lib/model-eval.mjs` copies
`DEFAULT_PROMPT` from `web/src/lib/ai/prompt.ts` and `SAFETY_SYSTEM_INSTRUCTION` from
`web/src/lib/server/ai/gemini.ts`, and `assertProductionConfig()` re-reads both files at startup so
drift fails the run. Keep that check passing when either file changes. The only real app imports are
`web/src/lib/design/tokens.ts` and `web/src/lib/palette.ts`. The report builder and request logic
live in `lib/`, the browser fixture renderer remains plain `.js` because it executes inside the
page, and focused coverage lives in `tests/model-eval.test.mjs`.

Run focused verification with:

```sh
npm run test:tools -- tools/model-eval/tests/model-eval.test.mjs
npm run test:tools -- tools/tests/manual-harness-corpora.test.mjs
```
