# Critical CSS spike, 2026-09-28

Question: the drawing route inlines all of its CSS (`inlineStyleThreshold: Infinity`), which is 43%
of the prerendered document. Could it inline only what the first paint needs, the way other
SvelteKit apps do?

Short answer: the prize is about 6 KB compressed, and the usual tool for the job would defer rules
that dark-theme and Flat-toolbar launches need. Not recommended as things stand.

## What SvelteKit does

Read from `@sveltejs/kit` 2.70.3 in `node_modules`.

* `inlineStyleThreshold` is the only control. Every stylesheet a route needs that is shorter than
  the threshold is merged into one `<style>` block; the rest are linked. There is no notion of
  above-the-fold or per-rule selection (`src/exports/vite/build/build_server.js`).
* "Needed" follows the import graph, not what rendered. A stylesheet is eager when the module that
  imports it appears in both the client and the server build, including dynamic imports one level
  deep. A stylesheet only the client build reaches is loaded with its chunk. That second half
  arrived in kit PR 13564 (2025-03), which fixed issue 13546.
* For the drawing route that leaves five stylesheets inline:

  | Stylesheet                                    | Raw     | Compressed |
  | --------------------------------------------- | ------- | ---------- |
  | Layout: tokens, `app.css`, fonts              | 44.6 KB | 16.5 KB    |
  | Shared component chunk (`SettingsButton.css`) | 27.8 KB | 4.8 KB     |
  | Route page                                    | 9.7 KB  | 2.1 KB     |
  | `LiveSurface.css`, `Icon.css`                 | 0.7 KB  | 0.4 KB     |

  Sixteen further stylesheets load after hydration with the lazily imported overlays, so the lazy
  components are already out of the inline set. ADR-0164's figure of roughly 85 kB of lazy CSS in
  the inline set no longer describes the build.

## What other SvelteKit apps do

| Approach                   | How it works                                                                                                                                 | Seen in                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Inline everything          | `inlineStyleThreshold: Infinity`, often with `paths.relative: false` to keep font URLs working                                               | refact0r's blog write-up; this repo                            |
| Inline small files only    | A threshold around 1 kB, so tiny component sheets stop costing a request                                                                     | nagutabby/sveltekit-blog                                       |
| Post-build extraction      | Beasties (the maintained fork of Critters) rewrites each prerendered page: matched rules inline, the rest loaded with `media="print" onload` | nagutabby/sveltekit-blog PR 123, over a 110 KB Tailwind bundle |
| Let the import graph do it | Keep first-paint components statically imported and everything else behind `import()`                                                        | kit's own design since PR 13564; this repo's overlays          |

Beasties matches selectors against the static HTML without rendering it. Rules that match nothing at
build time are treated as non-critical unless they are allow-listed by pattern or marked with a
`beasties:include` comment.

## What the drawing route's CSS is made of

Chrome's CSS coverage, production build under `vite preview`, read 1.2 s after load with no
interaction. 32 launch states: four viewports, both color schemes, both toolbar styles, drawer open
and closed (`controls/launch-coverage.json`).

| Measure                                 | Raw          | Compressed   |
| --------------------------------------- | ------------ | ------------ |
| Inline CSS                              | 82.9 KB      | 22.2 KB      |
| of which the paper texture data URI     | 10.5 KB      | 9.2 KB       |
| Used by a single launch                 | 31.7–40.1 KB | not measured |
| Used by at least one of the 32 launches | 43.7 KB      | 16.0 KB      |
| Used by none of them                    | 39.2 KB      | 8.4 KB       |

Compressed sizes do not add up across rows, because each is compressed on its own. The honest saving
is the difference between the first and fourth rows: about 6 KB of a 51.6 KB document.

The unused half is mostly state the app reaches by interaction: flyout menus (6.2 KB raw), keyframes
(5.8 KB), dialogs and banners (4.5 KB), hover and press states (2.4 KB), reduced motion (1.7 KB).
Some of it is launch state the matrix did not cover and so is not actually deferrable: the
`data-off-*` rules for controls a parent has hidden (2.4 KB) are first-paint rules for those users.
The matrix also left out the AI slot, button scale and reduced motion.

## What a build-time tool would get wrong

A build-time tool sees the prerendered HTML as written. It cannot run the boot script in `app.html`
or read `localStorage`, so it never sees the attributes that script stamps on `<html>`. Measured by
taking coverage with JavaScript disabled and comparing it with real launches
(`controls/static-vs-real.json`):

| Analysis                                         | CSS real launches use that it never sees |
| ------------------------------------------------ | ---------------------------------------- |
| One pass, phone portrait, light                  | 9.7 KB raw                               |
| Eight passes: four viewports, both color schemes | 5.5 KB raw                               |

The missed rules are in `controls/missed-by-static.css.txt`. They are the ones keyed on
`:root[data-theme=dark]`, `html[data-toolbar=bare]`, `html[data-drawer-open]` and
`:root[data-app-surface]`. Deferred to a late stylesheet, those repaint after first paint for
exactly the launches the 2026-09-28 flicker work was about.

An allow-list of those attribute patterns would keep them inline. It would also be a second list of
the boot script's attributes to keep in step with `app.html`, which is the kind of agreement this
repo guards with a test rather than trusts.

## Options

| Option                                                                                       | Saves                                         | Cost and risk                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leave it                                                                                     | nothing                                       | none                                                                                                                                                 |
| Post-build Beasties with an allow-list                                                       | up to about 6 KB compressed                   | a new build step, a guarded allow-list, a late stylesheet request on every cold load, and press or hover states unstyled until it arrives            |
| Move interaction-only rules out of `app.css` into the lazily loaded components that use them | part of the same 6 KB, with no new tooling    | `app.css` keeps those classes global on purpose, for dialogs and imperative DOM; each move needs checking against that                               |
| Take the paper texture out of the inline CSS                                                 | 9.2 KB compressed, more than everything above | the paper is the largest paint on the route and was inlined so it arrives with the document; an external copy repaints the paper late on a cold load |

Not run: an actual Beasties build. The coverage comparison answers the question it would have
answered, which is what such a tool keeps.
