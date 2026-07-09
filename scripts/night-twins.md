# Night coloring twins — generation runbook

How to generate, review, and ship the dark-mode **night twins** for coloring
pages. Architecture (why they exist, how they render) lives in **ADR-0052**; this
is the operational playbook. Owner script: `scripts/gen-coloring-fills-dark.mjs`.

## What a night twin is

Dark mode keeps coloring pages on the dark chalkboard (white "chalk" line art on
dark paper). The magic brush then reveals a **pre-colored night twin** — the same
page recolored as a cozy moonlit night scene. Each page ships a twin per
orientation:

```
web/static/coloring/{book}/{page}-tall.night.webp    portrait
web/static/coloring/{book}/{page}-wide.night.webp    landscape
```

They parallel the light `.color.webp` twins. Catalog wiring lives in
`web/src/lib/state/books.ts` (`nightImages` on each page); DrawingCanvas picks the
night twin in dark mode, else the light twin, else falls back to the light twin.

## Status

| Category | Pages | Night twins |
| --- | --- | --- |
| Space | astronaut, meteor, moon, rover, ship, station | ✅ shipped (both orientations) |
| Nature | ant, bee, caterpillar, ladybug, snail, spider | ✅ shipped (both orientations) |
| Farm | cat, cow, dog, duck, horse, pig | ✅ shipped (both orientations) |
| Dinosaurs (`dinosaur`) | brachiosaurus, pterodactyl, stegosaurus, trex, triceratops, velociraptor | ✅ shipped (both orientations) |
| Creatures | dragon, fairy, mermaid, owl, pegasus, unicorn | ✅ shipped (both orientations) |
| **Objects** | apple, balloon, flower, house, teddy | ⬜ TODO |
| **Shapes** | circle, rectangle, square, star, triangle | ⬜ TODO |
| **Vehicles** | excavator, fire, garbage, monster, police, train | ⬜ TODO |

Remaining: 3 categories, 16 pages, 32 twins (~32 Gemini image gens + retries). Be
cost-aware; do **one category at a time** with a review gate.

## The generator

Needs `GEMINI_API_KEY` (set in the cloud env). Writes to the gitignored
`.coloring-samples-dark/` — it does NOT touch shipped assets. Run:

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  scripts/gen-coloring-fills-dark.mjs <category|page> [flags]
```

- `farm` — whole category (both orientations)
- `farm --tall` / `farm --wide` — one orientation only (generate `--wide` without
  retouching good `--tall`, etc.)
- `farm/cat-tall` — a single page/orientation
- `--samples N` — N takes per page (for manual comparison)
- `--max-attempts N` (default 3), `--drift-threshold F` (default 0.004),
  `--night-luma-max F` (default 100), `--line-white-min F` (default 150) — retry tuning

It inverts each page to white-on-dark, prompts `gemini-2.5-flash-image` for a
night recolor, registers the result back onto the original outline, and scores it.

### Three automated quality gates (per take, with keep-best-of-N retry)

1. **Drift** (`scoreDrift`) — catches invented shapes. A twin's white pixels are
   outlines only; any *thin* white far from a source line is an invented outline.
   Clean ≈ 0; reject > `--drift-threshold`. (Pale fills like droplets are excluded
   via an opening, so they don't false-flag.)
2. **Night-ness** (`scoreNightness`) — catches a bright/daytime background. Median
   luma of the true background (flood-filled from the border). Good night ≈ 15–50;
   a daytime "sky blue" reads ~150+. Reject > `--night-luma-max`.
3. **Line color** (`scoreLineColor`) — catches DARK outlines. The twin's outlines
   must stay WHITE (in dark mode they sit under the app's white "chalk" line art, so
   dark re-inked outlines double against the chalk and read wrong). Per source-outline
   pixel, take the brightest twin luma within 1px and report the median: fully
   dark-lined twins read ~65–135, white-lined ~154–250. Reject < `--line-white-min`
   (default 150 — the highest cut that still clears the good set's floor). A pale,
   patchy subject (a mostly-white dog with a few dark contours) is the hard case: it
   can land near the boundary, so a flagged page may need a targeted low-temp regen
   (see step 3) to come back cleanly white — eyeball borderline pages in the gallery.

Each page retries (rising temperature) until a take passes all three gates, keeping the
least-drifted take that reads as night AND keeps white outlines; it warns
(`⚠ still drifting` / `⚠ too bright/daytime` / `⚠ dark outlines`) if none do — eyeball
those in the gallery.

### Prompt lessons (already baked into `DARK_FILL_PROMPT`)

- **Night / evening, not daytime.** Deep evening-sky background (midnight blue,
  indigo, dusk purple). Not pitch black *required*, but never bright "sky blue" or
  white. (Was: a Nature ladybug came back a sunny daytime scene.)
- **Natural face/skin/animal colors, never grey.** Keep each subject's own color,
  only dimmed for moonlight — real skin tones for people, real animal coloring for
  creatures. Do NOT wash faces to a chalky/ghostly slate. Only genuinely colorless
  things (clouds, droplets, steam, star-glow) take a soft moonlit tint. (Was: bee /
  caterpillar / astronaut faces came out ghostly grey.)
- **Eyes stay bright and sparkly — the two failure modes.** Eyes are the hardest thing
  to get right in a dark recolor, and they fail in opposite directions:
  (a) too DARK — the model fills a whole eye with one dark color (navy-on-navy) and it
  reads as an empty socket (dragon-tall's first take); (b) after opening the eye up, the
  model paints a huge NEAR-BLACK iris that fills the big cartoon eye, so it's *still* a
  dark hole (mermaid, "scary/sickly"). The prompt now spells out three tones brightest→
  darkest — a generous light off-white sclera, a LUMINOUS jewel-tone iris that pops
  against the night (not near-black, not the background tone), and only a small dark
  pupil + catchlight — so big eyes sparkle instead of sinking. Always confirm eyes on the
  gallery's **Combined** view, not the raw twin.
- **Outlines stay WHITE, never dark.** The input is a white-line-on-dark drawing, and
  the model likes to "correct" it into a normal black-outline coloring page — re-inking
  every shape with dark strokes. Those dark lines then double against the app's white
  chalk line art in dark mode. The prompt hammers "the outlines are white and must stay
  bright white"; the `scoreLineColor` gate rejects a take whose outlines came back dark.
  (Was: half of Farm's first batch — cat/cow/dog/duck/horse/pig — had dark outlines.)

If a category's renders drift from these, tweak `DARK_FILL_PROMPT` and regenerate —
don't hand-fix images.

## Per-category workflow

1. **Generate** to samples: `... gen-coloring-fills-dark.mjs <category> --max-attempts 4`
   (give the retry loop room to reject dark-outline / daytime takes; the default 3 is
   a touch tight now that three gates run).
2. **Build a review gallery** and publish it as an Artifact for the user:
   ```bash
   node --experimental-strip-types --disable-warning=ExperimentalWarning \
     scripts/night-twins-gallery.mjs <category> --source samples \
     --out .coloring-samples-dark/<category>-gallery.html
   ```
   Then publish that file with the **Artifact tool** (it embeds images as data
   URIs, so it renders in the sandbox — do NOT hand-composite a PNG). Show the URL.
   The sheet has a **Light/Dark** toggle (defaults to Dark) and a per-tile
   **Color / Outline / Combined** toggle. **Always judge on the Combined view** — it
   reproduces the real canvas: the fills-only twin (its own outlines punched with the
   line art as a mask, exactly like `magicBrush.buildFillsSheet`) under the themed
   line-art layer over the paper. A twin that looks fine in isolation can break once
   merged, so reviewing the raw twin alone is not enough. Also glance at a couple of
   Combined tiles inline (Read tool) to sanity-check faces/eyes/mood.
   - **Eyes gotcha (line-art driven, not the twin):** in dark mode the line art is
     `invert(1)`-ed, so any SOLID-BLACK-filled feature in the base line art — most
     often eyes drawn as filled black ovals — turns solid WHITE, and the fills-only
     reveal punches that region out of the twin, so the twin can't fix it. Those pages
     render as blank white eyes (Creatures' mermaid-wide). Pages whose eyes are drawn as
     OUTLINES with a light interior (dragon) are fine — the twin fills a dark pupil that
     survives. A blown-out eye is a base-line-art problem; regenerating the twin won't
     change it. The fix is to **retouch the line art** (see below), not to re-roll the twin.

### Retouching the base line art (hard sections)

When a "particularly hard section" of a page can't be rescued downstream — the eyes
gotcha above is the canonical case — edit the base line art itself with
`scripts/retouch-line-art.mjs` (Gemini image edit; writes candidates to
`.coloring-samples-dark/retouch/`, never touches shipped assets):

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  scripts/retouch-line-art.mjs creatures/mermaid-tall creatures/mermaid-wide --samples 2
```

The default instruction opens solid-black eyes into outlined coloring-book eyes; pass
`--instruction "..."` for anything else. **Call it out** — you are changing a shipped
coloring page. Then regenerate the WHOLE related suite from the new outline and re-review
in the contact sheet's Combined view in **both** light and dark (the eye lesson applies
to light mode too):

1. Copy the chosen candidate over `web/static/coloring/<cat>/<page>-<orient>.webp`.
2. `node scripts/gen-coloring-thumbs.mjs <cat>` (picker thumbnail).
3. `gen-coloring-fills.mjs <cat>/<page>-tall <cat>/<page>-wide` (light `.color.webp`).
4. `gen-coloring-fills-dark.mjs <cat>/<page>-tall <cat>/<page>-wide --max-attempts 4`,
   then copy the samples to `…/<page>-<orient>.night.webp`.
5. Rebuild the gallery `--source shipped`, verify eyes read well in Combined light AND
   dark, then `npm run check:assets && npm run check && npm run test:unit` and commit.

(Fixed Creatures' mermaid tall+wide: solid-black eyes → open outlined eyes, whole
light+dark+thumb suite regenerated.)
3. **Iterate**: regenerate any that look off (higher `-t`, or a prompt tweak). Kids'
   faces and the night background are the usual issues. For a page the `⚠ dark
   outlines` gate flags, the reliable fix is **more attempts against a stricter gate**
   so the retry loop keeps hunting for a genuinely-white take instead of settling at
   the boundary:
   ```bash
   ... gen-coloring-fills-dark.mjs <cat>/<page>-wide --max-attempts 8 --line-white-min 175
   ```
   That fixed Farm's dog-wide (70→219) and Dinosaurs' velociraptor-wide (70→223) in
   ≤6 tries each. If it still comes back dark, try the OPPOSITE lever — a LOW `-t`
   (≈0.25) keeps the model faithful to the white-line input where a high temperature
   makes it re-ink dark (Farm's duck-tall only came white at `-t 0.25`). Expect
   roughly one flagged `-wide` page per category; budget for the extra pass.
   Borderline-but-light pages (a dim moonlit rim, lineW ≈150) are fine to keep.

   If a page still won't clear after both levers, the last resort is
   **`--dilate-lines N`** — it thickens the WHITE input lines by N px (a separable
   max filter) before the model ever sees them, so a pale subject (whose own light
   fill tempts the model to re-ink thin outlines dark to define the body) gets a bold
   white band that survives as white, and the gate has a wider white target to
   sample. `--dilate-lines 2` fixed Creatures' unicorn-wide (a cream unicorn stuck at
   lineW 138 through every temperature) in one pass → lineW 218. Pair it with a low
   `-t` and the strict gate: `... unicorn-wide -t 0.3 --dilate-lines 2 --max-attempts 6
   --line-white-min 175`. The twin's outlines come back a touch bolder than an
   undilated page's — harmless, since they only ever sit (white) under the app's chalk
   line art. Reach for it only for the stubborn pale outliers; the default 0 keeps the
   input pixel-faithful.
4. **On the user's approval**, ship:
   - Copy each twin from samples to the shipped path (strip the sample suffix, add
     `.night`):
     ```bash
     for p in cat cow dog duck horse pig; do
       cp .coloring-samples-dark/farm/$p-tall.webp web/static/coloring/farm/$p-tall.night.webp
       cp .coloring-samples-dark/farm/$p-wide.webp web/static/coloring/farm/$p-wide.night.webp
     done
     ```
   - Wire the catalog in `web/src/lib/state/books.ts` — add the night orientations to
     each page: `page('farm', 'cat', 'Cat', ['portrait', 'landscape'])`.
   - `npm run check:assets` (validates every listed twin exists; also gates
     strip-native-assets). Then `npm run check` + `npm run test:unit`.
5. **Verify live** (optional but recommended) with the `run-splotch` skill: dark
   mode, apply a page, magic-brush reveal — confirm the night twin loads.
6. **Commit + push**, then tell the user it's live. Move to the next category.

## Verification commands

```bash
npm run check          # svelte-check (0 errors)
npm run check:assets   # every catalog asset exists; native-strip parity
npm run test:unit      # includes books/coloringBook night-twin tests
```

## Notes

- `.coloring-samples-dark/` is gitignored — never commit samples. Only the shipped
  `web/static/coloring/**/*.night.webp` + the `books.ts` wiring get committed.
- No thumbnails for night twins (they're never in the picker grid, like
  `.color.webp`). `bookAssetPaths()` already lists them for check-assets.
- Light mode must stay byte-identical throughout.
- Gemini occasionally 503s ("high demand") — just re-run the failed page.
- Git: develop on the feature branch, `git push -u origin <branch>`; commit
  messages end with the `Co-Authored-By:` / `Claude-Session:` footers per repo
  convention. Don't open a PR unless asked.
