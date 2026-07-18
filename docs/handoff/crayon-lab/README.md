# crayon-lab — iteration harness (snapshot)

These four scripts drove the crayon design loop (references + adversarial judge). They are stashed
here for the next session; the live copies ran from a **git-excluded `crayon-lab/` at the repo
root**. To use them again, copy this folder there and run from the repo root:

```sh
cp -r docs/handoff/crayon-lab ./crayon-lab      # imports below assume repo-root/crayon-lab/
mkdir -p crayon-lab/out
node crayon-lab/gen-refs.mjs                     # → out/ref-{single,overlap,scribble}.png (Gemini)
node crayon-lab/render.mjs --variants=12         # builds prod, draws scenes → out/v12-*.png
node crayon-lab/render.mjs --variants=12 --no-build   # reuse the last build (fast iterate)
node crayon-lab/judge.mjs --variant=12           # Gemini vision judge → JSON scores
node crayon-lab/contact-sheet.mjs                # → docs/handoff/crayon-iterations-contact-sheet.png
```

Requirements (present in the cloud env this session ran in):

- `GEMINI_API_KEY` env var (image gen + vision judge). Proxy allows `generativelanguage.googleapis.com`.
- `@google/genai` (already a repo dependency, resolves from repo-root `node_modules`).
- Playwright chromium (via `scripts/lib/utils.mjs` `chromiumExecutablePath`).

Import-path note: `render.mjs` and `contact-sheet.mjs` import `../scripts/lib/utils.mjs` and
`../scripts/perf/preview.mjs`, i.e. they must sit at `repo-root/crayon-lab/`. `gen-refs.mjs` and
`judge.mjs` only import `@google/genai` and run from anywhere under the repo.

- **gen-refs.mjs** — text→image prompts to `gemini-2.5-flash-image`; three real-crayon reference photos.
- **render.mjs** — drives `/dev/engine` (`window.__engine`) to draw buildup-focused scenes (single,
  doubled, cross, scribble) for given crayon variant(s) and screenshots each.
- **judge.mjs** — feeds refs + my renders to `gemini-2.5-flash` and asks for scored critique
  (waxy / grain / containment / buildup) as JSON. See the handoff for how much to trust it.
- **contact-sheet.mjs** — composites the per-variant battery renders (from `perf-profiles/`) + refs +
  final scenes into the committed contact sheet, via an HTML grid screenshotted with Playwright.
