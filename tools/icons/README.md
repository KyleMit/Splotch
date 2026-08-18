# Icon tooling

This capability turns the app's SVG icon corpus into its typed name union and a human-reviewable
gallery. Chroma classification is shared by the gallery and the application guard so the two cannot
disagree about which icons are colorful spot illustrations.

## Entry points

| Entry point               | Public command             | Purpose                                        |
| ------------------------- | -------------------------- | ---------------------------------------------- |
| `gen-icon-names.mjs`      | `npm run gen:icon-names`   | Generate the typed `IconName` union            |
| `gen-icon-sheet.mjs`      | `npm run gen:icon-sheet`   | Generate the icon-gallery scrapbook page       |
| `rebase-icon-viewbox.mjs` | `npm run gen:icon-viewbox` | Rebase icons onto the canonical square viewBox |

`lib/icon-chroma.mjs` owns painted-color parsing and spot/plain classification.
`lib/icon-chroma.d.mts` provides its TypeScript declaration, and `tests/icon-chroma.test.mjs` covers
the parser boundaries. `web/src/lib/components/Icon.svelte.test.ts` consumes the same classifier to
guard the production icon set.

## Name generation

`gen-icon-names.mjs` reads every `web/src/lib/icons/*.svg`, sorts the basenames, and replaces
`web/src/lib/components/icon-names.d.ts`. It has no flags or external prerequisites beyond Node. An
empty icon directory fails rather than replacing the union with an empty type. The command runs in
both prebuild hooks; never hand-edit the generated declaration.

After adding, deleting, or renaming an icon, run:

```sh
npm run gen:icon-names
```

## Gallery generation

`gen-icon-sheet.mjs` reads and inlines the same SVG corpus, classifies each icon by painted chroma,
and writes a self-contained HTML gallery. The default output is the gitignored
`tools/.scrapbook-scratch/icons/index.html`; pass `--out FILE` after npm's separator to publish a
specific path:

```sh
npm run gen:icon-sheet -- --out scrapbook/icons/index.html
```

The generator creates the destination directory and replaces the output file. The shared scrapbook
chrome requires installed project dependencies, but generation needs no network. Unreadable SVG
input fails the run, while malformed markup is inlined verbatim rather than rejected; the generator
does not modify source icons.

## Maintenance

Classification recognizes `fill`, `stroke`, and `stop-color` paint values in attributes and CSS.
Keep `icon-chroma.mjs`, its declaration, focused tests, and the `Icon.svelte` guard aligned when the
supported SVG paint syntax changes. The gallery may rewrite a single monochrome ink to
`currentColor` in its inline copy only; production SVG bytes remain unchanged.

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
