# `/artifacts` — committed run outputs, published live

Durable home for the **keeper** outputs of Splotch's generators — contact sheets, Lighthouse
reports, image-model tests, and prompt/red-team reports — so they survive a session without being
regenerated (which costs API tokens / time). See
[ADR-0059](../docs/adrs/0059-committed-run-artifacts-github-pages.md) for why this exists and the
alternatives that were rejected.

This is **not** `docs/` (curated prose + ADRs) and **not** `dist`/`build` (app build output). It's
machine-generated run output kept on purpose.

## Live URLs

A GitHub Actions workflow ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml)) deploys
this folder to GitHub Pages on every push to `main` that touches `artifacts/**`. Files render live
at:

```
https://kylemit.github.io/Splotch/<type>/<name>
```

The landing page ([`index.html`](./index.html), auto-generated) lists everything at
`https://kylemit.github.io/Splotch/`.

The coloring-book proof sheets have their own hub at
`https://kylemit.github.io/Splotch/coloring-book-proof-sheets/` — one sheet per category
(`coloring-book-proof-sheets/<category>.html`, built by `npm run gen:coloring-book-proof-sheet`)
plus a hand-authored `index.html` that jumps between categories (tabs, prev/next arrows, ←/→ keys,
hash deep links). The hub `index.html` is a keeper — `artifacts:publish`/`artifacts:index` only
regenerate the **top-level** `index.html`, so republishing a category sheet never touches it.

> HTML reports render because they're served by Pages. `raw.githubusercontent.com` would serve them
> as `text/plain` (source, not a page) — that's why Pages, not a raw URL, is the mechanism here.

## Publishing

Ephemeral tool outputs stay **gitignored** (`lighthouse-reports/`, `.coloring-samples/`,
`web/tests/redteam/output/`, …). Promote a chosen keeper with:

```bash
npm run artifacts:publish -- <source> <type>/<name>
# e.g.
npm run artifacts:publish -- .coloring-samples/contact-sheet.html contact-sheets/nature.html
npm run artifacts:publish -- lighthouse-reports lighthouse/latest
```

It copies the file/dir under `artifacts/<type>/<name>`, regenerates `index.html`, and prints the
Pages URL. Then commit and push — the deploy runs on merge to `main`. To only rebuild the index:
`npm run artifacts:index`.

## Keeping the folder from bloating

Binaries and base64-inlined HTML live in git history forever, so:

* **Overwrite in place** at a stable path (`contact-sheets/nature.html`, `lighthouse/latest/…`) so
  re-publishing replaces rather than accumulates, and the URL stays stable.
* **Dated snapshots** (`lighthouse/2026-07-14/…`) only when you deliberately want a comparison over
  time.
* Publish the **report** (`*.report.html` / `*.json`), never the whole run dir — skip Chrome
  `profile-*` dirs and other scratch.
* Only publish keepers. Everything regenerable and uninteresting stays in its gitignored scratch
  dir.

If the repo ever grows painfully, Git LFS is the escape hatch — but note LFS files **don't render on
GitHub Pages** (Pages serves the pointer, not the content), so moving artifacts to LFS means giving
up their live URLs.
