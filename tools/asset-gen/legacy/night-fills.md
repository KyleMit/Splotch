# Night coloring fills — generation runbook (LEGACY, canonical-eye / single-outline era)

> **RETIRED 2026-07.** This is the night-fill playbook as written before the pen/chalk fork
> (`../docs/pen-chalk-fork.md`). The live runbook — chalk-first flow, current gates, stubborn-page
> levers, ship/wire steps — is **`../pipeline.md`**; this copy is preserved for its era-specific
> knowledge: the canonical-eye recipe, the "eyes are line-art-driven" model, the mermaid saga, and
> the per-page lever history (dog-wide, duck-tall, unicorn-wide). `retouch-line-art.mjs`, referenced
> throughout, also lives in this folder now.

How to generate, review, and ship the dark-mode **night fills** for coloring pages, as practiced in
the single-outline era. Architecture: **ADR-0052**. Owner script:
`tools/asset-gen/gen-coloring-fills-dark.mjs` (still the active generator — its documentation
migrated to `../pipeline.md`).

> **The pen/chalk fork (`../pipeline.md`) changed the front of this flow.** Pages now get a
> dedicated dark-mode CHALK outline (`{page}.chalk.webp`, `npm run gen:coloring-chalk`) with
> deliberate solid whites; the night-fill generator conditions on it and the punch masks the night
> fill with it. Generate the chalk BEFORE the night fill. The "eyes-are-line-art-driven" /
> canonical-eye guidance below predates the fork and applies only to un-chalked categories; the gate
> documentation and the ship/wire steps are still accurate (wire `chalk` orientations in `books.ts`
> alongside `night` —
> `page('nature', 'ant', 'Ant', ['portrait', 'landscape'],
> ['portrait', 'landscape'])`).

## What a night fill is

Dark mode keeps coloring pages on the dark chalkboard (white "chalk" line art on dark paper). The
magic brush then reveals a **pre-colored night fill** — the same page recolored as a cozy moonlit
night scene. Each page ships a fill per orientation:

```
web/static/coloring/{book}/{page}-tall.night.webp    portrait
web/static/coloring/{book}/{page}-wide.night.webp    landscape
```

They parallel the light `.light.webp` fills. Catalog wiring lives in `web/src/lib/state/books.ts`
(`nightImages` on each page); DrawingCanvas picks the night fill in dark mode, else the light fill,
else falls back to the light fill.

## Status

| Category               | Pages                                                                    | Night fills                    |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Space                  | astronaut, meteor, moon, rover, ship, station                            | ✅ shipped (both orientations) |
| Nature                 | ant, bee, caterpillar, ladybug, snail, spider                            | ✅ shipped (both orientations) |
| Farm                   | cat, cow, dog, duck, horse, pig                                          | ✅ shipped (both orientations) |
| Dinosaurs (`dinosaur`) | brachiosaurus, pterodactyl, stegosaurus, trex, triceratops, velociraptor | ✅ shipped (both orientations) |
| Creatures              | dragon, fairy, mermaid, owl, pegasus, unicorn                            | ✅ shipped (both orientations) |
| **Objects**            | apple, balloon, flower, house, teddy                                     | ⬜ TODO                        |
| **Shapes**             | circle, rectangle, square, star, triangle                                | ⬜ TODO                        |
| **Vehicles**           | excavator, fire, garbage, monster, police, train                         | ⬜ TODO                        |

Remaining: 3 categories, 16 pages, 32 fills (~32 Gemini image gens + retries). Be cost-aware; do
**one category at a time** with a review gate.

## The generator

Needs `GEMINI_API_KEY` (set in the cloud env). Writes to the gitignored `.coloring-samples-dark/` —
it does NOT touch shipped assets. Run:

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  tools/asset-gen/gen-coloring-fills-dark.mjs <category|page> [flags]
```

* `farm` — whole category (both orientations)
* `farm --tall` / `farm --wide` — one orientation only (generate `--wide` without retouching good
  `--tall`, etc.)
* `farm/cat-tall` — a single page/orientation
* `--samples N` — N takes per page (for manual comparison)
* `--max-attempts N` (default 3), `--drift-threshold F` (default 0.004), `--night-luma-max F`
  (default 100), `--line-white-min F` (default 150) — retry tuning

It inverts each page to white-on-dark, prompts `gemini-2.5-flash-image` for a night recolor,
registers the result back onto the original outline, and scores it.

### Three automated quality gates (per take, with keep-best-of-N retry)

1. **Drift** (`scoreDrift`) — catches invented shapes. A fill's white pixels are outlines only; any
   *thin* white far from a source line is an invented outline. Clean ≈ 0; reject >
   `--drift-threshold`. (Pale fills like droplets are excluded via an opening, so they don't
   false-flag.)
2. **Night-ness** (`scoreNightness`) — catches a bright/daytime background. Median luma of the true
   background (flood-filled from the border). Good night ≈ 15–50; a daytime "sky blue" reads ~150+.
   Reject > `--night-luma-max`.
3. **Line color** (`scoreLineColor`) — catches DARK outlines. The fill's outlines must stay WHITE
   (in dark mode they sit under the app's white "chalk" line art, so dark re-inked outlines double
   against the chalk and read wrong). Per source-outline pixel, take the brightest fill luma within
   1px and report the median: fully dark-lined fills read ~65–135, white-lined ~154–250. Reject <
   `--line-white-min` (default 150 — the highest cut that still clears the good set's floor). A
   pale, patchy subject (a mostly-white dog with a few dark contours) is the hard case: it can land
   near the boundary, so a flagged page may need a targeted low-temp regen (see step 3) to come back
   cleanly white — eyeball borderline pages in the contact sheet.

Each page retries (rising temperature) until a take passes all three gates, keeping the
least-drifted take that reads as night AND keeps white outlines; it warns (`⚠ still drifting` /
`⚠ too bright/daytime` / `⚠ dark outlines`) if none do — eyeball those in the contact sheet.

### Prompt lessons (already baked into `DARK_FILL_PROMPT`)

* **Night / evening, not daytime.** Deep evening-sky background (midnight blue, indigo, dusk
  purple). Not pitch black *required*, but never bright "sky blue" or white. (Was: a Nature ladybug
  came back a sunny daytime scene.)
* **Natural face/skin/animal colors, never grey.** Keep each subject's own color, only dimmed for
  moonlight — real skin tones for people, real animal coloring for creatures. Do NOT wash faces to a
  chalky/ghostly slate. Only genuinely colorless things (clouds, droplets, steam, star-glow) take a
  soft moonlit tint. (Was: bee / caterpillar / astronaut faces came out ghostly grey.)
* **Eyes are LINE-ART-driven in dark mode — fix the outline, not the fill.** This is the single most
  important eye lesson. In dark mode the reveal is fills-only, so the eye's big dark pupil is
  *punched out* of the fill and the eye is rendered almost entirely by the INVERTED line art. So the
  fill's eye colour barely matters — chasing it (a "brighter iris" prompt, etc.) is a dead end. What
  matters is the eye's shape in the base line art, run through `invert(1)`:
  * **Canonical eye that inverts clean:** a bold SOLID dark pupil filling most of the eye, a thin
    white sclera, **one** clear MEDIUM white catchlight/glare, and **no iris ring**. The invert maps
    solid-pupil → white eyeball, glare → dark pupil, sclera crescent → thin dark rim. Result: a
    lively white eye with a small dark pupil (this is why the unicorn "just works").
  * **The glare is load-bearing** — it becomes the pupil, so it must be present, single, and big
    enough. A pin-dot glare → featureless white blob (mermaid's original bug); an iris ring → a
    bright ring that muddies it; two glares → two pupils.
  * **To fix a broken eye, retouch the LINE ART to the canonical form** with
    `tools/asset-gen/retouch-line-art.mjs` (its default instruction is exactly this recipe: solid
    pupil + one clear glare, no iris — enlarge a too-small glare). Do NOT "open the eye into an
    outlined iris" — that was tried on the mermaid and made it a dark socket. After retouching the
    outline, regenerate the WHOLE related suite from it (light `.light.webp` + night fill +
    thumbnails, both orientations) and re-check the contact sheet **Combined** view in BOTH light
    and dark. Solid-pupil eyes are the normal cute eye in light mode too, so the same fix serves
    both.
* **Outlines stay WHITE, never dark.** The input is a white-line-on-dark drawing, and the model
  likes to "correct" it into a normal black-outline coloring page — re-inking every shape with dark
  strokes. Those dark lines then double against the app's white chalk line art in dark mode. The
  prompt hammers "the outlines are white and must stay bright white"; the `scoreLineColor` gate
  rejects a take whose outlines came back dark. (Was: half of Farm's first batch —
  cat/cow/dog/duck/horse/pig — had dark outlines.)

If a category's renders drift from these, tweak `DARK_FILL_PROMPT` and regenerate — don't hand-fix
images.

## Per-category workflow

1. **Generate** to samples: `... gen-coloring-fills-dark.mjs <category> --max-attempts 4` (give the
   retry loop room to reject dark-outline / daytime takes; the default 3 is a touch tight now that
   three gates run).
2. **Build the contact sheet** and publish it as an Artifact for the user (rebuild it every time you
   touch an asset):
   ```bash
   npm run gen:contact-sheet -- <category> --source samples \
     --out .coloring-samples-dark/<category>-contact-sheet.html
   ```
   Then publish that file with the **Artifact tool** (it embeds images as data URIs, so it renders
   in the sandbox — do NOT hand-composite a PNG). Show the URL. The sheet shows each page's **light
   and night fills side by side** with an **Outline / Color / Combined** toggle (defaults to
   Combined; tap a tile to cycle it individually) — see `contact-sheet.md`. **Always judge on the
   Combined view** — it reproduces the real canvas: the fills-only fill (its own outlines punched
   with the line art as a mask — the same punch asset-gen bakes into shipped fills, see
   `lib/punch-fill.mjs`) under the themed line-art layer over the paper. That punch is what makes
   this `--source samples` review faithful, since fresh takes still carry their own outlines. A fill
   that looks fine in isolation can break once merged, so reviewing the raw fill alone is not
   enough. Also glance at a couple of Combined tiles inline (Read tool) to sanity-check
   faces/eyes/mood.
   * **Eyes gotcha (line-art driven, not the fill):** in dark mode the eye is rendered by the
     `invert(1)`-ed line art (the pupil is punched out of the fills-only reveal), so the fill can't
     fix a bad eye — the base outline has to be right. The reliable eye is the canonical **solid
     pupil + one clear glare, no iris** (see the "Eyes are LINE-ART- driven" prompt lesson above):
     it inverts to a clean white eye with a small dark pupil. Blank-white-blob eyes (mermaid's
     original, glare too small) and dark-socket eyes (mermaid opened-up, near-black iris) are both
     base-line-art problems — **retouch the line art** to the canonical form (see below), don't
     re-roll the fill.

### Retouching the base line art (hard sections)

When a "particularly hard section" of a page can't be rescued downstream — the eyes gotcha above is
the canonical case — edit the base line art itself with `tools/asset-gen/retouch-line-art.mjs`
(Gemini image edit; writes candidates to `.coloring-samples-dark/retouch/`, never touches shipped
assets):

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  tools/asset-gen/retouch-line-art.mjs creatures/mermaid-tall creatures/mermaid-wide --samples 2
```

The default instruction normalizes eyes to the canonical **solid pupil + one clear glare, no iris**
(enlarging a too-small glare) — the form that inverts to a clean eye in dark mode; pass
`--instruction "..."` for a different hard section. **Call it out** — you are changing a shipped
coloring page. Then regenerate the WHOLE related suite from the new outline and re-review in the
contact sheet's Combined view in **both** light and dark (the eye lesson applies to light mode too):

1. Copy the chosen candidate over `web/static/coloring/<cat>/<page>-<orient>.outline.webp`.
2. `node tools/asset-gen/gen-coloring-thumbs.mjs <cat>` (picker thumbnail).
3. `gen-coloring-fills.mjs <cat>/<page>-tall <cat>/<page>-wide` (light `.light.webp` fill).
4. `gen-coloring-fills-dark.mjs <cat>/<page>-tall <cat>/<page>-wide --max-attempts 4`, then copy the
   samples to `fill-src/<cat>/<page>-<orient>.night.raw.webp` and
   `npm run gen:coloring-punch -- <cat>/<page>`.
5. Rebuild the contact sheet `--source shipped`, verify eyes read well in Combined light AND dark,
   then `npm run check:assets && npm run check && npm run test:unit` and commit.

(Fixed Creatures' mermaid tall+wide: the original solid-black eyes had a pin-dot glare → blank white
blobs in dark mode; opening them into an outlined iris then over-corrected to a dark socket. The fix
that stuck was the canonical form — solid pupil + one enlarged glare, no iris — with the whole
light+dark+thumb suite regenerated and verified in Combined light and dark.) 3. **Iterate**:
regenerate any that look off (higher `-t`, or a prompt tweak). Kids' faces and the night background
are the usual issues. For a page the `⚠ dark
   outlines` gate flags, the reliable fix is **more
attempts against a stricter gate** so the retry loop keeps hunting for a genuinely-white take
instead of settling at the boundary:

```bash
... gen-coloring-fills-dark.mjs <cat>/<page>-wide --max-attempts 8 --line-white-min 175
```

That fixed Farm's dog-wide (70→219) and Dinosaurs' velociraptor-wide (70→223) in ≤6 tries each. If
it still comes back dark, try the OPPOSITE lever — a LOW `-t` (≈0.25) keeps the model faithful to
the white-line input where a high temperature makes it re-ink dark (Farm's duck-tall only came white
at `-t 0.25`). Expect roughly one flagged `-wide` page per category; budget for the extra pass.
Borderline-but-light pages (a dim moonlit rim, lineW ≈150) are fine to keep.

If a page still won't clear after both levers, the last resort is **`--dilate-lines N`** — it
thickens the WHITE input lines by N px (a separable max filter) before the model ever sees them, so
a pale subject (whose own light fill tempts the model to re-ink thin outlines dark to define the
body) gets a bold white band that survives as white, and the gate has a wider white target to
sample. `--dilate-lines 2` fixed Creatures' unicorn-wide (a cream unicorn stuck at lineW 138 through
every temperature) in one pass → lineW 218. Pair it with a low `-t` and the strict gate:
`... unicorn-wide -t 0.3 --dilate-lines 2 --max-attempts 6
   --line-white-min 175`. The fill's
outlines come back a touch bolder than an undilated page's — harmless, since they only ever sit
(white) under the app's chalk line art. Reach for it only for the stubborn pale outliers; the
default 0 keeps the input pixel-faithful. 4. **On the user's approval**, ship:

* Copy each fill from samples to its RAW source path in `fill-src/` (strip the sample suffix, add
  `.night.raw`), then punch the shipped fills-only images:
  ```bash
  for p in cat cow dog duck horse pig; do
    cp .coloring-samples-dark/farm/$p-tall.webp tools/asset-gen/fill-src/farm/$p-tall.night.raw.webp
    cp .coloring-samples-dark/farm/$p-wide.webp tools/asset-gen/fill-src/farm/$p-wide.night.raw.webp
  done
  npm run gen:coloring-punch -- farm
  ```
  Never copy a lined fill straight into `web/static/coloring/` — the shipped `.night.webp` must be
  the punched (fills-only) derivation of the raw.
* Wire the catalog in `web/src/lib/state/books.ts` — add the night orientations to each page:
  `page('farm', 'cat', 'Cat', ['portrait', 'landscape'])`.
* `npm run check:assets` (validates every listed fill exists; also gates strip-native-assets). Then
  `npm run check` + `npm run test:unit`.

5. **Verify live** (optional but recommended) with the `run-splotch` skill: dark mode, apply a page,
   magic-brush reveal — confirm the night fill loads.
6. **Commit + push**, then tell the user it's live. Move to the next category.

## Verification commands

```bash
npm run check          # svelte-check (0 errors)
npm run check:assets   # every catalog asset exists; native-strip parity
npm run test:unit      # includes books/coloringBook night-fill tests
```

## Notes

* `.coloring-samples-dark/` is gitignored — never commit samples. What gets committed: the raw fills
  in `tools/asset-gen/fill-src/**/*.night.raw.webp`, their punched
  `web/static/coloring/**/*.night.webp` derivations, and the `books.ts` wiring.
* No thumbnails for night fills (they're never in the picker grid, like `.light.webp`).
  `bookAssetPaths()` already lists them for check-assets.
* Light mode must stay byte-identical throughout.
* Gemini occasionally 503s ("high demand") — just re-run the failed page.
* Git: develop on the feature branch, `git push -u origin <branch>`; commit messages end with the
  `Co-Authored-By:` / `Claude-Session:` footers per repo convention. Don't open a PR unless asked.
