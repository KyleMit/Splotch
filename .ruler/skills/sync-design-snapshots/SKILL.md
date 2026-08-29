---
name: sync-design-snapshots
description: Put every Splotch screen into Claude Design as an editable, pixel-accurate HTML snapshot of the running app, then bring the resulting design edits back to the Svelte source. Use when asked to design a screen in Claude Design, get the app into a design system project, refresh the design snapshots, or apply design changes that came back from claude.ai/design.
---

# Sync design snapshots

Claude Design edits HTML and CSS. Splotch is Svelte. Without this pipeline a design session spends
its first stretch rebuilding a screen from scratch and still lands on an approximation. Instead,
`capture:page-inventory` serializes the **running app** — real DOM, real CSS, real canvas pixels —
into standalone HTML that already renders pixel-for-pixel, and stamps every element with the Svelte
file and line that produced it.

Read `tools/page-inventory/README.md` for the capture harness itself; this skill covers only the
design leg.

## What the bundle contains

`.scrapbook-scratch/design-snapshots/` (regenerated every capture, never committed):

| Path                    | What it is                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| `surfaces/*.html`       | One standalone snapshot per surface × viewport × theme                     |
| `surfaces.css`          | The app's whole stylesheet, minified — **the file design edits belong in** |
| `surfaces.baseline.css` | An untouched copy, so port-back has something to diff against              |
| `assets/`               | Content-addressed images, fonts, and captured canvas pixels                |
| `index.html`            | A plain list of every snapshot                                             |

Two things make a snapshot editable rather than merely viewable:

* Every element carries `data-src="src/lib/components/BrushMenu.svelte:42"` — the file and line that
  rendered it. This exists only because capture runs against `vite dev`; Svelte attaches source
  locations under `dev` and strips them from production builds.
* Each snapshot's first line is `<!-- @dsCard group="controls" -->`, which is what a Design System
  project reads to build its card index. Keep it first — a marker on line two is not a card.

## Generate

```sh
npm run gen:design-snapshots                       # the bundle only — the usual command
npm run capture:page-inventory                     # the whole inventory: images, reviews, bundle
npm run gen:design-snapshots -- --surface brush-menu --theme dark     # one slice, fast
```

Reach for `gen:design-snapshots` by default. A full `capture:page-inventory` rewrites the WebP
captures, and every stored review is bound to the digest of the image its reviewer saw — so
refreshing a snapshot through the full run silently invalidates the entire critique. `--design-only`
drives the design viewports into a throwaway capture directory and republishes only the bundle.

Snapshots are written for a phone-portrait and a tablet-landscape viewport only
(`DESIGN_SNAPSHOT_VIEWPORT_IDS`), not the full eight-viewport review matrix — those two are the
shapes every layout decision has to satisfy, and the matrix exists for the screenshot critique. A
filtered run that excludes both viewports writes no snapshots.

## Verify before designing on it

```sh
npm run verify:design-snapshots
```

Re-renders each snapshot and reports the share of pixels it differs from the WebP it was serialized
from. Under 0.5% passes. **A snapshot that fails this is not worth designing on** — the design will
be made against something the app does not look like. Investigate rather than raising the tolerance;
past failures were real serialization bugs (asset URLs rewritten relative to the document instead of
the stylesheet, canvas pixels read back blank), each of which looked like a small percentage and was
a broken screen.

**What the numbers look like across the whole bundle.** Non-modal surfaces land at 0.1–1%. Surfaces
showing a modal sit at 5–11%, evenly across both themes — the residual is the dimmed page behind the
dialog, not the dialog itself. Anything materially outside those bands is a bug.

That band was earned. An earlier version of this pipeline rebuilt `::backdrop` as a fixed layer
beneath each dialog, on the assumption that the top-layer pseudo-element was the only thing dimming
the page. It is not — the app renders its own dim as an ordinary element, which serializes like any
other markup — so the extra layer dimmed twice and changed what the dialog's own `backdrop-filter`
samples, turning a frosted white card grey. Dark mode hid it almost entirely; light mode measured a
68% median. **When you check fidelity, check both themes**: a defect in a translucent surface can be
invisible against a dark background and obvious against a light one.

## Push to Claude Design

Pushing uses the **`DesignSync` tool**, not a shell command — there is no npm script for it, and
there cannot be one.

Authorization is per-machine and interactive: the user runs `/design-login` once from a local Claude
Code session. **A cloud session cannot authorize**, and `DesignSync` fails there with a message
saying so; when that happens, say so and stop rather than trying to work around it.

1. `list_projects` — find a design-system project, or `create_project` if there is none.
2. `get_project` — confirm `type: PROJECT_TYPE_DESIGN_SYSTEM`. That type is fixed at creation, so
   pushing to an ordinary project never turns it into a design system.
3. `finalize_plan` with `localDir` set to the bundle directory and `writes` covering
   `surfaces/**/*.html`, `surfaces.css`, `assets/**`, `index.html`.
4. `write_files` using `localPath` for every file, **at most 256 per call** — a full bundle is
   several hundred files, so split across calls under the one `planId`. `localPath` keeps file
   contents out of context entirely.

Cards come from the `@dsCard` markers; `register_assets` is legacy and unnecessary here.

## Port design edits back

A design session edits `surfaces.css` in place. To turn that into a source change:

```sh
npm run port:design-edits
```

It diffs `surfaces.css` against `surfaces.baseline.css` and prints every changed declaration with
the Svelte file and line that rendered an element the rule matches — resolved through the
`svelte-<hash>` scope class the selector carries. A selector with no scope class belongs to
`web/src/tokens.css` or `web/src/app.css`.

Apply the changes to those sources yourself; the command reports, it never writes to `web/src/`.
Then re-run the capture so the bundle matches the app again.

Two limits worth knowing before relying on the output:

* It reads CSS only. Markup changes a design session made in a snapshot's HTML are not reported —
  read the `data-src` on the changed element to place those by hand.
* A change to a token in `web/src/tokens.css` shows up as the many rules that resolved it, not as
  the one token. Prefer changing the token when the diff shows one value moving everywhere.
