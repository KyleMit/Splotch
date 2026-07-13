# ideas-exploration — empirical burn-down of IDEAS.md (2026-07-13)

A frozen snapshot of a 25-subagent exploration session that ran down **every idea
in [`../IDEAS.md`](../IDEAS.md)**, one subagent at a time, from baseline commit
`8e471b8`. Each subagent actually attempted its idea's proposed approach (Gemini
calls included where needed), captured before/after evidence, and **reverted the
repo to pristine before exiting** — so nothing from these experiments is live in
the pipeline. This folder is the complete record, intended for a follow-up
session to review and decide what to promote.

**This folder is not part of the asset pipeline.** Nothing in here is imported
by the generators; the `lib/paths.mjs` and scratch-dir rules in
`../CLAUDE.md` don't apply to these frozen copies.

## How to review

1. Open **`ideas-review.html`** in a browser (self-contained, ~5 MB) — the
   verdict dashboard with before/after image pairs and code for every idea.
   Regenerate it any time with `node build-review.mjs` (reads each
   `idea-N/meta.json`).
2. Per idea, read `idea-N/report.md` for full detail: what was tried, what
   worked, what didn't, limitations, and recommendations. `idea-N/meta.json` is
   the machine-readable summary; evidence images and working code (mostly
   re-appliable `git diff` patches against `8e471b8`) sit beside it.
3. Patches were verified re-appliable at creation time against `8e471b8`; if
   main has moved, expect some fuzz.

## Scoreboard: 24 WORKED · 1 PARTIAL · 0 BLOCKED

| # | Idea | Verdict | Outcome |
|---|------|---------|---------|
| 1 | [Dark-bodied subjects re-ink outlines dark](./idea-1/report.md) | WORKED | Deterministic rim-erase punch extension validated; blanket dilation risky; Gemini edit re-rolls fills |
| 2 | [Whitened-motif inconsistency across sibling pages](./idea-2/report.md) | WORKED | Motif strips confirmed outliers; notes-driven re-chalk matched sibling treatment first try |
| 3 | [Chalk whites the night fill disagrees with](./idea-3/report.md) | WORKED | Offline scorer works; ranking is near-all true positives, a dozen new flags |
| 4 | [Night-sky brightness varies ~4× across the catalog](./idea-4/report.md) | WORKED | Deterministic background-luma normalization hits target exactly with no edge artifacts; regen at ≤50 also works |
| 5 | [De-swirl the two flat-pupil pages](./idea-5/report.md) | WORKED | Deterministic pen-eye surgery fixed caterpillar-wide's flat night pupils end-to-end |
| 6 | [Pen normalization + light-fill regen for dead eyes](./idea-6/report.md) | WORKED | Normalizer + regen (or free re-punch) revives dead light-mode eyes; night untouched |
| 7 | [Catalog-wide residual dark halo audit](./idea-7/report.md) | WORKED | 48s offline auditor ranks all 94 night fills, finds 3 new real halos |
| 8 | [Light↔night palette coherence](./idea-8/report.md) | WORKED | Hue-flip scorer ranks catalog; punched-light-conditioned night regen fixes ant blanket, all gates pass |
| 9 | [Tall↔wide palette coherence for the same subject](./idea-9/report.md) | WORKED | Inventory ranks 46 pairs; text-palette conditioning fixed dragon-wide (53°→11°) |
| 10 | [Per-page notes registry for regen levers](./idea-10/report.md) | WORKED | Registry mined (28 entries), auto-loaded by generators, CLI wins; spider-tall passed first take |
| 11 | [Whiten pen solids out of the chalk keep reference](./idea-11/report.md) | WORKED | Gate fix validated: all 19 overridden chalks now pass, zero regressions, regen passes first try |
| 12 | [Eye detector: side profiles and non-face cores](./idea-12/report.md) | WORKED | All five night false-flags cleared, every true fail retained, fully offline |
| 13 | [Gate colored-shape invention on open background](./idea-13/report.md) | WORKED | Detector works; 11 shipped night fills carry confirmed invented shapes |
| 14 | [Local-warp registration check (shimmer suspect)](./idea-14/report.md) | WORKED | Scorer works; found 4 genuinely warped shipped pages; big-nudge hypothesis refuted |
| 15 | [Punch-inpaint quality on dense line work](./idea-15/report.md) | WORKED | No visible smearing in composites; nearest-bleed vindicated, per-region mean adds fringe risk without benefit |
| 16 | [Night fill as a recolor edit of the light raw](./idea-16/report.md) | PARTIAL | Perfect registration, polarity, and palette coherence, but mood too bright and desaturated |
| 17 | [Model bake-off: flash-image vs pro image tier](./idea-17/report.md) | WORKED | gemini-3.1-flash-image clears all three flash-2.5 failure classes; pro tier drifts |
| 18 | [Deterministic fills: model picks palette, code paints](./idea-18/report.md) | WORKED | End-to-end success: perfect registration, coherent themes, mermaid rivals shipped fill |
| 19 | [Chalk covers + dark-mode thumbnails](./idea-19/report.md) | WORKED | Chalk page thumbs + dark-mode picker swap work end-to-end; covers need 8 Gemini calls |
| 20 | [Upscale / resolution audit vs device DPR](./idea-20/report.md) | WORKED | 1024×1536 adequate; tablets overscale 1.7× but lanczos upscale buys nothing visible |
| 21 | [Before/after contact sheet from git history](./idea-21/report.md) | WORKED | `--source git:<ref>` and `--compare git:<ref>` validated on farm and owl-tall, offline |
| 22 | [Composite view as a first-class tool](./idea-22/report.md) | WORKED | gen:coloring-composite built, byte-identical to ad hoc lib use, gate-override demo works |
| 23 | [Golden-set regression fixtures](./idea-23/report.md) | WORKED | Catalog-wide golden score freeze/diff works: deterministic, ~54s, caught one-page revert |
| 24 | [Complete the orphan pages: heart + umbrella](./idea-24/report.md) | WORKED | Both orphan pages completed end-to-end, all gates green, in 12 Gemini calls |
| 25 | [Light-mode byte-stability check in CI](./idea-25/report.md) | WORKED | Committed sha256 manifest + CI drift check validated in both directions |

## What a follow-up session should probably do first

Ordered by leverage, from the evidence in the reports (not a decree):

1. **Land the gate fixes** — #11 (keep-reference whitening, ~10 lines, unblocks
   19 pages) and #12 (eye-judge false flags) are small patches with
   zero-regression evidence.
2. **Land the safety nets before any regen wave** — #23 (golden scores) and
   #25 (asset sha256 manifest); they were designed to work together (the
   manifest is #23's missing content-hash column).
3. **Trial the model swap (#17)** — `gemini-3.1-flash-image` cleared every
   historical failure class first-take; validate on one full category, then
   make it the default. It likely shrinks the cost of every other regen item.
4. **Ship the finished goods** — #24's heart-wide + umbrella-tall suites are
   complete and gate-green (assets in `idea-24/`), #19's dark-mode thumbs are a
   tiny patch, #10's notes registry prevents every future regen from re-fighting
   old battles.
5. **Work the shipped-defect lists** — #13 found 11 pages with invented shapes,
   #7 found 3 halos, #14 found 4 warped pages, #3 found ~12 chalk/fill
   disagreements: each report carries the exact page lists and crops.

## Cross-cutting learnings (things that surprised us)

Model behavior (`gemini-2.5-flash-image` era, 2026-07):
- **Image-edit always redraws fills/eyes** — surgical "change only X" edits
  don't exist; edits are a regeneration lever (#1, #16).
- **Multi-image conditioning needs the *shipped punched* light fill as the
  reference** — raw black outlines make the model re-ink dark lines 7/7 takes;
  image evidence beats prompt text (#8). Across *different* drawings it copies
  the reference's composition 6/6 — flatten the sibling palette to a text
  COLOR PLAN instead (#9).
- **Recolor edits anchor on the input's brightness** — moonlight prompts can't
  darken a bright input past bgLuma ~68 (#16); edits are near-deterministic, so
  temperature ladders do nothing there.
- `imageSize` is silently ignored by 2.5-flash; the pro tier honors 2K but
  invents geometry and can return gate-passing null-edits (#17, #20).
- The newer `gemini-3.1-flash-image` cleared re-inking, eye-flooding, and
  whitening misfires first-take without notes (#17).

Pipeline truths confirmed or corrected:
- The chalk is the de-facto **human-blessed annotation layer** — the eye judge
  can trust chalk-white-near-core instead of re-deriving what's an eye (#12).
- Night fills comply with the chalk, so "what the fill wanted" signals must
  consult the **light** raw (#3).
- Pen solid blobs are the root cause of most eye failures, and spiral-welded
  eyes additionally collapse `findEyeCores` topology; no gate measures
  spiralness (#5, #6).
- A chalk change **forces** a night-fill regen — the old night raw leaks its
  own whites under the new chalk (#2).
- Invented shapes shipped on 11 night pages and are mostly **pale**, not
  saturated — anchoring (line/border contact), not chroma, is the discriminator
  (#13).
- Big global nudges are rigid translations, not local warp; real warp hides in
  small background decorations (#14).
- The punch's nearest-bleed inpaint is invisible through the composite; don't
  replace it (#15). Lanczos upscaling buys nothing visible either (#20).
- IDEAS.md's own examples were sometimes wrong: square-wide has no bubbles,
  pterodactyl-wide's sun is an outlined gold ring, teddy's bow is coherent, the
  orphan orientations were backwards, train-wide ranks only #33 on halos.

Tooling gotchas for future sessions in this repo:
- sharp: `blur().raw()` on a 1-channel image silently returns 3 channels — use
  `.toColourspace('b-w')`. (Adds to the alpha gotcha already in `../CLAUDE.md`.)
- Ad-hoc scripts importing `../lib/*.mjs` must live inside `tools/asset-gen/`.
- Playwright in the cloud sandbox needs
  `executablePath: /opt/pw-browsers/chromium-*/chrome`; the run-splotch driver
  with `--keep` works for device-emulated measurements (#20, #21).
- The night gates existed only at generation time until #23 extracted them into
  a reusable scoring lib (`idea-23/code/`).

## Folder layout

```
ideas-exploration/
├── README.md            ← this file
├── ideas-review.html    ← self-contained visual dashboard (open in browser)
├── build-review.mjs     ← regenerates ideas-review.html from idea-*/meta.json
└── idea-N/
    ├── report.md        ← full narrative: tried / worked / failed / recommendations
    ├── meta.json        ← machine-readable summary (verdict, images, code index)
    ├── code/            ← working scripts and re-appliable .patch files
    └── *.webp …         ← before/after evidence (≤560 px), plus per-idea extras
                           (idea-24 carries the finished heart-wide/umbrella-tall
                           assets; idea-21 carries generated comparison sheets;
                           idea-23/25 carry golden-scores/manifest snapshots)
```

Session context: run by 25 sequential Claude subagents on branch
`claude/asset-gen-ideas-subagents-gkycf1`; ~90 Gemini image calls total across
the session. The repo tree was verified pristine (`git status --porcelain`
empty) after every idea.
