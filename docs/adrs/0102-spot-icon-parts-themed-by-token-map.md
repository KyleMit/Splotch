# ADR-0102: Theme Individual Spot-Icon Paths with a Per-Icon-Part Token Map

**Status:** Active — amends [ADR-0052](0052-dark-mode-theme-tokens.md) and
[ADR-0071](0071-design-token-single-source.md). **Date:** 2026-08

## Context

ADR-0052 themes the monochrome glyphs wholesale: they bake `fill="#1f1f1f"` and one `app.css` rule
re-inks them to `--icon-ink`. The full-color "spot" icons deliberately opt out of that rule via the
`COLOR_ICONS` set in `Icon.svelte` — they carry their own palette — which meant nothing themed them
at all.

Rendering all of them against the real grounds showed the damage. A spot icon rests on three
surfaces: a resting hub or sidebar row (`--surface-2` / `--surface`), and a selected row painted
`--brand-solid`. `--brand-solid` is nearly the same value in both themes (`#7c50bb` / `#8058c0`), so
it does not pull the two themes' palettes toward each other — it pushes each away from the middle.
On the light grounds only dark colors clear both the near-white card and the purple; on the dark
grounds only pale ones clear both `#2d2d37` and the purple. `appearance`'s night half measured
**1.00:1** against the dark card — mathematically identical luminance — so the dark-mode control
itself was the worst offender.

The fix is not one palette shift. Individual paths have to move in opposite directions per theme,
and where a shape shades against a neighbour (rocket body vs. window, brush handle vs. ferrule) the
two themes have to *invert* the relationship rather than preserve it. Within one file the same
source color can even need to split: `wand-stars` paints both the wand and the "AI" badge plate
`#7325e3`, and in dark the wand must go pale while the badge must go deeper, or the cream letters on
it stop being readable.

## Decision

**Same geometry, same file — only the paint varies by theme, through a per-icon-part token map.**

1. **`web/src/lib/design/iconTokens.ts`** holds the map, keyed by icon then part, each part carrying
   a `light` and a `dark` hex. It is keyed by `CommonIconName`, so renaming or deleting an icon
   fails to compile.
2. **`scripts/gen-tokens.mjs` emits them as `--icon-<icon>-<part>`** into the same three blocks it
   already generates for `ThemeTokens` — `:root`, `:root[data-theme='dark']`, and the
   `prefers-color-scheme` mirror. Naming is mechanical, so there is no naming debate per addition.
3. **The SVG paints with `style="fill:var(--icon-camera-body,#3f68a8)"`** — the spelling already
   shipping in `size-eraser-1..5` and `line-weight-eraser`, so it is proven on our browser floor.
   The `,#hex` fallback keeps the raw file rendering correctly standalone (GitHub previews,
   `gen-icons-sheet`, design-tool round-trips).
4. **A bidirectional drift guard** in `web/src/lib/icons/tokenFallback.test.ts` walks every shipped
   SVG and asserts both that each `var(…, #hex)` fallback equals its entry's `light` value and that
   every entry in the map is referenced by some SVG.

The first pass converted ten icons and twenty parts; `feedback`, `splotchy`, `more-colors`,
`eraser`, `trash-closed`, `trash-open`, and `undo` needed no per-theme part and stay untouched.

### Why the tokens live outside `ThemeTokens`

`ThemeTokens` is the curated semantic vocabulary that ADR-0097 and ADR-0098 spent two passes
pruning. Twenty entries named `iconAppearanceNight` sitting in it is exactly the surface those ADRs
removed, and each one would then owe a "reach for it when…" rule in `tokenUsage.ts` and a specimen
on `/design` — documentation for a value no component may ever reference. A separate map reads as
what it is: a per-asset lookup table that can grow to fifty entries without anyone feeling it. The
rule that distinguishes them is *reachability* — a semantic token is something a component style may
reference; an icon-part token only ever paints the one path that names it.

## Consequences

* **Dark mode is legible across the whole spot set,** including on the selected row, and the icons
  now read as two deliberate sets rather than one file stretched over four surfaces.
* **Adding a themed part is three edits with no design debate:** an entry in `iconTokens.ts`, `npm
  run gen:tokens`, and the `var()` in the SVG. `npm run img:audit` after any SVG edit.
* **The reverse drift check is the load-bearing half.** The realistic failure is an artist
  re-exporting an icon from source, which silently wipes the `var()` and reverts the path to its
  baked light hex — no error, no visual change in light mode, just a dark-mode regression nobody
  notices for a month. The reverse check turns that into a red test.
* **The two themes' values are not derivable from each other,** by design. Both sets start from the
  original artwork; `magic-brush`'s ferrule is lighter than its handle in light and darker in dark,
  and `whats-new`'s window inverts against its body. Nothing enforces those relationships but the
  reference sheet and the review checklist — a future "just lighten the dark set" refactor would
  undo them.
* **`iconThemes` keys the map by `CommonIconName` but the part names are free strings.** The
  compiler catches a deleted icon; only the drift guard catches a mistyped part.
* No FOUC risk: `tokens.css` and `app.css` are both imported by `+layout.svelte`, landing in the
  same render-blocking layout stylesheet.

## Alternatives considered

* **Two files per icon, `light/` and `dark/`** (the shape the original handoff assumed). Doubles the
  shipped bytes for icons whose geometry is identical, and forces three pipeline changes:
  `Icon.svelte`'s `import.meta.glob` keyed by `name + theme`, `generate-icon-names.mjs` filtering
  out the duplicate names, and a runtime read of the *resolved* theme (`settings.theme` can be
  `'system'`) to pick the variant — a JS dependency for something CSS does with no script at all. It
  also gives the two sets no shared geometry, so a shape edit has to be made twice.
* **`light-dark()` in the SVG paint.** Needs Chrome 123 / Safari 17.5, above the supported floor
  (`docs/COMPATIBILITY.md`) — the same reason ADR-0052 rejected it for the theme tokens.
* **An in-SVG `<style>` block with a `prefers-color-scheme` rule.** Does not survive the pipeline:
  SVGO's `preset-default` inlines ordinary rules onto elements and strips the classes, and silently
  *deletes* the media-query rules. It would also miss the explicit `data-theme` choice entirely.
* **A `class` hook on a wrapping `<g>`, styled from `app.css`.** `collapseGroups` folds a
  single-child group's class onto that child, so group-level hooks are unreliable through the
  optimizer.
* **Entries in `ThemeTokens`** — see above.
