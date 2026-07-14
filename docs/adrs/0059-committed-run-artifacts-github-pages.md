# ADR-0059: Committed Run Artifacts in `/artifacts`, Published Live via GitHub Pages

**Status:** Active **Date:** 2026-07

## Context

Several Splotch generators produce **reviewable run outputs** worth keeping between sessions:
contact sheets (`gen:contact-sheet`, self-contained HTML), Lighthouse reports
(`.report.html`/`.json`), image-model tests, and prompt/red-team reports (`report.html`). The
tooling can regenerate them, but that costs API tokens / wall time, and the output isn't immediately
available in a fresh clone.

Today every one of these lands in a **gitignored scratch dir** and is discarded after the run —
`lighthouse-reports/` (commented "attach to the PR, don't commit"), `.coloring-samples*/`,
`perf-profiles/`, `web/tests/redteam/output/`, `screenshots/`. Nothing durable survives, and there's
no easy way to view a kept HTML report rendered — you have to re-run the tool or open a raw file.

We wanted (a) a durable, committed home for the **keeper** runs, distinct from `docs/` (curated
prose and ADRs) and `dist`/`build` (app build output); and (b) a live URL to view HTML/MD reports
rendered. The repo is **public**, so GitHub Pages and raw URLs are free.

Alternatives considered:

* **`raw.githubusercontent.com`** (the scheme ADR-0046 uses for PR screenshots): GitHub forces
  `Content-Type: text/plain` on raw HTML, so a report renders as **source, not a page**. Fine for
  images embedded in a PR body, useless for viewing a report — the decisive strike against it.
* **Classic "deploy from a branch" Pages**: only accepts **root or `/docs`** as the publish source,
  never an arbitrary `/artifacts`. Serving `/artifacts` this way would mean either polluting the
  repo root or overloading `docs/` — both rejected.
* **Orphan-branch storage** (ADR-0046's `pr-assets` model): keeps `main`'s history clean, but adds
  `git worktree` ceremony to every publish and still can't render HTML without Pages on top. The
  maintainer is fine with the repo growth and preferred the simpler in-tree folder.
* **Git LFS**: the usual answer for committed binaries, but **GitHub Pages does not resolve LFS
  pointers** — an LFS-tracked file serves as its pointer text, so the report never renders. LFS also
  carries storage/bandwidth quotas. It directly defeats the live-URL goal.
* **Actions-only ephemeral Pages** (deploy without committing): gives a URL but stores nothing in
  git, failing the "stay committed" requirement.

## Decision

Keeper artifacts live in a committed top-level **`/artifacts`** folder, served live by a **GitHub
Actions Pages deploy** of that folder. The committed folder is the source of truth; Pages mirrors
it. Only the Actions path can serve an arbitrary folder, which is why it — not classic branch-source
Pages — is used.

Implementation:

* **`scripts/publish-artifact.mjs`** (npm `artifacts:publish`) promotes a keeper:
  `-- <source>
  <type>/<name>` copies a file or dir from a gitignored scratch dir into
  `artifacts/<type>/<name>`, regenerates the index, and prints the Pages URL. It guards the
  destination against `../` escapes so a publish can't write outside `artifacts/`. Pure `node:fs`,
  no shell (ADR-0017).
* **`scripts/lib/artifacts-index.mjs`** builds `artifacts/index.html` — a self-contained,
  theme-aware landing page grouping entries by their top-level type dir. `artifacts:index` rebuilds
  just the index.
* **`.github/workflows/pages.yml`** uploads `artifacts/` as the Pages artifact and deploys it on
  push to `main` under `paths: ['artifacts/**']` (plus `workflow_dispatch`). `configure-pages` sets
  `enablement: true`. The one-time repo setup (Settings → Pages → Source: **GitHub Actions**) was
  completed on merge, and the site is **live** at <https://kylemit.github.io/Splotch/>. The site
  root is the `artifacts/` folder, e.g. `artifacts/contact-sheets/nature.html` →
  `https://kylemit.github.io/Splotch/contact-sheets/nature.html`.
* **`artifacts/.nojekyll`** so Pages serves the self-contained HTML verbatim (no Jekyll pass).

Invariant: ephemeral tool scratch dirs **stay gitignored**; only an explicit `artifacts:publish`
lands a keeper in git. This keeps the "regenerate freely, commit deliberately" split intact.

Growth-control conventions (also in `artifacts/README.md`): overwrite in place at a stable path so
re-publishing replaces rather than accumulates and URLs stay stable; use dated snapshots only for
deliberate over-time comparisons; publish the report file, not the whole run dir (no Chrome
`profile-*` dirs).

This coexists with **ADR-0046**, which remains the scheme for images embedded in PR bodies (raw URLs
that render inline in GitHub Markdown). ADR-0059 is for reports meant to be *viewed as pages*.

## Consequences

* \+ Kept reports survive across sessions and clones instead of being regenerated for API cost, and
  each has a stable live URL that renders — which a raw URL can't provide.
* \+ One reusable, cross-platform publish path (`artifacts:publish`) with an auto-generated index;
  wiring each generator to it is an independent follow-up, done one at a time.
* \+ `docs/` stays curated prose + ADRs; machine output has its own clearly-named home.
* − Committed binaries and base64-inlined HTML live in `main`'s history forever and grow the clone —
  mitigated by the overwrite-in-place / keeper-only / report-not-whole-dir conventions, not
  eliminated. Git LFS is the escape hatch if it ever hurts, at the cost of the live URLs.
* − Required a one-time manual Pages enablement (Settings → Pages → GitHub Actions) before the first
  deploy could succeed. This is now done and the site is live at
  <https://kylemit.github.io/Splotch/>.
* − Public-repo-specific for unauthenticated viewing, same caveat as ADR-0046: if Splotch goes
  private, Pages access follows the repo's visibility.
