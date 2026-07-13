# Idea #11 — Whiten pen solids out of the chalk keep reference

**Verdict: WORKED.** The gate blind spot is real, the fix is a ~10-line change to
`tools/asset-gen/gen-coloring-chalk.mjs` reusing existing `lib/solid-regions.mjs` machinery, and
offline re-scoring of the whole 94-page catalog validates it with zero regressions. A live regen of
the worst page (`shapes/circle-tall`) then passed the fixed gate on the **first Gemini attempt** — a
page that could never pass before and shipped by hand-`cp` at 49.7%.

## 1. The blind spot, confirmed

Gate 1 of the chalk generator scores `outlineMatch(pen, candidate)` — every pen ink pixel must be
covered by chalk ink within ±2px, globally (`keep >= 92%`) and in the worst 8x8 tile
(`localKeep >= 80%`).

Polarity: the chalk is stored ink-on-white. A pen page with a **solid black pupil** (accident-era
art; ideas #5/#6 showed these blobs are the root cause of several eye failures) demands ink across
the whole blob. But the chalk's *job* is to whiten that blob into sclera + outlined pupil — leaving
the pupil interior **non-ink** (black board at night). Every correctly-whitened pupil therefore
reads as a disc of "lost ink" concentrated in one tile, and `localKeep` tanks. The overlay evidence
(`shapes-circle-tall-overlay-before.webp`) shows exactly this: solid red discs inside both eyes,
nothing else wrong on the page.

## 2. The fix

Mirror what `normalize-outline-strokes.mjs` already does for its own gate: build the keep
**reference** by whitening the pen's solid interiors while keeping a ~6px boundary rim
(`whitenSolidRegions` + `scoreSolidity` from `lib/solid-regions.mjs`). The rim still demands the
chalk trace the pupil's *outline*; only the interior — whose removal is the goal — is exempted. The
enclosure, white-budget, and eye-polarity gates still judge against the raw pen (the chalk's new
sclera ink lands inside a pen-bounded interior, which the enclosure gate already classifies as
deliberate whitening).

Change (full patch in `code/whiten-pen-solids-keep-reference.patch`, applies cleanly to `8e471b8`):

```js
import { scoreSolidity, whitenSolidRegions } from './lib/solid-regions.mjs';
...
const penSolidity = await scoreSolidity(pen);
const keepReference = penSolidity.solidPx ? await whitenSolidRegions(pen, penSolidity) : pen;
...
const fwd = await outlineMatch(keepReference, candidate);   // was (pen, candidate)
```

Plus an updated gate-1 doc comment. `--rescore` needs no change — it flows through the same
`score()`.

## 3. Offline validation — full-catalog before/after

`code/idea11-rescore.mjs` re-scored **all 94 shipped chalks** against the pen (current gate) vs the
whitened reference (fixed gate). Raw data in `rescore-baseline.json`.

Headline: **19 of 94 shipped chalks fail the current gate** (the audit's "13 overrides" undercounts
— same structural cause on all 19, matching the audit's page list). **All 19 pass with the fix. Zero
pass->fail regressions. Zero meaningful score decreases** (largest "drop" was 4e-5 pp on
`nature/bee-tall`, PNG re-encode noise).

### The 19 gate-blocked pages (all shipped by manual override)

| Page                      | Pen blob px | localKeep before -> after | keep before -> after |
| ------------------------- | ----------- | ------------------------- | -------------------- |
| shapes/circle-tall        | 2253        | **49.7% -> 88.7%**        | 93.1% -> 99.1%       |
| creatures/owl-tall        | 2908        | 59.0% -> 95.1%            | 93.9% -> 99.3%       |
| vehicles/police-tall      | 1886        | 62.7% -> 95.5%            | 95.9% -> 99.6%       |
| shapes/rectangle-tall     | 1767        | 63.9% -> 94.5%            | 94.7% -> 99.4%       |
| shapes/triangle-wide      | 1463        | 65.5% -> 96.5%            | 96.2% -> 99.7%       |
| shapes/star-tall          | 1087        | 66.9% -> 96.7%            | 96.2% -> 99.7%       |
| shapes/square-tall        | 1388        | 68.5% -> 95.7%            | 96.0% -> 99.6%       |
| shapes/square-wide        | 1214        | 69.6% -> 95.1%            | 97.0% -> 99.6%       |
| creatures/dragon-tall     | 1861        | 70.5% -> 95.1%            | 97.2% -> 99.5%       |
| creatures/owl-wide        | 1462        | 73.4% -> 96.2%            | 97.9% -> 99.8%       |
| dinosaur/trex-tall        | 1436        | 73.4% -> 96.4%            | 98.7% -> 99.8%       |
| shapes/triangle-tall      | 850         | 74.6% -> 96.2%            | 96.9% -> 99.6%       |
| farm/dog-tall             | 2309        | 74.8% -> 93.3%            | 98.2% -> 99.6%       |
| farm/cat-tall             | 1214        | 75.4% -> 96.7%            | 98.0% -> 99.8%       |
| objects/flower-tall       | 335         | 75.4% -> 91.5%            | 98.7% -> 99.6%       |
| vehicles/police-wide      | 763         | 75.8% -> 94.9%            | 98.3% -> 99.5%       |
| creatures/unicorn-tall    | 1262        | 77.8% -> 96.4%            | 99.0% -> 99.9%       |
| space/moon-tall           | 646         | 77.9% -> 97.4%            | 98.1% -> 99.8%       |
| dinosaur/pterodactyl-tall | 713         | 79.2% -> 97.5%            | 99.1% -> 99.9%       |

### Non-overridden pages: no regressions

* 29 pages with no solid pen regions (blob <= 100): max |localKeep delta| = **0.64 pp**, all still
  pass (e.g. `nature/*` all 99-100% both ways).
* The remaining passing pages with solid pens only *improve* (their marginal tiles were also
  depressed by the same blind spot — e.g. `dinosaur/velociraptor-tall` 80.0% -> 97.3%,
  `space/rover-tall` 80.4% -> 95.7%, `farm/pig-tall` 80.7% -> 98.9% — several of these passed the
  original run only by luck, sitting exactly at the 80% bar).

### Verified through the real tool

Applied the patch and ran the actual generator's offline path
(`gen-coloring-chalk.mjs <19 pages + 2 controls> --rescore`, shipped chalks copied into the scratch
dir as candidates): all 19 print clean stat lines with **no `drifting`/`local drift` warnings** and
the run exits 0. The audit's verification criterion — circle-tall's worst tile >= 80% instead of
49.7% — is met at 88.7%. Controls (`nature/bee-tall`, `dinosaur/brachiosaurus-tall`) unchanged
(their pre-existing warn-only "eye whites not chalked" notes remain, as they should — that gate is
untouched).

## 4. Live demo — retries can hunt again (1 Gemini call)

`node tools/asset-gen/gen-coloring-chalk.mjs shapes/circle-tall --force
--max-attempts 3` with the
fix active: the **first attempt passed every gate** (keep 99.1%, localKeep 90.8%, white 0.2%,
invented 0, no warnings). One Gemini call used. During the 2026-07 migration this page structurally
could not pass (its best-ranked candidate was hand-shipped at localKeep 49.7% after burning
retries). The fresh candidate (`regen-circle-tall-display.webp`) is on par with the shipped one —
proper white sclera, black pupils, catchlights. With the gate fixed, `--apply` would have shipped it
with zero manual steps, and retries now rank genuine quality differences instead of always failing
on the same tile.

## Evidence images (long side <= 560px)

| File                                     | What it shows                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `shapes-circle-tall-ref-before.webp`     | Pen reference as-is: solid black pupils                                           |
| `shapes-circle-tall-ref-after.webp`      | Fixed keep reference: pupil interiors whitened, outline rim kept                  |
| `shapes-circle-tall-overlay-before.webp` | Current gate overlay: red "lost ink" discs filling both eyes                      |
| `shapes-circle-tall-overlay-after.webp`  | Fixed gate overlay: red discs gone (blue = chalk's new sclera ink, not penalized) |
| `shapes-circle-tall-chalk-display.webp`  | The shipped (hand-overridden) chalk, dark-mode polarity                           |
| `creatures-owl-tall-*` (5 files)         | Same set for owl-tall (59.0% -> 95.1%)                                            |
| `regen-circle-tall-display.webp`         | Fresh Gemini chalk that passed the fixed gate on attempt 1                        |
| `regen-circle-tall-overlay.webp`         | Its keep overlay against the fixed reference                                      |

## Limitations / notes

* The rim width (`SOLID_RIM_WIDTH = 6` in `lib/solid-regions.mjs`) is shared with the normalizer; no
  page needed tuning, but a page whose chalk redraws a pupil outline > ~2px off the original rim
  would still (correctly) fail.
* `objects/flower-tall` lands at 91.5% and `shapes/circle-tall` at 88.7% — passing but lowest of the
  fixed set; their overlays show thin residual red rings where the chalk's pupil outline sits
  slightly inside the pen blob's rim. The gate tolerates this; a regen (as demonstrated) does better
  (90.8%).
* The fix does NOT add the audit's fallback ask (`--apply-reviewed`); with the structural failure
  gone it may be unnecessary, but it remains a reasonable escape hatch for future non-solid-related
  judgment calls.
* The 19-vs-13 count difference: AUDIT.md counted 13 gate firings during the migration; re-scoring
  finds 19 shipped chalks that fail today's gate — the extra 6 presumably squeaked through on their
  winning attempt or shipped in an earlier batch (several sat exactly at the 80.0% bar). Same root
  cause, same fix.
* Scratch dir note: `.coloring-samples-dark/chalk/` now contains the 21 copied candidates + the
  circle-tall regen (gitignored, allowed to remain).

## Recommendation

Apply `code/whiten-pen-solids-keep-reference.patch` as-is. Also update `docs/AUDIT.md` (top finding
-> resolved) and the gate description in `tools/asset-gen/pipeline.md` when landing. With this in,
the 13+ manual overrides become reproducible `--apply` runs, and the retry ladder can hunt for
genuinely better chalks on the accident-era solid-pen pages flagged by ideas #5/#6 (72 solid
outlines catalog-wide).
