# Idea 22 — Composite view as a first-class tool

**Verdict: WORKED.** `gen:coloring-composite` implemented end-to-end, fully offline (0 Gemini calls), validated byte-for-byte against the ad hoc `lib/night-composite.mjs` usage, and demonstrated on the real gate-override case.

## What was built

`tools/asset-gen/gen-coloring-composite.mjs` — a CLI that writes the **final canvas renders** (light + night) of coloring pages to `.coloring-samples/composite/` (gitignored scratch; `--out DIR` to move). Wired as root script `gen:coloring-composite` with a `scripts-info` entry (ADR-0019 `gen:` namespace) and a local `coloring-composite` alias in `tools/asset-gen/package.json`. Docs touched: `tools/asset-gen/README.md` running list + `pipeline.md`'s "render the composite before burning more attempts" lesson now names the command.

### CLI surface (mirrors the drift audit's selector conventions)

```
npm run gen:coloring-composite -- vehicles/train-wide            # one page, shipped assets
npm run gen:coloring-composite -- farm                           # whole category
npm run gen:coloring-composite -- <page> --source raw            # committed lined raws in fill-src/
npm run gen:coloring-composite -- <page> --source samples        # fresh candidates in .coloring-samples*/
```

### Compositing model (mirrors the contact sheet client + the app)

| Side | Fill state | Composite |
| --- | --- | --- |
| night, lined (raw/candidate) | outlines intact | `lib/night-composite.mjs` `compositeNight()` **verbatim** — chalk-punched fill + screened chalk negation over dark paper. Byte-identical to the gates' simulated composite. |
| night, shipped | fills-only (inpainted punch) | no re-punch (would re-cut the inpaint — the "dotted ring" trap in `docs/inpainted-fill-punch.md`); just the chalk negation screened on top (`compositeNightShipped`, in the CLI). |
| light, lined | outlines intact | binary punch to light paper (`#fcfbf8`) + pen multiplied on top (`compositeLight`, in the CLI — the light twin of the lib's math, matching `--lineart-blend: multiply`). |
| light, shipped | fills-only | pen multiplied over the fill as-is. |

Night line art is the page's `.chalk.webp` with pen fallback (logged as `no chalk (pen)`), matching the canvas's themed overlay swap. Candidate discovery follows the generators' real naming: night `{page}.webp` / `{page}.sample-N.webp` in `.coloring-samples-dark/{cat}/` (skipping `*.input.webp`), light `sample-N.webp` in `.coloring-samples/{rel}/`. Output names never collide across sources: `{cat}-{page}.{light,night}.png` (shipped), `.raw.` infix (raws), `.sample-N`/`.take` (candidates) — an earlier draft silently overwrote shipped outputs with raw ones, exactly the comparison the tool exists for, so the infixes were added.

## Verification

1. **Byte-parity with the ad hoc usage** (the thing being promoted): a temp replica of the historical `node -e` call (`compositeNight(rawNightFill, chalk)` → PNG) sha256-matches the tool's output for all three cases tried:
   - `vehicles/train-wide` raw night: `23ba7c38…` both ways
   - `farm/cat-tall` raw night: `605677c0…` both ways
   - `vehicles/train-wide` candidate sample-1: `6ab26236…` both ways
2. **Shipped vs raw paths agree**: pixel-diff of shipped-path vs raw-path composites is edge-only noise (night meanAbs 0.63–0.67, light 1.47; >8-luma pixels 0.35–2.5%, concentrated on anti-aliased line edges — the expected inpaint-vs-binary-punch difference).
3. **Lint/format clean** (`eslint`, `prettier --check`); `npm run info` lists the new script; unknown page fails cleanly (`No such page: bogus/nope-wide`).
4. **Visual**: all six evidence images render correctly — black pen over daytime fills in light, glowing white chalk over moonlit fills at night, eye whites owned by the chalk.

## Worked gate-override example (train-wide)

Scored offline with the exact `scoreLineColor` math from `gen-coloring-fills-dark.mjs` (bar: median lineWhite ≥ 150):

| Fill | lineWhite | Gate | Composite |
| --- | --- | --- | --- |
| shipped raw `fill-src/vehicles/train-wide.night.raw.webp` | **75** | FAIL | renders perfectly — this is the fill that shipped after ~27 gate-failing attempts (pipeline.md) |
| candidate `.coloring-samples-dark/vehicles/train-wide.sample-1.webp` | **102** | FAIL | `vehicles-train-wide.sample-1.night.webp` — white lines everywhere, dark body reads fine → override justified |
| candidate `…sample-2.webp` | **252** | PASS | also clean |

The dark-bodied train re-inks its own outline copy dark (gate fail), but the punch discards the fill's outline pixels and the chalk owns the lines — so the child never sees the gate's complaint. One `npm run gen:coloring-composite -- vehicles/train-wide --source samples` now answers "override?" in ~2s instead of an ad hoc `node -e`.

## Limitations / notes

- `compositeLight` grayscales the pen before multiplying (as `night-composite.mjs` grayscales the chalk); the canvas multiplies per-channel RGB. Pen/chalk assets are effectively grayscale, so the difference is nil in practice.
- Light candidates path (`.coloring-samples/{rel}/sample-N.webp`) is implemented but was exercised only via directory-shape reasoning + empty-dir skip behavior — no light candidates existed in scratch to composite (night candidates for train-wide did exist and worked).
- Outputs are PNG (what `compositeNight` returns; keeps byte-parity trivial). ~1–2 MB each in disposable scratch; a `--webp` flag would be a cheap follow-up if size matters.
- The lib file stays untouched — deliberate, so gate behavior and the byte-parity contract can't drift. The "shipped" night variant lives in the CLI.
- As predicted by IDEAS.md, this doubles as the harness for ideas #7/#15 (any per-page before/after just runs the tool twice with different `--source`/`--out`).

## Files

- Patch: `code/gen-coloring-composite.patch` (new `tools/asset-gen/gen-coloring-composite.mjs` + root `package.json` script/scripts-info + local alias + README/pipeline.md mentions). Reverse-check verified re-appliable at baseline 8e471b8.
- Evidence: `vehicles-train-wide.{light,night}.webp`, `farm-cat-tall.{light,night}.webp` (shipped composites), `vehicles-train-wide.sample-{1,2}.night.webp` (gate-fail/gate-pass candidate composites).
