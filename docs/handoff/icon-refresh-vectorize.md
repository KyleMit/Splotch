# Handoff — icon refresh, vectorization pass

> 2026-08-06 · branch `claude/icon-updates-variants-v6kdlh` · vectorize the thirteen approved icon
> designs and wire them into the app

## Objective & non-goals

**Objective.** Ten approved raster icon designs are staged in `icon-refresh-assets/to-vectorize/`.
Turn each into a flat SVG, drop it into `web/src/lib/icons/`, and wire it up to the component that
consumes it.

**Non-goals.**

* Redesigning any icon. All ten were selected over ten rounds of review; the art is final. If one
  genuinely can't be traced cleanly, raise it rather than substituting a new design.
* Touching the three files in `icon-refresh-assets/ready-svg/`. Those are already vector and ship
  byte-for-byte.
* Building the Parent Center settings section. Its icon is included because it was designed
  alongside the rest, but the section itself doesn't exist yet.

## State

Branch carries a single commit; nothing in `web/src/` has been touched yet.

| sha       | what                                                                |
| --------- | ------------------------------------------------------------------- |
| (this PR) | Stages the approved icon art plus this packet under `docs/handoff/` |

Files added — all under `docs/handoff/`:

* `icon-refresh-assets/to-vectorize/*.png` — the ten approved designs, **named by the SVG filename
  each should become**. Trimmed to content and padded 6%, full generation resolution.
* `icon-refresh-assets/ready-svg/*.svg` — three finished vectors, copy in as-is.
* `icon-refresh-assets/ruled-out/*.png` — three runners-up, kept only so a reversal doesn't need a
  regeneration run. Not part of the work.

## Decisions made (and why)

**Five icons need a new file rather than a repaint.** This is the one thing most likely to cause a
silent regression, and it was verified by grepping every consumer rather than assumed. The obvious
name to reuse is, in each case, still needed by a different control:

| New file           | Why the existing name can't be repainted                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `appearance.svg`   | `theme-auto` is also the System option in the theme picker and AppearanceSection's inline setting icon |
| `sound.svg`        | `volume-on` is half of SoundSection's on/off ToggleRow pair with `volume-off`                          |
| `save-picture.svg` | `download` is AiImageResult's download button and the AiFeatureToggles row                             |
| `controls.svg`     | `dashboard-customize` is used inline by CompactShell and ControlsSection                               |
| `feedback.svg`     | `more-horiz` is the admin console's InviteLedger row menu                                              |

Three more are new files for their own reasons: `whats-new.svg` (What's New was only borrowing
`magic-brush`, which stays the drawing tool), `parent-center.svg` (brand new), and `setup.svg`
(`pin` has no other consumer, so this one *could* be a straight swap — but the name stopped
describing the art, so it's a rename with `pin.svg` retired after).

Only `camera.svg` and `magic-brush.svg` are true art replacements where every consumer wants the new
drawing.

**Offline pixel repair was tried and abandoned.** The approved Appearance icon had a red-orange
bleed down the sun's edge. Three targeted pixel repairs (hue-rotate, flat-fill, inpaint) all left a
visible seam, because the artifact was *darker* than the surrounding sun — recolouring couldn't fix
a value problem. A model redraw replaced it instead. Don't reach for pixel surgery on the others.

**A palette normalization is deliberately left for this pass.** Colors were measured from the
finished art, not specified up front. Yellows and creams are already tight. Blues are not: five
distinct ones survive across the set, and collapsing them to a mid blue plus a navy is the single
highest-value cleanup available while tracing.

| Group  | Observed                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| Blues  | `#56B2E9` parent · `#2A8CDC` rocket · `#1680EE` speaker · `#326999` phone · `#1E3A6B` rocket navy · `#212D4C` night/lens |
| Yellow | `#F9CA14` marigold · `#F3B021` sun · `#ECAF1E` folder · `#D48415` folder back · `#E3AA63` envelope flap                  |
| Cream  | `#FBECCE` · `#F7E8CB` · `#F4E6CD` · `#F2EBD9` · `#F2DFBC` · `#F0D2AD`                                                    |
| Accent | `#F87691` / `#E05C6C` / `#F44542` pink-red · `#3AAA3B` + `#6AB76E` green · `#8263CB` purple                              |

Green survives in exactly two icons — sound-on and setup-complete — where it carries meaning. That
was a deliberate keep, not an oversight.

## Unverified assumptions

* **The PNGs trace cleanly to flat shapes.** They're model-generated, so edges are anti-aliased and
  large fields may carry a few stray off-palette pixels. Nobody has run a tracer over them yet.
  Expect to snap colors to the flat values rather than trusting sampled output.
* **`pin.svg` really has no other consumer.** Verified by grep at the time of writing; re-check
  before deleting it, since `icon-orphans.test.ts` is the backstop either way.
* **The Parent Center icon's filename** (`parent-center.svg`) is a guess at what that unbuilt
  section will call it.
* **Nothing here has been rendered inside the running app** — only as standalone images.

## Done & verified

* Every design reviewed at 44px, the real button size. Three icons were simplified specifically
  because that check failed them.
* The Appearance icon verified programmatically at **zero** pixels in the red band (against 656
  before the repair), using a hue test that wraps across 0/360 — the artifact's core sat at
  358–360°, so a naive "hue below 35" test missed it entirely.
* Per-icon palettes measured from the actual artwork.
* No app code touched, so no app-level check was applicable or run. `web/src/` is untouched on this
  branch.

## Risks & next 3 steps

1. **Vectorize the ten PNGs** into flat SVGs, snapping to the palette above and collapsing the blues
   while doing it. Keep each file small — these sit in a static glob, not a lazy chunk.
2. **Land them**: drop into `web/src/lib/icons/`, run `npm run gen:icons` to regenerate the
   `IconName` union, then add all ten to `COLOR_ICONS` in `Icon.svelte`. `Icon.svelte.test.ts` fails
   any colorful icon that isn't registered, so skipping this is caught.
3. **Rewire and prune**: point `settings/sections.ts` at the new nav files and
   `ControlsSection.svelte` at the new camera, retire `pin.svg`, then screenshot the settings modal
   and `/design` in both themes for the PR.

**Risk:** the biggest one is the repaint-vs-new-file table above. Repainting `theme-auto`,
`volume-on`, `download`, `dashboard-customize`, or `more-horiz` would silently change an unrelated
control — the theme picker, the sound toggle, the AI download button, the controls rows, or the
admin ledger menu — and no test would catch it.

## Reread first

Visual reference (Claude artifacts, private to the repo owner until shared):

* [Final spec](https://claude.ai/code/artifact/13d35d8b-93df-44b1-aff4-fa289198766a) — every icon at
  full size and at 44px, with its target filename, consumers, and measured palette. The most useful
  single page for this work.
* [Harmonization pass](https://claude.ai/code/artifact/ab0c7636-8603-426a-be3c-b0678b5a7a96) — why
  the set coheres, with each redrawn icon beside its before.
* [Appearance red-bleed repair](https://claude.ai/code/artifact/ac2d27d7-802e-4dac-98d5-a4b2cc769589)
  — the artifact that was fixed, and the approaches that failed.

Source files:

* `.claude/rules/svelte.md` — the icon-adding steps and the `COLOR_ICONS` requirement.
* `web/src/lib/components/Icon.svelte` — the `COLOR_ICONS` set and the `import.meta.glob` that picks
  icons up.
* `web/src/lib/components/settings/sections.ts` — the nav entries to repoint.
* `web/src/lib/components/iconTypes.ts` + `icon-orphans.test.ts` — what guards unused icons.
* The `design` skill — iconography rules and the spot-vs-monochrome split.
