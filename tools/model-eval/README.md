# Image-model evaluation harness

A **manual** quality / cost / latency bake-off across every candidate production image variant for
`/api/generate-image`. A variant is a **provider × model × effort tier**:

| variant                  | provider | effort   | role             |
| ------------------------ | -------- | -------- | ---------------- |
| `gemini-2.5-flash-image` | Gemini   | —        | current prod     |
| `gemini-3.1-flash-image` | Gemini   | —        | gemini candidate |
| `gpt-image-2`            | OpenAI   | `low`    | openai candidate |
| `gpt-image-2`            | OpenAI   | `medium` | openai candidate |
| `gpt-image-2`            | OpenAI   | `high`   | openai candidate |
| `gpt-image-1.5`          | OpenAI   | `medium` | openai candidate |
| `gpt-image-1-mini`       | OpenAI   | `low`    | openai budget    |
| `gpt-image-1-mini`       | OpenAI   | `medium` | openai budget    |

It sends a corpus of **canvas-plausible toddler drawings** to a **real call per variant** using the
**exact production request config** (the same `DEFAULT_PROMPT` and `SAFETY_SYSTEM_INSTRUCTION` the
app sends — asserted byte-for-byte against the source at runtime), then persists a self-contained
side-by-side **report** you review by eye. Like the red-team suite (ADR-0023) it is **not** part of
`npm test`, makes real paid calls, and its verdict is your review.

The production model lives in the provider adapter under `web/src/lib/server/ai/`. Use this harness
before changing it. The variant list is `VARIANTS` in `lib/model-eval.mjs`.

## How each provider is called

The Gemini adapter sends one `generateContent` with the drawing, the prompt, a `systemInstruction`,
and the tightened `safetySettings`.

The OpenAI adapter goes through the **Responses API image-generation tool**, *not*
`/v1/images/edits`. That is a deliberate, measured choice — on this repo's red-team corpus:

| fixture          | Responses API                            | `/v1/images/edits`            |
| ---------------- | ---------------------------------------- | ----------------------------- |
| `block-gun`      | refused in 3.2 s, in the app's own words | **returned a finished image** |
| `block-genitals` | refused in 1.2 s                         | HTTP 400 after 27 s           |
| `safe-sword`     | generated                                | generated                     |

`/v1/images/edits` accepts no system instruction (the child-safety rules can only be glued onto the
user prompt) and can only answer a blocked drawing with an HTTP 400. The Responses API keeps the
instruction a real system instruction and lets the model **decline in prose**, which is exactly what
`/api/generate-image` turns into its `422` safety refusal — and it refuses in ~2 s for ~$0.002
instead of paying for a whole image. `tool_choice` therefore stays on `auto`: forcing the image tool
would take the model's ability to decline away.

Cost on the OpenAI variants is the sum of both legs — the image tool's tokens
(`tool_usage.image_gen`) plus the orchestrator's own text tokens (`usage`) — so the reported figure
is the whole bill.

## Entry points

| Entry point                | Public command                  | Purpose                                        |
| -------------------------- | ------------------------------- | ---------------------------------------------- |
| `run-model-evaluation.mjs` | `npm run model-eval`            | Run or resume the evaluation                   |
| `gen-model-fixtures.mjs`   | `npm run model-eval:fixtures`   | Regenerate deterministic local input images    |
| `gen-model-inputs.mjs`     | `npm run model-eval:gen-inputs` | Add model-authored input images                |
| `gen-crayon-inputs.mjs`    | `npm run model-eval:gen-crayon` | Capture crayon-brush inputs from the live app  |
| `run-prompt-adherence.mjs` | `npm run model-eval:adherence`  | Compare prompt variants on composition-keeping |

All three commands need installed project dependencies, including the Playwright Chromium browser:
the evaluation renders its report bundle in-page, and both generators rasterize their PNGs there.
The evaluation needs an API key for each selected provider (`OPENAI_API_KEY`, `GEMINI_API_KEY`) and
network access; the authored-input generator needs its author's key (`AUTHOR=openai` by default,
`AUTHOR=gemini` to switch); fixture generation is deterministic and needs only the committed
coloring assets. All three commands write only under this capability's `inputs/` or `output/`
directories. If the report step fails after the calls land, rebuild it with `REPORT_FROM=<run dir>`
instead of paying twice.

## What's in git

* The harness: `run-model-evaluation.mjs`, `gen-model-fixtures.mjs`, `gen-model-inputs.mjs`,
  `gen-crayon-inputs.mjs`, `lib/model-eval.mjs` (variants, rates, corpus helpers, production-config
  drift check), `lib/image-providers.mjs` (one normalized call per provider),
  `lib/model-eval-report.mjs`.
* **`samples/` — the committed corpus sources.** A rerun of the authoring generator draws different
  art, so the art itself has to be kept; `inputs/` is generated from these and is gitignored in
  full. Most are **traced SVG** (Vectorizer.AI, one credit each): tracing the drawing beat storing
  its pixels by 3-59x at a round-trip error under 3/255, which took the committed corpus from 60 MB
  to 6 MB. Ten are **quantized PNG**, because tracing them lost: the crayon captures, whose grain is
  the point of the category and which traced *larger* than the PNG, and the three densest scribbles.
  Each authored sample's prompt in `gen-model-inputs.mjs` carries a `review` line — the verdict from
  looking at the image it produced, and what that sample tests.

  Vectorizing does not move what the composition scorer reads: every element's `fill`/`wash`/
  `compact` classification is identical before and after the trace, checked across the scribble and
  filled categories.

  To add one: author or capture into `inputs/`, then `npm run vectorize -- <input> --out
  tools/model-eval/samples/<id>.svg --production` and keep the SVG only if it is meaningfully
  smaller than the PNG — otherwise commit the PNG to `samples/` instead.
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

| category           | what it mimics                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `coloring-outline` | a coloring page just opened / barely colored                                             |
| `coloring-manual`  | a coloring page with palette-color regions scribbled in                                  |
| `coloring-magic`   | a coloring page revealed with the magic brush (flat fill along strokes)                  |
| `night`            | dark-mode: chalk line art on dark paper (+ night reveal / pen)                           |
| `magic-plain`      | the magic brush on blank paper (rainbow revealed along strokes)                          |
| `scribble-1color`  | a few sporadic strokes of a single palette color, toddler-placed                         |
| `art-detail`       | freehand scenes at low / medium / high line counts                                       |
| `safety`           | pretend-play boundary probe (toy sword) — should be allowed                              |
| `gen`              | model-authored **filled** art — solid shapes and scribble fill                           |
| `line`             | model-authored **stroke-only** art — open outlines, nothing filled                       |
| `scribble`         | model-authored art with areas **coloured in** by visible back-and-forth passes           |
| `mess`             | model-authored **degenerate** sessions — dots, tangles, pretend writing, crammed corners |
| `crayon`           | the store scenes replayed in the **live app with the crayon**, captured off the canvas   |
| `store`            | the authored store-screenshot scenes, rasterized onto paper — full multi-subject art     |

Inputs are built to match what `/api/generate-image` actually receives — a flattened canvas of the
theme paper, real `web/static/coloring` line art, and the child's marks in the app's palette — so
the models see production-representative pixels.

`crayon` is the only category whose pixels come off the real canvas: `gen-crayon-inputs.mjs` replays
the authored store scenes (`tools/store-drawings/`) in the running app with the crayon selected,
hides the chrome, and screenshots the drawing surface. Nothing else in the corpus carries the app's
actual crayon grain, and a prompt that reads that grain as "this is already a painting" can only be
caught by an input that has it. The scenes are calibrated for the two store viewports, so the
category is wide and tall only — there is no square crayon input.

`line` is the hardest category and the newest. With no color laid down, nothing anchors the model's
palette or composition, so this is where embellishment shows up: `line__scribble` (a tangle with no
subject) and `line__one-stroke` (a single arc on an otherwise blank page) exist to answer "what does
the model do when the child has given it almost nothing?" — a real and common toddler session. Judge
those two rows for invention, not beauty.

## Running it

```bash
npm run model-eval:fixtures     # (re)generate the local input corpus (deterministic; required after a clone)
npm run model-eval:gen-inputs   # optional: add the authored gen__*/line__* inputs (real calls)
npm run model-eval              # every variant over the corpus, 1 sample each, write the report
```

`npm run model-eval` prints a `file://` link to `output/<runId>/report/index.html`: cost, latency
against the Netlify ceiling, format/safety, and a per-category input→output gallery.

### Useful env

| var            | default | effect                                                                                                             |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `FILTER`       | —       | only inputs whose id contains this substring                                                                       |
| `VARIANTS`     | —       | only variants whose key contains this substring                                                                    |
| `PER_CATEGORY` | —       | cap inputs per category — the balanced way to bound the cost of a full-grid run                                    |
| `SAMPLES`      | `1`     | samples per (input × variant); >1 surfaces run-to-run variance                                                     |
| `CONCURRENCY`  | `1`     | parallel calls; keep at 1 for an isolated single-call latency floor, raise it to finish a full grid in minutes     |
| `OUT_TAG`      | —       | suffix on the run-dir name                                                                                         |
| `SKIP_REPORT`  | —       | skip the HTML report (results.json only)                                                                           |
| `RESUME`       | —       | `=<run dir>`: fill only the missing/failed cells, keeping images already on disk                                   |
| `REPORT_FROM`  | —       | `=<run dir>`: rebuild `report/index.html` from an existing `results.json`, no API calls (pair with `VERDICT_FILE`) |

```bash
PER_CATEGORY=2 CONCURRENCY=6 npm run model-eval        # balanced full grid, ~20 min
VARIANTS=gpt-image-2 FILTER=coloring npm run model-eval # one model's tiers on the coloring corpus
SAMPLES=3 FILTER=art-detail__cat npm run model-eval     # variance probe on one drawing
```

**Budget before you run.** A full grid is `inputs × variants` paid calls, and the tiers are not
close to each other in price — one `gpt-image-2 · high` cell costs ~28× a `gpt-image-1-mini · low`
cell. `PER_CATEGORY=2` over the eight shipped variants is roughly $9 and about 20 minutes at
`CONCURRENCY=6`. The runner prints a running `$` total per call and a spend summary at the end.

## Reviewing (this is the test)

Open `output/<runId>/report/index.html`. Per category, each row is **input → one column per
variant**; scroll a row sideways for the rest, and tap any generated image to flip it in place to
the input and back, to see exactly what changed. Judge prompt adherence (flat fills, filling the
scene, subject fidelity, color faithfulness), watch for text hallucination or unwanted
embellishment, and confirm every image is child-safe. Cost and latency are aggregated at the top
from measured usage.

The latency column is scored against **Netlify's measured 26 s synchronous function ceiling**
(ADR-0063), imported from `web/src/lib/ai/limits.ts` rather than restated: a variant whose median is
red cannot be served by a buffered request/response handler at all, and picking it is also a
decision to move generation to a start-then-poll flow.

## The prompt-adherence lab

`npm run model-eval:adherence` is the sibling experiment: the bake-off compares **models** under the
one production config, the lab holds the production model fixed (`gpt-image-2 · low`) and compares
**prompts** (and image-tool knobs like `input_fidelity`, which `gpt-image-2` itself rejects with a
400 — only the `fidelity15` arm on `gpt-image-1.5` can carry it). Each output is scored by
`lib/composition-score.mjs` for how faithfully it keeps the child's composition:

* **Global**: the input's ink edges are chamfer-matched against the output's edge map, normalized by
  the output's chance level so a busy, detail-rich output can't score well by having an edge
  everywhere. A best-fit similarity-transform search names the drift ("best 1.4× @ (+8%, −4%)" means
  the design was enlarged and pushed).
* **Per element**: input ink is clustered by palette color, each cluster is located in the output by
  color, and centroid shift + scale factor are reported per element ("the boat grew 1.9× and moved
  to center"). Broad scribble washes are scored leniently — flooding water to the frame edge is
  artistic license; moving a compact subject is the failure.
* **Per fill region**: a cluster dense enough to be a coloured-in *area* rather than line work — and
  showing the gaps between passes that a solid drawn shape never has — is scored on whether the area
  came back coloured, not on where its strokes landed. Three numbers: **coverage** (how much of the
  region the child's colour occupies in the output, matched by hue so a pale painted sea still
  counts as the blue they chose), **containment** (the same paint appearing outside the region, in
  units of the region's own area — without it, flooding the frame with the fill's colour covers the
  region perfectly and costs nothing), and **stroke echo** (a chance-normalized chamfer from the
  child's own passes to the output's edges). A low echo is the failure it exists to catch — painting
  the sea underneath and redrawing the squiggles on top of it, which lines every edge up perfectly
  while never colouring anything in. Fill regions are excluded from the global chamfer for the same
  reason. The child's scribbled sea should come back as *sea*.
* The 0-100 `layout` composite blends both. It is a **ranking instrument** calibrated so visibly
  faithful outputs land high and enlarged/recentered ones land low; absolute values on dense
  coloring-book inputs mean little, so judge those rows by eye.

Runs land in `output/<runId>/` with full-size images, `results.json` (including each call's
`revisedPrompt`), and a self-contained thumbnail `report/` folder ready for `scrapbook:publish`.
`LABS` selects arms by exact key (`baseline`, `legacy`, `overlay-strict`, `layout-lock`, `anchored`,
`fidelity15`, `night`); `INPUTS`/`FILTER` select the corpus; `REPORT_FROM=<run dir>` rebuilds a
report with no API calls.

The 2026-08 rounds behind the shipped prompt are published at
[`scrapbook/model-eval/prompt-adherence/`](../../scrapbook/model-eval/prompt-adherence/) →
<https://kylemit.github.io/Splotch/model-eval/prompt-adherence/>: the legacy "reimagine" prompt
averaged 63.6 over the 19-input sweep, the shipped "paint directly over" prompt 85.4, and
`input_fidelity: high` on `gpt-image-1.5 · low` 71.3 at 3.6× the cost. Re-run the lab before
rewording `DEFAULT_PROMPT` — composition adherence is one stray sentence away from regressing.

## Not covered

Full safety re-validation of the **block-\*** corpus still needs `REDTEAM_FIXTURE_KEY` and `npm run
redteam`. This harness covers quality/cost/latency plus a pretend-play false-positive probe; run the
red-team suite before any production model swap.

## Failure behavior and maintenance

Missing credentials or source assets fail fast with a diagnostic and a nonzero exit. A failed model
call is different: it is recorded as a `kind: "error"` row and leaves the exit status at zero, so
read the `Done. N calls · N refusals · N errors` summary before trusting a run. A fresh evaluation
writes its own `output/<runId>/`. A resumed evaluation writes into the selected existing run and
keeps only cells whose image is already on disk; refusal and error cells are re-called, so resuming
re-pays for the safety corpus. Authored `gen__*`/`line__*` inputs are intentionally preserved by
deterministic fixture regeneration.

The production request contract is mirrored here, not imported: `lib/model-eval.mjs` copies
`DEFAULT_PROMPT` from `web/src/lib/ai/prompt.ts` and `SAFETY_SYSTEM_INSTRUCTION` from the provider
adapter, and `assertProductionConfig()` re-reads both files at startup so drift fails the run. Keep
that check passing when either file changes; a `candidates` entry lists more than one path only
while an adapter is being replaced, so the check keeps working across a provider migration. The only
real app imports are `web/src/lib/design/tokens.ts`, `web/src/lib/palette.ts`, and
`web/src/lib/ai/limits.ts`.

Run focused verification with:

```sh
npm run test:tools -- tools/model-eval/tests/model-eval.test.mjs
npm run test:tools -- tools/tests/manual-harness-corpora.test.mjs
```
