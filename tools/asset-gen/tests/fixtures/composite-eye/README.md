# composite-eye fixtures

Inputs for `tools/asset-gen/tests/composite-eye.test.mjs` — the `(comp, light, pen)` trio
`scoreCompositeEyes(comp, light, pen)` consumes, one set per page. Stored full-resolution as
quality-90 webp: the detector's eye finder is native-resolution bound (downscaling or cropping loses
the eye — verified), but native lossy webp holds every verdict with margin. `manifest.json` lists
each fixture's source page, expected verdict, and measured `coreDarkFrac`.

| fixture            | source                      | expect    | why it's here                                                        |
| ------------------ | --------------------------- | --------- | -------------------------------------------------------------------- |
| `stegosaurus-tall` | `dinosaur/stegosaurus-tall` | blank orb | the original solid-pen band-blind orb the gate was built for         |
| `horse-tall`       | `farm/horse-tall`           | blank orb | a chalk-whitened ringed orb — a second, distinct blank-orb mechanism |
| `unicorn-tall`     | `creatures/unicorn-tall`    | legible   | small-pupil/big-sclera eye the first detector over-flagged           |
| `owl-tall`         | `creatures/owl-tall`        | legible   | an eye an earlier reviewer wrongly called a real defect              |
| `square-tall`      | `shapes/square-tall`        | legible   | legible cartoon shape-face eyes                                      |

## Provenance of the two blank-orb cases

They are the **pre-fix** night eyes, recovered from git history (their fixed versions ship today):

* `stegosaurus-tall`: night raw + chalk at `e05696e^` (the night-only PR-#142 regen that left the
  orb, before the chalk erase-and-redraw fixed it).
* `horse-tall`: night raw + chalk at `868c9c7^` (before the chalk + night regen).

Each page's `*.outline.webp` (pen) and `*.light.raw.webp` were unchanged by those fixes, so the
current committed ones compose correctly with the recovered night+chalk.

## Rebuilding

Recover the two pre-fix night+chalk pairs from the SHAs above into a scratch dir, then composite
each with its page's current pen/light and re-encode the trio at q90 (the legible pages use current
shipped assets directly). The builder used to generate this set is small and offline — reconstruct
it from the recovery commands above and `compositeNight` + `scoreCompositeEyes`; verify every
fixture still matches `manifest.json`'s `expectBlankOrb` before committing.
