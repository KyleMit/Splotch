# Handoff — coloring-fill outline drift (magic-brush ghosting)

> 2026-07-09 · branch `claude/coloring-outline-ghosting-regression-4e21rr` · PR
> [#104](https://github.com/KyleMit/Splotch/pull/104) · worst-tile drift gate shipped; open
> follow-ups on night-fills + threshold

## What this was

The magic brush revealed colors that didn't line up with a page's outlines (reported on **nature →
ant, wide, light mode** — the flowers were visibly off).

**Root cause:** it is *not* line bloom. The colored fill's **fills are geometrically drifted** from
the line art in a *localized* region — the ant body registers perfectly but its flowers were drawn
~12 px off. `alignToSource` only corrects a single **global** translation, so a self-drifted feature
can't be aligned away. It shipped because the generation gate scored only the **global** outline
coverage (`keep`): ant-wide was 93 % global (over the 0.92 bar) while its worst tile was 34 %. A
global average structurally can't see local drift.

An earlier attempt this session dilated the outline mask in `magicBrush.ts` — it only carved a white
halo around every line and did nothing for the drift. It was **reverted**; don't revisit it.

## What shipped on this branch

| Commit    | What                                                                      |
| --------- | ------------------------------------------------------------------------- |
| `2328dfd` | Worst-tile drift gate + `gen:coloring-fills:audit`; reverted the dilation |
| `33c68e4` | Regenerated the 5 drifted fills (all now 100 % global + 100 % worst-tile) |
| `f581521` | Gallery: page/cell targets + `--theme light`                              |
| `1a58293` | Session-audit finding (review-sheet viewing gap)                          |

Key pieces:

* **`tools/asset-gen/lib/outline-match.mjs`** — shared scoring. `outlineMatch()` now returns
  `localKeep` (worst grid tile) beside `keep`. Thresholds `KEEP_THRESHOLD = 0.92`,
  `LOCAL_KEEP_THRESHOLD = 0.80` live here, imported by both the generator gate and the auditor so
  they can't diverge.
* **`gen-coloring-fills.mjs`** — the pass gate now requires `localKeep ≥ 0.80`; a drifted candidate
  is rejected and retried (police-wide + triangle-wide each needed 2 tries when regenerated — the
  safeguard working).
* **`check-coloring-drift.mjs`** / `npm run gen:coloring-fills:audit` — runs the same scoring over
  shipped fills (committed assets only, no key/network), prints which to regenerate, exits non-zero.
  `--overlay` dumps drift maps.

**Current audit state: 94 fills, 0 flagged.** Checks green: 352 unit tests, 0 type errors, Prettier
clean, all 6 magic-brush E2E pass.

## Open items (with recommendations)

### 1. Borderline threshold — unicorn/fairy at 83–85 % (recommendation: leave at 0.80)

`LOCAL_KEEP_THRESHOLD = 0.80` leaves three creatures pages just above the bar: `unicorn-tall` 83.6
%, `fairy-wide` 83.7 %, `fairy-tall` 85.3 %. The question was whether to raise the bar (~0.85) to
sweep them in for regeneration.

**I looked at their drift overlays.** Unlike ant-wide (a whole *feature* shifted), the residual here
is **thin-line detail clipping in one dense tile** — fairy wing veins, the unicorn's mane curls,
fine foliage — not a misregistered shape. It reads as clean to the eye. There's also a natural gap
in the data between the clearly-bad tier (dog-wide 79.5 %) and this tier (83.6 %+), which is why
0.80 sits where it does.

* **Recommendation:** keep 0.80. Raising to 0.85 would flag `fairy-tall` (85.3 %) inconsistently and
  churn regenerations for no visible gain.
* **If you want extra polish anyway** (cheap, may land a cleaner draw):
  ```
  npm run gen:coloring-fills -- creatures/fairy-tall creatures/fairy-wide creatures/unicorn-tall
  npm run gen:coloring-fills:audit -- creatures
  ```
  Not required — purely opportunistic.

### 2. Extend the drift gate to the night-fills pipeline (not yet covered)

`gen-coloring-fills-dark.mjs` (the `.night.webp` generator) has its **own** `alignToSource` +
`scoreDrift()` and does **not** use `lib/outline-match.mjs`'s worst-tile gate — so it likely has the
same global-average blind spot for localized drift, in dark mode.

* **Task:** either (a) point `check-coloring-drift.mjs` at the night fills too (it currently reads
  the light `*.light.raw.webp` raws; night fills are `*.night.webp` and are white-line-on-dark, so
  the mask polarity differs — needs an inversion path), or (b) add a worst-tile check to the dark
  generator's gate. (a) is the cheaper first step to just *find out* whether any night fills drift
  locally.
* Only relevant if dark-mode ghosting matters; the reported bug was light mode.

### 3. PR #104 visuals + watching (offered, awaiting your call)

* **Add visuals to the PR body** — I have the ant before/after registration overlay and the
  Light+Combined contact sheet of all 5 regenerated fills (the `pr-screenshots` skill wants these
  for a UI-asset PR). I did not touch your PR description; say the word and I'll add a before/after
  section.
* **Watch the PR** — I can subscribe to #104 and handle CI failures / review comments. Not currently
  subscribed.
* Interactive review artifact (published this session):
  https://claude.ai/code/artifact/54cfd4db-c9ef-4462-bcb8-267a9ea5b310

### 4. Session-audit finding to action (docs/AUDIT.md)

One `[Docs]` finding is filed: the asset-gen review-sheet **viewing** path isn't discoverable — a
cloud session reinvents headless Playwright screenshots instead of publishing the sheet as an
Artifact. Fix is a short cross-reference in `tools/asset-gen/README.md`. `/fix-audits` will clear
it, or do it by hand.

## How to resume

```
git fetch origin && git checkout claude/coloring-outline-ghosting-regression-4e21rr
npm run gen:coloring-fills:audit            # confirm 0 flagged
# regenerate any page:  npm run gen:coloring-fills -- <cat>/<page>   (GEMINI_API_KEY is in the env)
# focused review sheet (light + night side by side):
npm run gen:contact-sheet -- nature/ant-wide --source shipped --out /tmp/review.html
# then publish /tmp/review.html with the Artifact tool (don't headless-screenshot it)
```

The full rationale is in **ADR-0043** (magic-brush follow-ups: "reveal fills only" and "the upstream
fix: a worst-tile drift gate at generation").
