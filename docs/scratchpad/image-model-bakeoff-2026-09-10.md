# Image-model bake-off with the winning prompt

Flare low is the leading challenger to validate further. Its speed improvement is modest; this
screen does not establish a universal visual winner or intrinsic cost savings. Flare medium leads
the automatic layout score, but its advantage is inconsistent by eye and it costs more after cache
normalization.

## Comparison

| Configuration   | Images | Median | p90    | Mean layout / 100 | Recorded cost / image | Cost without orchestrator cache discount |
| --------------- | ------ | ------ | ------ | ----------------- | --------------------- | ---------------------------------------- |
| GPT Image 2 low | 28/28  | 24.5 s | 26.7 s | 83.0              | 3.53¢                 | 3.94¢                                    |
| Flare low       | 28/28  | 23.0 s | 24.0 s | 85.5              | 3.16¢                 | 3.94¢                                    |
| Flare medium    | 28/28  | 23.9 s | 25.7 s | 86.8              | 3.74¢                 | 4.52¢                                    |
| Sunburst low    | 28/28  | 26.3 s | 29.0 s | 84.5              | 3.16¢                 | 3.94¢                                    |
| Sunburst medium | 28/28  | 27.9 s | 31.2 s | 85.1              | 3.72¢                 | 4.50¢                                    |

The screen uses up to three concurrent requests. The completed comparison includes the successful
baseline retry; first-pass reliability was 27/28 for the baseline and 28/28 for each new
configuration. The 500 response had no usage record, so its billed cost is unknown.

Recorded usage: $4.8486 for the completed comparison, $0.1698 for five completed compatibility
calls, and $0.5040 for sequential confirmation. Total recorded estimate: $5.5223. The interrupted
compatibility request may have additional billing that was not returned to the harness. These are
usage-based estimates, not an invoice reconciliation.

## Sequential confirmation

The separate counterbalanced check made 16 sequential calls over four inputs (eight per model). GPT
Image 2 low: 24.2 s median, 31.8 s p90. Flare low: 21.8 s median, 23.0 s p90. Model order alternated
AB/BA within each input and which model started alternated between inputs. This is a small
confirmation sample, not a statistically powered latency study.

The extra visual review does not establish a quality winner. Both models preserve the car and
three-apple tree. On the coloring-page apple, each model loses the green coloring in one sample; the
other sample blends it softly on the baseline and leaves a hard seam on Flare. Both retain the toy
sword and stick figure, but one baseline sample shifts the figure and sword noticeably downward.

* [art-detail__car-hi__wide confirmation sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/confirmation/review/art-detail__car-hi__wide.png)
* [coloring-manual__apple__tall confirmation sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/confirmation/review/coloring-manual__apple__tall.png)
* [gen__apple-tree__square confirmation sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/confirmation/review/gen__apple-tree__square.png)
* [safety__toysword__tall confirmation sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/confirmation/review/safety__toysword__tall.png)

[Sequential results and call order](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/confirmation/results.json)

## Method and limits

The
[August gallery](https://github.com/KyleMit/Splotch/blob/e4bdacdcb3c699ccca3f41de54df14141d6bfeb3/scrapbook/model-eval/report/index.html)
recorded a 2.04¢ baseline over 19 drawings with one sample and six concurrent calls; this run
records 3.53¢ over 14 drawings with two samples and three concurrent calls. These are different
input mixes, with different recorded rates and unaligned cache histories. The historical published
gallery lacks a complete request/usage snapshot, so the difference cannot be attributed to a prompt
or orchestrator change. It is not a controlled estimate of a production cost regression.

* Fourteen synthetic inputs, one deterministically selected drawing per category, two samples per
  model/quality configuration.
* The exact shipped base prompt, safety instruction, orchestrator, reasoning setting, and token
  rates are saved in results.json; evaluation-plan.json records prompt/input hashes and the checkout
  revision.
* The prompt is the documented winner from ADR-0118. Candidate prompts retained in the lab were not
  substituted for the shipped winner.
* The current composition scorer runs against the full-size input/output bytes. Its scores are not
  directly comparable to the older prompt-lab report after scorer revisions.
* Layout scores are a ranking aid, not a color-fidelity or illustration-quality score. Nearly blank
  crayon inputs and dense coloring pages need visual review.
* The same base prompt is used on dark paper; this does not validate the production Night Mode
  suffix. No style suffixes or blocked-content fixtures were included.
* Cost includes the image tool and the text orchestrator. The lower recorded low-tier costs on newer
  models mostly reflect different cache hits; equal token rates are not evidence of lower per-image
  cost.

## Visual review of both samples

### art-detail__car-hi__wide

All variants retain the car, sun, and ground line. Rendering completeness varies between repeats:
Sunburst low leaves the wheels as outlines in one sample, while its other sample fills them. No
consistent visual winner.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/art-detail__car-hi__wide.png)

### coloring-magic__balloon__tall

GPT Image 2 low fills the balloon red in both repeats. Several new-model samples retain the red mark
as a patch on a yellow or white balloon. Their high layout scores do not establish better
interpretation of the child’s coloring. Sunburst medium also adds conspicuous background clouds in
one sample.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/coloring-magic__balloon__tall.png)

### coloring-manual__apple__tall

Flare low keeps a hard red/green seam in both repeats. Sunburst medium blends the colors in both;
Flare medium mostly softens the seam. GPT Image 2 low and Sunburst low each have one hard-seam
sample. Some more polished outputs add cloud/grass details absent from the input.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/coloring-manual__apple__tall.png)

### coloring-outline__astronaut__tall

All variants produce recognizable, well-aligned astronaut illustrations. Both quality tiers work
well; visual differences in color and lighting are larger than any clear across-repeat advantage.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/coloring-outline__astronaut__tall.png)

### crayon__balloon__tall

Despite the corpus filename, this input contains only a purple ground line and tiny flowers on
mostly blank paper. All variants preserve the sparse scene and avoid inventing a balloon. Flare low
turns the purple flowers green in one repeat. The very low automatic scores exaggerate visual
differences on this nearly blank input.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/crayon__balloon__tall.png)

### gen__apple-tree__square

All variants retain the tree and its three apples. New-model samples are closely aligned. Sunburst
medium adds decorative leaves in one sample, while the other sample is simpler. No consistent need
for medium quality on this input.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/gen__apple-tree__square.png)

### line__balloon__tall

All variants retain the purple balloon and separate blue ribbon. Differences are principally
shading, highlights, and background wash; all ten outputs are visually faithful.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/line__balloon__tall.png)

### magic-plain__dense__square

All ten outputs retain the abstract rainbow paths and their positions without inventing a subject.
Medium quality adds stronger highlights and rounded relief; that is a stylistic change rather than a
clear requirement for this input.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/magic-plain__dense__square.png)

### mess__corner-crammed__wide

The input is a tiny house in the lower-left corner. Every variant keeps it small and in that corner,
without recentering it or populating the blank space. All receive the maximum layout score;
differences are background wash and whether the house is filled.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/mess__corner-crammed__wide.png)

### night__circle__tall

Every variant turns the dark-paper input into a bright daytime illustration under the base prompt.
The actual Night Mode suffix was deliberately not included, so this is not evidence of a regression
against the production night request. Layout and the drawn subjects remain recognizable in all
repeats.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/night__circle__tall.png)

### safety__toysword__tall

All ten outputs allow the pretend-play toy sword and keep it separate from the stick figure,
preserving the intended layout. The figure remains mostly a stick figure across models. This
verifies this allowed-content probe only; it does not validate refusal of blocked content.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/safety__toysword__tall.png)

### scribble-1color__black__tall

All variants retain the three abstract strokes without inventing a character. Color preservation is
inconsistent: GPT Image 2 low and Flare low each keep dark strokes in one repeat and recolor them in
the other. Both Flare medium and Sunburst medium repeats recolor the black strokes. High layout
scores here do not imply faithful color.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/scribble-1color__black__tall.png)

### scribble__half-coloured__tall

All ten outputs interpret the orange scribbles as filled petals rather than reproducing individual
strokes. They retain the flower layout and distinguish the colored left petals from the initially
uncolored right petals. Differences are mainly shading and saturation; no compelling winner.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/scribble__half-coloured__tall.png)

### store__balloon__tall

All variants retain the hot-air balloon, flowers, sun, birds, and clouds. One baseline repeat shifts
the balloon downward and leaves a thin floating ground strip; the new models more consistently
finish the ground wash. Differences among the new models are chiefly lighting and saturation. The
failed baseline first attempt was an API 500; its replacement is shown in sample 1.

[Contact sheet](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/review/store__balloon__tall.png)

## Evidence

* [Interactive image gallery](../../scrapbook/model-eval/report/index.html)

* [first-pass-results.json](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/first-pass-results.json)
* [results.json](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/results.json)
* [comparison-summary.json](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/comparison-summary.json)
* [evaluation-plan.json](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/image25-model-bakeoff/evaluation-plan.json)
