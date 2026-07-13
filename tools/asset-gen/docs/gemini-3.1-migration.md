# 2026-07 catalog regeneration on `gemini-3.1-flash-image`

The full-catalog regeneration that made `gemini-3.1-flash-image` the pipeline's
default image model (IDEAS #17, validated by the
[`ideas-exploration/idea-17`](../ideas-exploration/idea-17/report.md) bake-off).
Every chalk outline, light fill, and night fill was regenerated through the
production gates; this file is the run record — per-page generation counts,
any page whose prompt or call arguments were customized, and the issues that
remain open after the wave.

## What changed

- `MODEL` in all five generators (`gen-coloring-fills{,-dark}`,
  `gen-coloring-chalk`, `gen-style-covers`, `normalize-outline-strokes`) went
  `gemini-2.5-flash-image` → `gemini-3.1-flash-image`. The app-side
  `web/src/lib/server/ai/gemini.ts` model is a separate decision and was NOT
  changed.
- Landed alongside (validated in ideas-exploration, zero-regression evidence):
  - **IDEAS #11** — the chalk keep gate scores against the pen with solid
    interiors whitened out, so deliberate pupil-whitening no longer reads as
    lost ink (19 chalks previously shipped by hand-override).
  - **IDEAS #12** — `judgeNightEyes` ignores band-blind cores and, on
    chalk-forked pages, cores the chalk never marked white (wheel hubs,
    rover screens), so flat-eye flags mean something again.
- Night fills were generated against a **tightened mood gate**
  (`--night-luma-max 60` instead of the default 100) to close IDEAS #4's
  4× night-sky brightness spread; the shipped catalog should now sit in the
  15–60 bgLuma band.

## Generation budget

Soft cap 5 generations per image/variant (the generators' `--max-attempts 5`
keep-best-of-N ladder), hard cap 10 (a second targeted run with levers/notes).
Pages that hit the hard cap ship the best take with their outstanding issue
noted below.

## Per-page customizations

Pages whose generation deviated from the uniform prompt/arguments. (Uniform =
the stock prompt, `--max-attempts 5`, night `--night-luma-max 60`.)

| Page | Asset | Customization | Why |
| --- | --- | --- | --- |
| _(none yet — filled in as the wave lands)_ | | | |

## Outstanding issues after the wave

_(filled in after post-regen audits)_

## Results summary

_(filled in after post-regen audits: attempts distribution, gate pass rates,
before/after audit deltas)_
