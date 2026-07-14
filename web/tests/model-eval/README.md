# Image-model evaluation harness

A **manual** quality / cost / latency bake-off between the two candidate production image
models for `/api/generate-image`:

| model                    | role         |
| ------------------------ | ------------ |
| `gemini-2.5-flash-image` | current prod |
| `gemini-3.1-flash-image` | candidate    |

It sends a corpus of **canvas-plausible toddler drawings** to a **real Gemini call per model**
using the **exact production request config** (the same `DEFAULT_PROMPT`, `SAFETY_SYSTEM_INSTRUCTION`,
and `SAFETY_SETTINGS` the app sends — asserted byte-for-byte against the source at runtime), then
persists a self-contained side-by-side **report** you review by eye. Like the red-team suite
(ADR-0023) it is **not** part of `npm test`, makes real model calls, and its verdict is your review.

The production model lives in `web/src/lib/server/ai/gemini.ts` (`IMAGE_MODEL`). Use this harness
before changing it.

## What's in git

- The harness: `scripts/model-eval-run.mjs`, `scripts/model-eval-fixtures.mjs`,
  `scripts/model-eval-gen-inputs.mjs`, `scripts/lib/model-eval.mjs`, `scripts/lib/model-eval-report.mjs`.
- The Gemini-authored inputs (`inputs/gen__*.png`) — not reproducible, so committed.
- The **reference report** lives in the committed `/artifacts` tree (ADR-0059), not here, so GitHub
  Pages serves it rendered: [`artifacts/model-eval/report/`](../../../artifacts/model-eval/report/)
  → <https://kylemit.github.io/Splotch/model-eval/report/>. It's a folder — `index.html` plus an
  `assets/` folder of thumbnail files (referenced by relative path, not base64-inlined, so diffs stay
  readable and unchanged thumbnails dedupe in git) and its `results.json` + `summary.json`.

The rest is gitignored: the regenerable local `inputs/` and every `output/<runId>/` run.

## Promoting a new run to `/artifacts`

A run writes its report bundle to a gitignored `output/<runId>/report/` (`index.html` + `assets/` +
the JSON). To make a run the published reference, copy that whole folder into the artifacts tree
(ADR-0059) at the stable path so the URL never changes:

```bash
npm run artifacts:publish -- web/tests/model-eval/output/<runId>/report model-eval/report
```

then commit. The Pages deploy runs on merge to `main`.

## The corpus

`inputs/<category>__<name>__<aspect>.png`. The filename prefix is the category:

| category            | what it mimics                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `coloring-outline`  | a coloring page just opened / barely colored                                |
| `coloring-manual`   | a coloring page with palette-color regions scribbled in                     |
| `coloring-magic`    | a coloring page revealed with the magic brush (flat fill along strokes)     |
| `night`             | dark-mode: chalk line art on dark paper (+ night reveal / pen)              |
| `magic-plain`       | the magic brush on blank paper (rainbow revealed along strokes)             |
| `scribble-1color`   | a few sporadic strokes of a single palette color, toddler-placed            |
| `art-detail`        | freehand scenes at low / medium / high line counts                          |
| `safety`            | pretend-play boundary probe (toy sword) — should be allowed                 |
| `gen`               | canvas-plausible art authored by `gemini-3.1-flash-image`                    |

Inputs are built to match what `/api/generate-image` actually receives — a flattened canvas of the
theme paper, real `web/static/coloring` line art, and the child's marks in the app's 10-color palette
— so the models see production-representative pixels.

## Running it

```bash
npm run model-eval:fixtures     # (re)generate the local input corpus (deterministic)
npm run model-eval:gen-inputs   # optional: add the Gemini-authored gen__* inputs (real calls)
npm run model-eval              # A/B both models over the corpus, 1 sample each, write the report
```

`npm run model-eval` prints a `file://` link to `output/<runId>/report.html` — a single portable
page: cost, latency (overall + per category), format/safety, and a per-category input→output gallery.

### Useful env

| var           | default | effect                                                               |
| ------------- | ------- | -------------------------------------------------------------------- |
| `FILTER`      | —       | only inputs whose id contains this substring                         |
| `SAMPLES`     | `1`     | samples per (input × model); >1 surfaces run-to-run variance         |
| `CONCURRENCY` | `1`     | parallel calls; keep at 1 for clean latency numbers                  |
| `OUT_TAG`     | —       | suffix on the run-dir name                                           |
| `SKIP_REPORT` | —       | skip the HTML report (results.json only)                             |
| `RESUME`      | —       | `=<run dir>`: fill only the missing/failed cells, keeping images already on disk |
| `REPORT_FROM` | —       | `=<run dir>`: rebuild `report.html` from an existing `results.json`, no API calls (pair with `VERDICT_FILE`) |

```bash
FILTER=coloring npm run model-eval                       # just the coloring categories
SAMPLES=3 FILTER=art-detail__cat npm run model-eval      # variance probe on one drawing
```

## Reviewing (this is the test)

Open `output/<runId>/report.html`. Per category, each row is **input → 2.5 output → 3.1 output**;
captions carry latency and measured cost. Judge prompt adherence (flat fills, filling the scene,
subject fidelity, color faithfulness), watch for text hallucination or unwanted embellishment, and
confirm every image is child-safe. The cost/latency tables are computed from measured
`usageMetadata`.

## Not covered

Full safety re-validation of the **block-\*** corpus (guns, etc.) still needs `REDTEAM_FIXTURE_KEY`
and `npm run redteam`. This harness covers quality/cost/latency plus a pretend-play false-positive
probe; run the red-team suite before any production model swap.
