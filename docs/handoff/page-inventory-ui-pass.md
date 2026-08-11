# Handoff — page-inventory UI pass

> 2026-08-10 · branch `agent/page-inventory-ui-pass` · PR
> [#931](https://github.com/KyleMit/Splotch/pull/931) · One long autonomous pass over the design
> findings from the page-inventory scrapbook page: retool the generator, add design notes, land the
> UI fixes, then regenerate captures and re-run the critique.

## Objective & non-goals

Land every item below, commit iteratively, keep one draft PR current. **Non-goals:** no unrelated
refactors, no new routes, no changes to the critique's review contract beyond the design-notes
input.

## Status

| Item                                                                    | State                 |
| ----------------------------------------------------------------------- | --------------------- |
| Generator: drop `/dev`, loud captures, design notes, spot-check filters | done                  |
| 1 · palette 10 → 15 colors, tiered trim                                 | done                  |
| 2 · placeholder contrast                                                | done                  |
| 3 · scroll cue extracted and applied                                    | in flight             |
| 4 · night-mode secondary text token                                     | done                  |
| 5 · `/dev` on `PageShell`                                               | done                  |
| 6 · no page opts out of night mode                                      | done                  |
| 6b · `theme-color` follows the theme on every route, including SPA nav  | done                  |
| 7 · Parent Center mode matrix restored behind a container query         | done                  |
| 8 · action-button baseline by size class                                | done                  |
| 9 · ColorPicker scales on large tablets                                 | done                  |
| 10 · coloring-books grid 2-up on roomy portrait                         | done                  |
| 11 · coachmark hand inks from `--icon-ink`                              | done                  |
| 12 · shared `SidebarToc` + changelog redesign                           | done, packets drained |
| Adversarial review round                                                | in flight             |
| Regenerate captures                                                     | not started           |
| Re-run critique                                                         | not started           |

## Decisions made

* **The TOC palette open question was closed by fix 6.** Every page is themed, so `SidebarToc` needs
  no per-host fallbacks and no `variant` prop.
* **Packet conflict, changelog rail:** `toc-design` owned the visual (guide-rail track, 3px
  `--brand` active segment), `changelog-design` owned the layout (two-column shell, scrollspy, phone
  disclosure). Both packets are now deleted.
* **`--page-link-hover` was deleted, not themed** — the themed ramp has no deeper-shade step, so
  keeping it would have made four `:hover` rules silent no-ops. Those links thicken their underline
  instead.
* **Fix 6 needed zero new tokens.** `PageShell`'s `--page-*` family already defaulted to themed app
  tokens; the three pinned routes were each hand-approximating a token that already existed.
* **Fix 4 was diagnosed with APCA, not WCAG 2.** The dark value scored *higher* than its light
  counterpart on ratio while reading worse; the real defect was the dark ramp stepping 12.6 Lc where
  light steps 7.1.
* **Fix 7's premise was stale** — the radio/grid path had been deleted outright on 2026-08-08, so
  there was nothing to gate. It was rebuilt behind a **container** query at 372px, because the same
  viewport hands that list 297px or 548px depending on which settings shell it is in.

## Open / carried forward

* The action-button slider minimum can still reach 35px (was 38.5px), below the 44px target floor.
  Pre-existing sub-44 floor, deliberate parent choice, left alone — raising it would clip the slider
  range the user asked to preserve.
* Phone landscape gained one extra swatch pair, not the two the user floated; a sixth row needs
  444px of height and the fifth ends at 440px.
* `AiResultDisclosure.svelte` carries a raw `#b3b1bf` matching the *old* dark `--text-soft`. Its
  comment says the strip sits on a backdrop that is dark in both themes, so it is independently
  chosen rather than drift — worth re-tuning for consistency, not a defect.
* ADR-0097 records `#b3b1bf` as a historical fact of that decision; ADR-0071 carries the live
  amendments.

## Reread first

* `tools/page-inventory/gen-page-inventory.mjs`, `lib/page-inventory-data.mjs`,
  `lib/page-inventory-design-notes.mjs`
* `.claude/skills/critique-page-inventory/SKILL.md`, ADR-0106 (amended by this run), ADR-0071
* `design` skill + `web/src/lib/design/tokens.ts`
