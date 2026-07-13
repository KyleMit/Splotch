# Idea #10 — Per-page notes registry so regens don't rediscover levers

**Verdict: WORKED.** The registry was mined from real history (28 entries across all 8 categories),
the read path was implemented in the two lever-heavy generators (`gen-coloring-fills-dark.mjs`,
`gen-coloring-chalk.mjs`) with a `--dry-run` provenance mode, CLI-wins merging was demonstrated, and
a single real Gemini call proved the loop end-to-end: `nature/spider-tall` — the page that
historically burned ~26 attempts before the "eyes are the star" note was discovered — regenerated
with the registry note auto-injected and passed every gate on the FIRST take (drift 0.0000, bgLuma
23, lineW 246).

## 1. The mined lever inventory

Sources: `git log` full commit bodies (the levers live almost entirely in commit messages),
`pipeline.md` (Stage 1 gate 6, Stage 4 "Levers for stubborn pages", the status-table batch lessons),
and the validated levers from sibling idea-runs #2/#5/#6.

A key finding while mining: **the original `--notes` strings are gone.** Commits and pipeline.md
quote fragments ("THE EYES ARE THE STAR", "the sky has three clouds", "there are no eyes in the
image to edit") but never the full flag value — exactly the loss this registry exists to stop.
Reconstructed strings are marked as such in each entry's `why`.

Entries by category (page → tool → lever):

| Page                                                    | Tool            | Lever                                                                                                                                       | Source                                                       |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| nature/spider-tall                                      | night           | notes "THE EYES ARE THE STAR…" + max-attempts 6                                                                                             | d96ae6f, pipeline.md lever 4; ~26 attempts pre-notes         |
| nature/ladybug-tall                                     | night           | notes "paint every shell circle deep near-black"                                                                                            | pipeline.md lever 4, d96ae6f                                 |
| nature/ladybug-tall                                     | chalk           | t 0.2 + shell-spots-stay-black note                                                                                                         | e99fd22 (orientation not recorded — flagged in why)          |
| nature/caterpillar-tall                                 | normalize       | t 0.2 + "CHANGE NOTHING ELSE ANYWHERE"                                                                                                      | pipeline.md Stage 1 gate 6, 551ab52                          |
| nature/bee-tall                                         | normalize       | t 0.7 + eye-specific note (reconstructed)                                                                                                   | pipeline.md gate 6, 6840bba                                  |
| nature/bee-wide                                         | normalize       | notes "the sky has THREE CLOUDS"                                                                                                            | pipeline.md (deleted-cloud regression)                       |
| nature/caterpillar-wide                                 | night+normalize | review: spiral-catchlight flat pupil; don't burn attempts — de-swirl the pen (idea #5); normalizer needs --force                            | 8e02fd5, idea-run #5                                         |
| nature/ladybug-wide                                     | night           | review: one-stroke spirals incl. outer ring — idea-#5 surgery does NOT apply                                                                | 8e02fd5, idea-run #5                                         |
| vehicles/train-wide                                     | night           | review: dark body defeats scoreLineColor (lineW 51–105 through ~27 attempts of EVERY lever); render `lib/night-composite.mjs` early instead | 7a9ca89, d652c15                                             |
| vehicles/police-tall, -wide                             | chalk           | review: whitened-windshield/hub keep blind spot → overlay-verify + hand-ship                                                                | b8bbe8c                                                      |
| vehicles/monster-wide, fire-tall                        | night           | review: flat-eye false positives on hubs/grilles/roof lights                                                                                | 7a9ca89                                                      |
| objects/house-wide                                      | chalk           | notes "this scene has NO EYES — expected" (reconstructed)                                                                                   | 46daba9 + 6f6e223 ("there are no eyes in the image to edit") |
| objects/teddy-wide                                      | chalk           | t 0.3 + max-attempts 6                                                                                                                      | 6f6e223                                                      |
| objects/teddy-tall                                      | normalize       | notes naming the STAR motif (first attempt deleted it, worst-tile 0%)                                                                       | idea-run #6                                                  |
| objects/flower-tall                                     | chalk           | t 0.3 + attempts 6; review: expect worst-tile ~75% confined to whitened pupils                                                              | 4fff334                                                      |
| objects/apple-tall                                      | night           | t 0.3 + line-white-min 175 + max-attempts 8 (lineW 94→255)                                                                                  | dc20072                                                      |
| farm/dog-wide                                           | night           | max-attempts 8 + line-white-min 175 (70→219)                                                                                                | pipeline.md lever 1                                          |
| farm/duck-tall                                          | night           | t 0.25 (only came white at low temp)                                                                                                        | pipeline.md lever 2                                          |
| farm/duck-wide                                          | night           | review: 1-core flat-eye flag = verified false positive                                                                                      | 6a95c46                                                      |
| farm/cat-tall, dog-tall                                 | chalk           | review: whitened-pupil keep blind spot                                                                                                      | 46bc770                                                      |
| dinosaur/velociraptor-wide                              | night           | max-attempts 8 + line-white-min 175 (70→223)                                                                                                | pipeline.md lever 1                                          |
| dinosaur/trex-wide                                      | night           | t 0.3 (low-temp drift retry; exact value reconstructed)                                                                                     | f50d69d                                                      |
| dinosaur/pterodactyl-tall, trex-tall                    | chalk           | review: whitened sun/teeth/mouth blind spot                                                                                                 | 660ffd5                                                      |
| creatures/unicorn-wide                                  | night           | **retry** (not auto-applied): dilate-lines 2 + t 0.3 + line-white-min 175 — passed clean in the chalk-era regen, so it's an escalation      | pipeline.md lever 3, dee2966                                 |
| creatures/owl-tall, owl-wide, dragon-tall, unicorn-tall | chalk           | review: deliberate-whitening keep blind spot                                                                                                | 6e3f14f                                                      |
| shapes/`*` (wildcard)                                   | chalk           | review: giant-pupil keep blind spot applies category-wide                                                                                   | 52c7853                                                      |
| shapes/rectangle-wide                                   | chalk           | t 0.25 + "the circles are BUBBLES, not eyes… match rectangle-tall"                                                                          | 52c7853 + idea-run #2 (one-attempt convergence re-validated) |
| space/rover-tall                                        | night           | t 0.3 (low-temp drift retry, 0.0044→0.0032; value reconstructed)                                                                            | f1230d2                                                      |
| space/rover-wide                                        | night           | review: flat-eye false positive on the screen-face                                                                                          | f1230d2                                                      |
| space/moon-tall                                         | chalk           | review: worst-tile ~78% blind spot (eyes + teeth)                                                                                           | 3f838ce                                                      |

## 2. Format decision: per-category `fill-src/<cat>/notes.json`

Chosen: **one JSON file per category in `fill-src/<cat>/`**, over per-page YAML frontmatter and over
a single repo-wide registry.

* **Frontmatter is a non-starter**: pages are `.webp` binaries — there is no per-page text file to
  host frontmatter, so "frontmatter" really means inventing a sidecar file per page (~96 new files).
  One file per category is 8 files.
* **JSON over YAML**: the repo has no YAML runtime dependency, and `tools/asset-gen/CLAUDE.md`
  forbids adding deps to this folder (ADR-0029 flat root `node_modules`). `JSON.parse` is free; the
  repo's config surface (package.json, capacitor.config.json) is JSON already.
* **`fill-src/` is the right home**: committed, never shipped, already organized per category, and
  already the "source of truth the generators read" (the raws). The levers are generation inputs, so
  they live beside the generation sources.
* **Per-category over repo-wide**: diffs stay local to the category being worked, matching the
  pipeline's "one category per pass" discipline.

Schema (documented in `lib/page-notes.mjs`):

```
{ "<page>" | "*": { "night"|"chalk"|"normalize"|"light": {
    "flags":  { "<exact-cli-long-option>": value },  // auto-applied; CLI wins
    "retry":  { ... },                               // escalation recipe — printed, never auto-applied
    "review": "…",                                   // what the human gate should expect
    "why":    "…"                                    // provenance (commit/doc/idea-run)
} } }
```

Design points that emerged from the mining:

* **Keyed by exact CLI long-option names** so the merge is mechanical — no per-option mapping table
  to maintain, and any future flag works in the registry automatically.
* **Not every lever is a flag.** train-wide's lever is *procedural* ("stop burning attempts, render
  the composite"); the blind-spot pages' lever is a *review expectation* ("this warning is
  acceptable if the overlay shows X"). Hence `review` (free text, surfaced in the log) distinct from
  `flags`.
* **`retry` vs `flags`**: unicorn-wide's dilate-lines recipe was needed pre-fork but the chalk-era
  regen passed clean — auto-applying it would silently change the model input for no reason. `retry`
  prints the recipe without applying it.
* **`"*"` wildcard** for category-wide facts (shapes' giant-pupil keep blind spot); page entries
  deep-merge over it.

## 3. The read path

New `lib/page-notes.mjs` (~100 lines): `pageLevers(rel, tool)` loads and caches the category
registry, merges `*` + page entries; `mergeFlags(cliValues, levers)` fills in only options the CLI
left unset (registry values normalized to the strings `parseArgs` would produce, so the existing
`Number()` coercion/validation paths are untouched); `describeLevers(...)` prints every resolved
setting tagged `[cli]` / `[notes.json]` / `[default]` plus retry/review/why.

Patched generators:

* **`gen-coloring-fills-dark.mjs`** — the global option-coercion block became a per-page
  `nightSettings()` (defaults < notes.json < CLI, validated per page with a source-naming error
  message); `generateCleanTake`/`generateDarkPage`/`toDarkInput` take the per-page cfg instead of
  module globals; added `--dry-run` (prints resolved levers, no API key needed).
* **`gen-coloring-chalk.mjs`** — same restructure (`chalkSettings()`, per-page instruction with
  notes appended, `passes`/`rank`/warnings take cfg); `--dry-run` prints before the "already
  shipped" skip so shipped pages can be inspected too.
* CLI-level validation still runs once up front, so a bad explicit flag fails fast; a bad registry
  value fails with `(<page> via notes.json)` context.

Not patched (deliberately, time-boxed): `gen-coloring-fills.mjs` (light) exposes only `--samples/-t`
today — no notes flag exists to merge into; the `light` tool key is reserved for when it grows one.
`normalize-outline-strokes.mjs` would take the identical ~15-line treatment (its `normalize` entries
are already in the registry as data).

## 4. Evidence — dry-run and live transcripts

The three named pages (spider-tall/train-wide via the night generator, house-wide via chalk):

```
$ node tools/asset-gen/gen-coloring-fills-dark.mjs nature/spider-tall vehicles/train-wide --dry-run
nature/spider-tall levers:
  temperature = 0.6  [default]
  max-attempts = 6  [notes.json]
  drift-threshold = 0.004  [default]
  night-luma-max = 100  [default]
  line-white-min = 150  [default]
  dilate-lines = 0  [default]
  notes = "THE EYES ARE THE STAR OF THIS PAGE. The spider's body is dark, but ev..."  [notes.json]
  why: Dark-bodied subject: the model floods the eyes navy without the note ...
vehicles/train-wide levers:
  temperature = 0.6  [default]
  ... (all defaults — this page's lever is procedural, not a flag)
  review: Dark-bodied subject that DEFEATS the line-color gate without being wr...
  why: commits 7a9ca89 + d652c15; pipeline.md status-table lesson 'Dark-bodi...

$ node tools/asset-gen/gen-coloring-chalk.mjs objects/house-wide shapes/rectangle-wide shapes/circle-wide --dry-run
objects/house-wide levers:
  temperature = 0.35  [default]   max-attempts = 4  [default]  ...
  notes = "This scene has NO EYES — that is expected and correct, not a problem ..."  [notes.json]
shapes/rectangle-wide levers:
  temperature = 0.25  [notes.json]
  notes = "The circles floating around the rectangle are BUBBLES, not eyes — do ..."  [notes.json]
  review: Shapes' 'geometric solids' are giant cartoon pupils: most pages fail ...   <- "*" wildcard
shapes/circle-wide levers:
  temperature = 0.35  [default]  ...
  review: Shapes' 'geometric solids' are giant cartoon pupils: ...               <- wildcard only
```

CLI-wins precedence:

```
$ node ...fills-dark.mjs nature/spider-tall --dry-run --notes "CLI OVERRIDE NOTE" --max-attempts 2
  max-attempts = 2  [cli]
  notes = "CLI OVERRIDE NOTE"  [cli]
```

Category batch (farm --wide): dog-wide picks up `max-attempts 8 / line-white-min 175` from the
registry, its siblings run pure defaults, duck-wide surfaces only its false-positive review note.

Live end-to-end (the one Gemini call spent):

```
$ node tools/asset-gen/gen-coloring-fills-dark.mjs nature/spider-tall --max-attempts 1
nature/spider-tall levers:
  max-attempts = 1  [cli]
  notes = "THE EYES ARE THE STAR OF THIS PAGE. ..."  [notes.json]
nature/spider-tall ... ok  shift -1,0  drift 0.0000 bgLuma 23 lineW 246  -> .coloring-samples-dark/nature/spider-tall.webp
Done.
```

First take, all gates green, eyes lively — with zero levers typed on the command line, on the page
whose note took ~26 attempts to discover originally.

## 5. What didn't work / limitations

* **Verbatim history is unrecoverable.** No commit preserves a full `--notes` string; 4 of the ~14
  flag entries are reconstructions (marked in `why`). The registry fixes this class of loss going
  forward but the reconstructed strings should be treated as first drafts, not gospel.
* **Two orientation/value ambiguities** in the record: which ladybug the e99fd22 chalk note
  targeted, and the exact temperatures of the rover-tall/trex-wide "low-temp retries" (reconstructed
  as 0.3 from the pipeline's documented lever range).
* **The light generator can't consume its registry section yet** — it has no `--notes` /
  gate-override flags at all. Idea #9's per-part COLOR PLAN would land there; the `light` key is
  reserved for it.
* **`retry` recipes are print-only.** Auto-escalating (apply `retry` when the default pass fails) is
  the obvious next step but changes attempt-budget semantics, so it was left manual.
* **Not validated on the normalizer** (same mechanical patch, not applied within the time-box).
* Registry `review`/`why` text duplicates some pipeline.md prose; if adopted, pipeline.md's per-page
  war stories could be *replaced by* pointers to notes.json (single source of truth).

## 6. Recommendations

1. Adopt as-is: apply `code/notes-registry.patch` (verified `git apply --check` clean on 8e471b8),
   which carries the lib, both generator patches, and all 8 registry files.
2. Extend the same read-path to `normalize-outline-strokes.mjs`; give `gen-coloring-fills.mjs` a
   `--notes` flag and wire the `light` section (idea #9 needs it).
3. Make it process: pipeline.md's shipping runbook should say "when a page needs a lever, record it
   in `fill-src/<cat>/notes.json` in the same commit" — the registry only stays alive if writing it
   is part of shipping.
4. Consider a follow-up `--escalate` mode that applies `retry` recipes automatically when the
   default pass fails all attempts.

## Files

* `code/notes-registry.patch` — full re-appliable git diff (lib + 2 generators + 8 registries)
* `code/page-notes.mjs` — the registry loader/merger (also inside the patch)
* `code/registry/*.notes.json` — the 8 mined registry files (also inside the patch)

Gemini calls used: 1 of 4. Repo left pristine (`git status --porcelain` empty; the generated sample
lives in gitignored `.coloring-samples-dark/`).
