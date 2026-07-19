# Crayon brush tuning loop

Dev-only tooling used to design the crayon brush (ADR-0065) against real-crayon references. Not part
of CI — run by hand when tuning `web/src/lib/drawing/crayonTexture.ts`. Needs `GEMINI_API_KEY` for
the reference/judge steps. Outputs default to the scratchpad (override with `CRAYON_OUT`).

The crayon render variants are runtime-selectable through the engine dev seam (`setCrayonParams` on
`/dev/engine`), so **one production build renders every variant** — only re-`build` when the texture
*algorithm* changes, not for parameter sweeps (`--set=...`).

| Script              | What it does                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `gen-refs.mjs`      | Generate real-crayon reference photos (single stroke, same-colour overlap, scribble fill) with Gemini.           |
| `render-scenes.mjs` | Render the current crayon into the same scenes over the paper colour. `--variants=waxy,light,bold` `--set=k:v`.  |
| `contact.mjs`       | Stitch reference + renders into side-by-side strips per scene, for a by-eye call. `node contact.mjs waxy light`. |
| `judge.mjs`         | Vision judge (Gemini) scoring a variant's renders vs. the references — a **regression signal, not an oracle**.   |
| `perf.mjs`          | Crayon vs. pen per-op draw cost under a 4× CPU throttle (acceptance: avg ≲ 2ms, no op/frame > ~8ms).             |

Typical loop: `gen-refs` once → edit `crayonTexture.ts` → `render-scenes` → `contact` → eyeball
against the refs (and `judge` as a loose signal) → repeat.
