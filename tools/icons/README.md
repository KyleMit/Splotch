# Icon tooling

This capability turns the app's SVG icon corpus into its typed name union and keeps every icon on
one canonical viewBox. Chroma classification lives here too, so the classifier and the application
guard cannot disagree about which icons are colorful spot illustrations. The reviewable gallery of
the shipped icon set is the app's own `/design` styleguide, not a generated page.

## Entry points

| Entry point               | Public command             | Purpose                                        |
| ------------------------- | -------------------------- | ---------------------------------------------- |
| `gen-icon-names.mjs`      | `npm run gen:icon-names`   | Generate the typed `IconName` union            |
| `rebase-icon-viewbox.mjs` | `npm run gen:icon-viewbox` | Rebase icons onto the canonical square viewBox |

`lib/icon-chroma.mjs` owns painted-color parsing and spot/plain classification.
`lib/icon-chroma.d.mts` provides its TypeScript declaration, and `tests/icon-chroma.test.mjs` covers
the parser boundaries. `web/src/lib/components/Icon.svelte.test.ts` consumes the same classifier to
guard the production icon set, and `/design` renders the same split for review.

## Name generation

`gen-icon-names.mjs` reads every `web/src/lib/icons/*.svg`, sorts the basenames, and replaces
`web/src/lib/components/icon-names.d.ts`. It has no flags or external prerequisites beyond Node. An
empty icon directory fails rather than replacing the union with an empty type. The command runs in
both prebuild hooks; never hand-edit the generated declaration.

After adding, deleting, or renaming an icon, run:

```sh
npm run gen:icon-names
```

## Maintenance

Classification recognizes `fill`, `stroke`, and `stop-color` paint values in attributes and CSS.
Keep `icon-chroma.mjs`, its declaration, focused tests, and the `Icon.svelte` guard aligned when the
supported SVG paint syntax changes.

Run focused verification with:

```sh
npm run test:tools -- tools/icons/tests/icon-chroma.test.mjs
npm run test:unit -- src/lib/components/Icon.svelte.test.ts
npm run gen:icon-names
```

## viewBox rebasing

`rebase-icon-viewbox.mjs` puts every icon on the canonical `viewBox="0 0 1000 1000"` by baking the
uniform scale + translate into the coordinate data itself (path commands, circle/ellipse/rect
geometry, `<use>` stamp offsets, `userSpaceOnUse` gradient vectors, user-space stroke widths and
dash arrays) rather than re-framing artwork through a shifted viewBox window. A non-square source
rect is centered in the square box — exactly where `xMidYMid` letterboxing already painted it — so
rendering is unchanged. Every write is pixel-verified: the rebased file is rasterized against the
original at 512px and the tool refuses to write when more than antialiasing rounding differs.
`splotchy.svg` is exempt (the mascot renders via a Vite URL import where the file's own frame is the
source of truth). `web/src/lib/icons/iconViewBox.test.ts` enforces the grid, so a newly imported
icon on a foreign grid (Material exports arrive on `0 -960 960 960`) fails the unit tier until
rebased — run `npm run gen:icon-viewbox && npm run optimize:svg-assets`. The tool is idempotent and
prints nothing but a summary when everything is already canonical.

`lib/svg-path-transform.mjs` owns the path-data half of that rebase: `transformPathData` maps every
coordinate in a `d` attribute under a uniform scale + translate, preserving command letters,
relative/absolute case, and arc flags. It is sized to that one operation — no rotation, no general
matrix, no arc-to-cubic — and rejects path data it cannot fully account for (a dropped token, a
command without arguments, arguments after a closepath) rather than silently emitting a plausible
wrong path. It also owns `roundCoordinate`, the 2dp emission precision **shared with the geometry
attributes** the entry point rewrites; the pixel gate above is calibrated to that rounding, so it
has one owner and `rebase-icon-viewbox.mjs` imports it rather than keeping a copy.
`tests/svg-path-transform.test.mjs` covers the transform directly, which the whole-file pixel gate
cannot do — it reports that more than antialiasing differs, not which command was mapped wrong.
