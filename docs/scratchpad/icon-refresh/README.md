# Splotch icon refresh candidates

Review-only candidates for consolidating Splotch around spot illustrations and Material Symbols
Rounded. Nothing in `web/` changes on this branch. The browser review surface is
[`contact-sheet.html`](contact-sheet.html); the five Playwright renders are in
[`contact-sheet/`](contact-sheet/).

## Important limitation

Vectorizer.AI reported `subscriptionPlan: none`, `subscriptionState: ended`, and `credits: 0` before
work started. Three selected spot rasters were exercised through the documented free test recipe.
Each call reported "Would have cost: 1 credits" and "Charged: 0 credits", but the free watermark
covers the SVG with dense lettering and makes it unusable for visual review. No production call was
made.

The clean spot SVGs here are therefore manual vector interpretations of the selected generated
shapes, not paid Vectorizer results. They are useful for silhouette, scale, palette, and theme
review, but must be replaced by production traces or deliberately accepted as hand-authored SVGs
before shipping. The account still reported 0 credits after the work.

## Build and normalization

* Spot raster references: `appearance`, `sound`, `setup`, and `camera`; `trash-open` replaced
  `setup` for swipe-down. Each SVG was rasterized with Sharp before generation.
* Image generation: built-in image generation tool; the tool does not expose a model name. All
  outputs were 1254×1254 RGBA despite the 1024×1024 prompt and were normalized to 1024×1024 on white
  for tracing.
* Spot variants: six independent generations per subject, in two rounds of three. The model added
  tonal gradients in both rounds despite the flatness constraints, so generation stopped at the
  two-round guardrail.
* Test tracing: `processing.palette` included the requested Splotch palette and transparent white;
  `output.gap_filler.enabled=false`, `output.shape_stacking=stacked`, `output.group_by=color`, and
  `processing.shapes.min_area_px=2`. Raw and post-processed test traces remain only under
  `/tmp/splotch-icon-refresh/`.
* Material source: `@material-symbols/svg-400@0.47.4`, Rounded, weight 400, FILL 1. The four names
  absent from that package (`new_releases`, `auto_awesome`, `smart_button`, `auto_fix_high`) came
  from Google's FILL 1 static SVG endpoint.
* Every committed candidate is on `viewBox="0 0 1000 1000"`. Material's `viewBox="0 -960 960 960"`
  is rebased with `translate(0 1000) scale(1.0416666667)`.
* The repo rebase and optimizer CLIs are hard-coded to `web/src/lib/icons` and `web/**/*.svg`, which
  this task may not modify. [`build-candidates.mjs`](build-candidates.mjs) reproduces their baked
  1000-grid transform and exact pinned multipass SVGO configuration in the scratchpad instead.

## Bucket 1 — spot illustrations

| Candidate                                       | Selected variant | Method and assessment                                                                                                                                              | ADR-0102 follow-up                                                                                                                                                                               |
| ----------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`accessibility`](candidates/accessibility.svg) | 3                | Side-view hand pressing an oversized target. The concept is direct, but the horizontal silhouette is less immediately "accessibility" than the open-palm variants. | Theme the pink target, amber hand, blue cuff, and navy cuff separately. Each outer color falls below 3:1 on at least one of `#ffffff`, `#f8f8f8`, `#7c50bb`, `#23232b`, `#2d2d37`, or `#8058c0`. |
| [`swipe-down`](candidates/swipe-down.svg)       | 4                | Compact palm-down hand plus a separate down arrow. This is the strongest generated concept at 28px and does not duplicate the trash can.                           | Theme the amber hand, blue cuff, and navy arrow separately; blue/navy disappear on dark and purple grounds, while amber is weak on light and purple.                                             |
| [`undo`](candidates/undo.svg)                   | 5                | Two-tone counter-clockwise arrow with an inset amber return stroke. It preserves the current silhouette while joining the set's color-blocked language.            | Theme the purple body and amber inset independently. Purple fails dark and brand grounds; amber is weak on light and brand grounds.                                                              |

Variant grids: [accessibility](variants/accessibility-grid.webp),
[swipe-down](variants/swipe-down-grid.webp), and [undo](variants/undo-grid.webp).

### Exact generation prompts

Each image used the subject's shared prompt verbatim, followed by exactly one numbered variant
direction below.

#### Accessibility, round 1

```text
Use case: logo-brand
Asset type: 1024×1024 settings-section spot icon candidate for Splotch, a children's drawing app for ages 2–5.
Input images: four reference icons from the existing Splotch spot-icon set; match the same set, same palette, same visual weight, and same simple two-tone shading.
Primary request: Create one accessibility icon showing a big friendly open hand reaching toward one oversized rounded button. Make the accessibility concept immediately recognizable without relying on text or standard wheelchair symbolism.
Scene/backdrop: pure white background.
Style/medium: clean flat vector-like illustration, premium toddler-app aesthetic, large soft chunky rounded geometric forms, thick silhouettes, minimal detail, clean flat color blocking, no outlines.
Composition/framing: one centered subject with approximately 12% empty margin on every side.
Color palette: use only 6–8 colors chosen from cream #f5e9d1, amber #f5a623 or #f5b825, blue #3f68a8 or #56b2e8, pink #f33d6e or #ef407d, green #6ab76d, deep purple #4a1a9e or #3d2570, navy #212d4c, brand purple #7c50bb.
Constraints: pure white background; flat color blocking; no gradients; no drop shadows; no outlines; no texture; no gloss; no bevels; no text; no letters; no watermark; no border; at most 8 colors; readable at 32px; keep all important shapes fully inside the canvas.
```

1. `Variant direction: palm-forward open hand at lower left, one large rounded square button at upper right, with a short friendly reach gesture.`
2. `Variant direction: centered upright open palm in front of a large rounded button plate, with the index finger gently approaching the button.`
3. `Variant direction: side-view hand with a clear extended index finger pressing a large circular button; use simple overlapping forms and strong silhouette.`

#### Accessibility, round 2

```text
Use case: logo-brand
Asset type: 1024×1024 settings-section spot icon candidate.
Use the four input images only as style references. Match their exact visual language: a few large solid-color SVG-like shapes, same palette, same visual weight.
Create one accessibility icon for Splotch showing a friendly hand interacting with one oversized rounded control.
CRITICAL FLATNESS REQUIREMENT: every visible region must be one perfectly uniform solid fill. Absolutely no gradients, no lighting, no highlights, no shadows, no soft edges, no texture, no transparency, no 3D depth, no outlines. Pure opaque white (#ffffff) background.
Center the subject with about 12% white margin. Use at most 6 colors, only from #f5e9d1 #f5a623 #f5b825 #3f68a8 #56b2e8 #f33d6e #ef407d #6ab76d #4a1a9e #3d2570 #212d4c #7c50bb. Large chunky rounded geometry, minimal detail, readable at 32px. No text, letters, watermark, or border.
```

4. `Variant 4: an open palm and a separate large rounded-square push button, arranged diagonally with a strong compact silhouette.`
5. `Variant 5: a simple child-scale figure with arms open beside one oversized rounded button; keep the figure abstract and made from only circles and rounded blocks.`
6. `Variant 6: side-view hand with one extended finger touching a large circular button; use exactly five solid-color shapes if possible.`

#### Swipe-down, round 1

```text
Use case: logo-brand
Asset type: 1024×1024 coachmark spot icon candidate for Splotch, a children's drawing app for ages 2–5.
Use the four input images only as style references. Match the exact same set, palette, simple two-tone color blocking, visual weight, and chunky silhouette; it will appear next to the referenced orange open trash bin.
Create one pointing hand that teaches a downward swipe, with an unmistakable downward motion cue. The hand and cue are the entire icon.
Pure opaque white (#ffffff) background. Flat vector-like illustration with large soft rounded geometric forms, thick silhouettes, minimal detail, clean color blocking, no outlines.
Center the subject with about 12% empty margin. Use 6 colors or fewer from #f5e9d1 #f5a623 #f5b825 #3f68a8 #56b2e8 #f33d6e #ef407d #6ab76d #4a1a9e #3d2570 #212d4c #7c50bb.
No gradients, no drop shadows, no texture, no gloss, no bevels, no text, no letters, no watermark, no border. Readable at 28px; keep every shape fully inside the canvas.
```

1. `Variant 1: palm-facing hand at top with index finger pointing straight down; one broad blue downward arrow below the fingertip.`
2. `Variant 2: side-view hand swiping from upper left toward lower center; show the motion with two short descending rounded dashes and one arrowhead.`
3. `Variant 3: compact fingertip and hand silhouette centered over a wide downward chevron, with orange and navy as the dominant colors.`

#### Swipe-down, round 2

```text
Use case: logo-brand
Asset type: 1024×1024 swipe-down coachmark spot icon.
Use the four input icons as style references: match their few large shapes, palette, visual weight, and compact silhouette.
Subject: a friendly simplified pointing hand teaching one downward swipe, with a clear downward motion cue. It appears beside the orange open trash icon.
IMPORTANT: render as hard-edged paper cutouts made from uniform construction paper. Each region is exactly one solid flat color with zero tonal variation. No gradients, no lighting, no highlights, no shadows, no feathering, no texture, no transparency, no 3D depth, no outlines.
Pure opaque white #ffffff background. About 12% white margin. At most 6 colors from #f5e9d1 #f5a623 #f5b825 #3f68a8 #56b2e8 #f33d6e #ef407d #6ab76d #4a1a9e #3d2570 #212d4c #7c50bb. No text, letters, watermark, or border. Readable at 28px.
```

4. `Variant 4: an orange palm-facing hand at the top, index finger pointing down, and one navy downward arrow below. Four large shapes only.`
5. `Variant 5: a cream side-view hand moving downward, with three stacked blue rounded motion marks that end in a broad arrowhead.`
6. `Variant 6: a compact amber hand and one deep-purple down chevron, with three pink motion ticks between them.`

#### Undo, round 1

```text
Use case: logo-brand
Asset type: 1024×1024 toolbar spot-icon candidate for Splotch, a children's drawing app for ages 2–5.
Use the first three input images as the target spot-icon style and the fourth input image as the current undo silhouette. Preserve the unmistakable counter-clockwise undo arrow concept but refresh it with the set's simple two-tone color blocking.
Pure opaque white #ffffff background. Flat vector-like illustration, large soft chunky rounded forms, thick silhouette, minimal detail, no outlines. Center one compact subject with about 12% margin.
Use 4 colors or fewer from #f5e9d1 #f5a623 #f5b825 #3f68a8 #56b2e8 #f33d6e #ef407d #6ab76d #4a1a9e #3d2570 #212d4c #7c50bb.
No gradients, no drop shadows, no texture, no gloss, no bevels, no text, no letters, no watermark, no border. Readable at 32px.
```

1. `Variant 1: chunky orange counter-clockwise arrow with a navy inner return segment, one continuous simple loop.`
2. `Variant 2: broad blue counter-clockwise arrow with a cream inset highlight block on the lower curve.`
3. `Variant 3: pink counter-clockwise arrow with a darker purple arrowhead and a large open center.`

#### Undo, round 2

```text
Use case: logo-brand
Asset type: 1024×1024 toolbar spot-icon candidate.
Use the first three inputs as the target Splotch spot-icon set and the fourth as the current undo silhouette. Create one unmistakable counter-clockwise undo arrow with two-tone color blocking.
IMPORTANT: render as hard-edged flat paper cutouts. Every region is exactly one uniform solid fill, with zero tonal variation. No gradients, lighting, highlights, shadows, feathering, texture, transparency, 3D depth, or outlines.
Pure opaque white #ffffff background. One centered compact silhouette with about 12% white margin. At most 4 colors from #f5e9d1 #f5a623 #f5b825 #3f68a8 #56b2e8 #f33d6e #ef407d #6ab76d #4a1a9e #3d2570 #212d4c #7c50bb. No text, letters, watermark, or border. Readable at 32px.
```

4. `Variant 4: orange arrow body with a dark-blue arrowhead; generous round open center.`
5. `Variant 5: dark-purple arrow body with one amber inset stripe that follows the outer lower curve.`
6. `Variant 6: blue arrow body with a pink arrowhead and a cream circular center cutout.`

## Bucket 2 — Material Symbols Rounded

All candidates are monochrome, FILL 1, weight 400, and re-ink correctly in the contact sheet.

| UI concept                | Candidate files · Material source names                                                                                                                                                                                                                  | Read                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Release · new             | [`new_releases`](candidates/release-new-new-releases.svg), [`auto_awesome`](candidates/release-new-auto-awesome.svg)                                                                                                                                     | `new_releases` is explicit; `auto_awesome` is warmer and less release-specific.                       |
| Release · improved        | [`trending_up`](candidates/release-improved-trending-up.svg), [`upgrade`](candidates/release-improved-upgrade.svg)                                                                                                                                       | `trending_up` communicates improvement; `upgrade` reads more like upload at 20–24px.                  |
| Release · fixed           | [`build`](candidates/release-fixed-build.svg), [`healing`](candidates/release-fixed-healing.svg)                                                                                                                                                         | `healing` is more friendly; `build` is more conventional but tool-centric.                            |
| Auto-Save on Delete       | [`archive`](candidates/camera-party-archive.svg), [`save`](candidates/camera-party-save.svg), [`history`](candidates/camera-party-history.svg)                                                                                                           | `archive` best combines deletion and retention; `save` is generic; `history` suggests recoverability. |
| Button size               | [`touch_app`](candidates/photo-size-select-small-touch-app.svg), [`fit_screen`](candidates/photo-size-select-small-fit-screen.svg)                                                                                                                       | `touch_app` describes target size better; `fit_screen` risks reading as fullscreen.                   |
| AI · Try again            | [`refresh`](candidates/refresh.svg)                                                                                                                                                                                                                      | Clear replacement for the hairline arrow.                                                             |
| Button style row label    | [`smart_button`](candidates/button-style-row-smart-button.svg)                                                                                                                                                                                           | Good semantic match, slightly detailed at 20px.                                                       |
| Feedback picker           | [`bug_report`](candidates/feedback-bug-report.svg), [`lightbulb`](candidates/feedback-lightbulb.svg)                                                                                                                                                     | Strong, familiar pair with distinct silhouettes.                                                      |
| Parent Center policy rows | [`auto_fix_high`](candidates/policy-auto-fix-high.svg), [`flag`](candidates/policy-flag.svg), [`open_in_new`](candidates/policy-open-in-new.svg), [`mail`](candidates/policy-mail.svg), [`supervisor_account`](candidates/policy-supervisor-account.svg) | All five remain distinct at 24px; `supervisor_account` is the busiest.                                |

## Bucket 3 — derived mono glyphs

| Candidate                                                   | Method                                                                                                                                 | Read                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`dashboard-customize`](candidates/dashboard-customize.svg) | Reuses the exact track centers and knob centers from `controls.svg`; tracks and knobs are reduced to Material-like weight and one ink. | Strong one-concept/one-silhouette link to the spot icon and legible at 20–24px. |
| [`button-style-raised`](candidates/button-style-raised.svg) | Two overlapping filled rounded squares create one visible down-right step.                                                             | Reads as a raised tile at 20px, but could use slightly more offset.             |
| [`button-style-flat`](candidates/button-style-flat.svg)     | 83-unit filled outline on the 1000 grid.                                                                                               | Clean contrast with Raised and survives fill-only runtime re-inking.            |

## Open review questions

1. Is the accessibility hand-and-button concept recognizable enough, or should the next art round
   favor the child-scale open-arms figure?
2. Should the swipe-down coachmark keep a separate arrow, or should motion be implied entirely by
   the coachmark animation?
3. Is the two-tone undo worth the extra ADR-0102 theme work over the current flat orange arrow?
4. For release notes, does explicit semantics (`new_releases`, `trending_up`, `healing`) beat the
   warmer but more abstract trio (`auto_awesome`, `upgrade`, `build`)?
5. For Auto-Save on Delete, should the row promise storage (`archive`) or recovery (`history`)?
