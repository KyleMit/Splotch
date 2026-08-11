# Handoff — page-inventory UI pass

> 2026-08-10 · branch `agent/page-inventory-ui-pass` · PR
> [#931](https://github.com/KyleMit/Splotch/pull/931) · One long autonomous pass over the design
> findings from the page-inventory scrapbook page: retool the generator, add design notes, land
> twelve UI fixes, then regenerate captures and re-run the critique.

## Objective & non-goals

Land every item below, commit iteratively, keep one draft PR current. **Non-goals:** no unrelated
refactors, no new routes, no changes to the critique's review contract beyond the design-notes
input.

## Work items

### Generator (`tools/page-inventory/`)

1. Drop `/dev`, `/dev/ai-timer`, `/dev/engine` — internal-only harnesses.
2. Make capture resilient to silent drops: a blank / near-uniform capture, or a portrait and
   landscape capture that come back byte-identical, must retry and then fail loudly rather than
   ship. (Evidence: every `dev-engine--*` capture in the previous run was a ~800-byte blank, and its
   portrait and landscape files were byte-identical — the generator emitted them without complaint.)
3. Design notes get a persisted home and reach the reviewer through `review_description`. General
   notes apply to every capture; per-surface notes key to `group/surface_id` and extend the existing
   `intent` metadata.

### Design notes to persist

**General**

1. The trash can is *docked* to the side, not clipped. Clicking it undocks it — intended.
2. The expander chevron and settings menu are intentionally low contrast so they don't compete with
   the drawing canvas.
3. A gradient blur is a sufficient and intended scroll-cue affordance.
4. On the activity bar, undo / AI / camera are intentionally low contrast while disabled; they
   enable after the first stroke. Do not report contrast issues on those buttons.

**Per surface**

* `controls/clear-coachmark` — the intended design. The animation sells it and doesn't survive a
  still.
* `controls/clear-drag-preview` — the faint canvas icons are the intended signal that a clear is
  underway.

### Fixes

Numbered as the user gave them; **#6 was added mid-conversation** (it was the gap in their list).

1. More palette colors — iPad mini portrait, Large iPad Pro portrait + landscape, plus another pair
   or two in the two-column landscape phone config. Interweave new hues the way the existing
   progressive palette does; responsive, never device-pinned.
2. Placeholder contrast (admin access key, feedback form; worst in dark mode) up to the minimum
   acceptable. If it stops reading as a placeholder, keep it dull and say so. Update `/design` →
   recipes → form row.
3. Extract the coloring-book scroll cue into a reusable design artifact; apply to the Android beta
   page, the mobile single-bar settings hub, and the wide two-column settings sidebar + content.
   Render only when the content actually overflows and is not scrolled to the end.
4. Secondary text is too muted in night mode — fix at the token level, vet across `/design`.
5. `/dev` index rebuilt on `PageShell.svelte`.
6. **No page opts out of night mode.** `/changelog`, `/privacy`, `/android-beta` pin a light-only
   `--page-*` palette today. Every route honors the user's night-mode preference. New tokens are
   acceptable if genuinely needed — add them to the design system. Then delete the `light-only`
   concept from the generator so its pixel-identical guard enforces this going forward.
7. Parent Center radio/grid layout — restore it wherever there is width to render without horizontal
   scrolling; if no shippable width exists, delete the dead code.
8. Action panel controls: slightly smaller baseline on small phones, slightly larger on Large iPad
   Pro. Must not eat the size slider's range — every screen starts centered with full travel.
9. ColorPicker modal grows on Large iPad Pro. Same swatch count, uniformly larger.
10. Coloring-book picker goes 2 wide × 4 down on portrait tablets. Drilled-in pages stay 3 × 2.
11. ClearCoachmark outlines follow the theme (white in dark mode), not pinned black.
12. Implement `docs/handoff/toc-design` (guide-rail `SidebarToc` across changelog, `/design`,
    settings sidebar) and `docs/handoff/changelog-design` (two-column changelog shell, scrollspy,
    phone disclosure). Register in the styleguide. Drain both packets when done.

### Then

Regenerate captures (spot-check the generator and notes on a subset first), then re-run the critique
as the authoritative result. The previous critique is deliberately discarded — the user has it
saved.

## Decisions made

* **TOC palette open question is closed by fix 6.** The toc-design packet asked whether `SidebarToc`
  should carry `var(--page-link, var(--brand-text))` fallbacks or the changelog should adopt the
  theme. Every page becoming themed means no fallbacks: one themed component, three hosts.
* **Packet conflict, changelog rail.** `changelog-design` specs a `2px --page-rule` rail with no
  radius; `toc-design` supersedes it with the guide-rail treatment (hairline track, 3px `--brand`
  active segment, trailing-corner radius). `toc-design` owns the visual; `changelog-design` owns the
  layout (two-column shell, scrollspy, phone disclosure).

## Reread first

* `tools/page-inventory/gen-page-inventory.mjs`, `lib/page-inventory-data.mjs`
* `.claude/skills/critique-page-inventory/SKILL.md`, ADR-0106
* `docs/handoff/toc-design/HANDOFF.md`, `docs/handoff/changelog-design/README.md`
* `design` skill + `web/src/lib/design/tokens.ts`
