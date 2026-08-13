# Design-token tooling

This capability turns the typed design-token sources into the CSS custom properties consumed by the
app and enforces the remaining hand-authored style boundaries. The generator owns the emitted token
sheet; the linter keeps raw colors, font sizes, and chrome-level z-index values from bypassing that
source of truth.

## Entry points

| Entry point                 | Public command             | Purpose                                       |
| --------------------------- | -------------------------- | --------------------------------------------- |
| `gen-token-css.mjs`         | `npm run gen:tokens`       | Generate `web/src/tokens.css`                 |
| `gen-token-css.mjs --check` | `npm run gen:tokens:check` | Fail when the generated CSS has drifted       |
| `lint-token-styles.mjs`     | `npm run lint:tokens`      | Enforce token use in hand-authored app styles |

The public npm commands remain stable during the tools naming migration. All three commands need
only Node and installed project dependencies; they do not use the browser or network.

## CSS generation

`gen-token-css.mjs` reads the token maps in `web/src/lib/design/tokens.ts` and the themed icon-part
map in `web/src/lib/design/iconTokens.ts`. It deterministically renders the light declarations and
both dark-theme selectors into `web/src/tokens.css`. Never hand-edit that generated file.

Run generation after changing either source:

```sh
npm run gen:tokens
```

Generation replaces `web/src/tokens.css` only when its contents differ. Check mode performs the same
render without writing and exits nonzero when the committed CSS is stale:

```sh
npm run gen:tokens:check
```

## Style lint

`lint-token-styles.mjs` scans Svelte style blocks and hand-authored CSS under `web/src`. It rejects
new raw hex colors and font sizes beyond the documented per-file baselines, any baseline entry whose
source disappeared or decreased, and every raw multi-digit z-index. The generated `tokens.css`
source is intentionally excluded.

`lint-token-styles.d.mts` exposes the linter's pure counting helpers to the TypeScript unit tests in
`web/src/lib/design/lint-token-styles.test.ts`. Keep the declaration, exports, and tests aligned
when adding a new linted value class or changing parser behavior.

## Maintenance

Edit token values and vocabulary in the typed sources, regenerate the CSS, and commit both source
and output. A genuine raw-style exception needs a stable reason beside its baseline entry; when an
exception is migrated to a token, lower or remove that entry in the same change.

Run focused verification with:

```sh
npm run gen:tokens:check
npm run lint:tokens
npm run test:unit -- src/lib/design/lint-token-styles.test.ts
```
