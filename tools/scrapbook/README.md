# Scrapbook tooling

This capability promotes selected tool output into the committed `scrapbook/` site, rebuilds its
landing pages, and verifies that every collection remains reachable. Ephemeral producer output is
owned by its producing capability; scrapbook tooling owns only promotion and the shared site shell.

## Entry points

| Entry point               | Public command                                | Purpose                              |
| ------------------------- | --------------------------------------------- | ------------------------------------ |
| `publish-scrapbook.mjs`   | `npm run scrapbook:publish`                   | Copy a keeper into the scrapbook     |
| `publish-scrapbook.mjs`   | `npm run scrapbook:index` / `scrapbook:check` | Rebuild or verify generated indexes  |
| `gen-proof-sheet-hub.mjs` | `npm run scrapbook:proof-sheet-hub`           | Rebuild the coloring proof-sheet hub |

The publisher intentionally remains multi-mode because publishing, rebuilding, and checking share
one destination contract. The proof-sheet generator moves to the shorter #975 name while its public
command stays stable.

## Publish a keeper

Publishing needs installed project dependencies and a local source file or directory. It uses no
network and does not push; the GitHub Pages deployment happens after the resulting commit reaches
`main`. [`scrapbook/README.md`](../../scrapbook/README.md) owns what qualifies as a keeper and the
entry-page/`assets/` shape a collection must ship: it is the same document `scrapbook:check` points
to when a collection has no reachable entry page.

```sh
npm run scrapbook:publish -- <source> <type>/<name>
```

The destination is a relative `<type>/<name>` path beneath `scrapbook/`: `.`, a bare `<type>`, `..`
escapes, and absolute paths are rejected, as is a destination whose real path leaves `scrapbook/`
through a symlink. A source copied onto an existing directory replaces it, so files the new run no
longer produces do not stay deployed. Publishing refuses when the destination exists as the other
kind (file vs directory) or overlaps the source, including through a symlink or a case alias. Both
generated landing pages are rebuilt afterwards.

## Rebuild and verify

```sh
npm run scrapbook:index
npm run scrapbook:proof-sheet-hub
npm run scrapbook:check
```

`scrapbook:index` rebuilds both `scrapbook/index.html` and
`scrapbook/coloring-book-proof-sheets/index.html`; the direct proof-sheet command rebuilds only the
latter. `scrapbook:check` verifies that every collection has a reachable HTML or Markdown entry,
that proof-sheet categories and their hub agree, and that both committed generated pages are
current. It ignores only checkout-unstable mtime dates when comparing the main index. Preview the
regenerated pages before committing with `npm run scrapbook:serve`, which serves the committed tree
at <http://127.0.0.1:4174>.

## Libraries and failure behavior

`lib/scrapbook-index.mjs` owns collection discovery, reachability, site identity, and main-index
rendering. `lib/scrapbook-chrome.mjs` owns the shared HTML chrome imported by reports across tool
capabilities. Keep those cross-capability imports stable; they are intentional ownership edges, not
candidates for copying back into each producer.

Missing sources, invalid modes, destination escapes, unreachable collections, proof-sheet drift, and
stale generated pages produce diagnostics and nonzero exits. Publication is not atomic: a copy or
subsequent generated-page write can fail after destination files changed, so inspect `git diff`
before retrying. Index/check modes never copy an external source.

Run focused verification with:

```sh
npm run test:tools -- tools/scrapbook/tests/scrapbook-index.test.mjs tools/tests/tool-specifier-resolution.test.mjs tools/tests/scripts-info.test.mjs
npm run scrapbook:check
```
