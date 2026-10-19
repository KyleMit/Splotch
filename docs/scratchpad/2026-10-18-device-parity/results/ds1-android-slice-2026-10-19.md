# DS-1 slice: Android emulator drawing-screen chrome, 2026-10-19

Refs #2978. This is a diagnostic slice of DS-1 (`../execution-plan.md`), not a DS-1 run. It fills
the `android-api36` cells that the iOS slice (`../ds1-slice-2026-10-19.md`) skipped for disk space.
It verifies no requirement row and found no defect in `rn`.

## What ran

* **`rn`:** the RN Release APK of 00fcc5c78d1031873db1a214301c008daa4bd080, bundle ID
  `art.splotch.migration.probe`, SHA-256 `f2704d0abeaa0685…`.
* **`ref160`:** the reconstructed v1.6.0 reference, source 6572ed535f243d06e3f7bcaa5986218cac006d86,
  bundle ID `art.splotch.app.baseline.release`, APK SHA-256 `099f4bf957b9b45c…`.
* **Target:** `android-api36`, a Pixel 7 API 36 emulator (411 × 914 dp, density 2.625). It was
  cold-booted with wiped data and no snapshot, with gesture navigation and SystemUI demo mode.
* **Axes:** Raised/Flat × light/dark × portrait/landscape on `rn`. On `ref160` the axes are Raised
  only, because v1.6.0 predates the Button style setting.
* **States:** S1, S2 and S3; the open "Stroke width" menu for Pen and for Eraser; S6 in phone
  landscape; the S7 picker; and S12 on the first Farm page.
* **Landscape:** each arm reached landscape through the emulator's virtual sensor with Auto-rotate
  on, after its own rotation lock was released through public controls. Both arms of every pair were
  captured at the same rotation, with the camera cutout on the right.

Every still met the plan's settle rule. Each time the S12 stroke driver ran its cardinality check,
it passed: three strokes gave three Undos, and the joined negative control gave one.

| Pairing         | Pairs | Notes                                                                 |
| --------------- | ----: | --------------------------------------------------------------------- |
| `rn` × `ref160` |    28 | Four Raised cells × seven states                                      |
| `rn` only       |    32 | The four Flat cells, plus S6, which v1.6.0 has no phone-landscape for |

There is no `web-prod` arm on Android, so the Flat cells are unjudged. The 88 stills (`rn` 60,
`ref160` 28) are kept privately with their accessibility sidecars, diff heatmaps and side-by-sides.

## The iOS slice's defects

All four were fixed before this head. On Android none reproduces:

| iOS defect                                        | Fix                                                                 | Android at this head                                            |
| ------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| D1: Stroke width glyph vanishes in the Color Menu | afd08dbe2db7, a new icon glyph mounts fresh                         | The glyph stays, dimmed                                         |
| D2: the selected swatch ring has a halo           | bbc309708a61, the float shadow hangs from a box under the ring      | A flat gap between ring and paint, as on `ref160`               |
| D3: Clear clipped at the paper edge in landscape  | 6df947af6f5c, the docked Clear tab overhangs a landscape side inset | Clear overhangs into the band                                   |
| D4: phone-landscape action row spacing            | 353e01e35db8, the row is spaced as shipping renders it              | 12 dp between tiles and 4 dp before the chevron, as in shipping |

## Differences from `ref160`

**Reference drift, where `rn` follows shipping changes made after v1.6.0 (2026-09-09):**

* **The status band.** `rn` paints the band behind the status bar, and in landscape along the cutout
  edge, in the ink colour. `ref160` leaves it white. Shipping enabled Android edge-to-edge on
  2026-09-30 (3995d33dc823).
* **The phone-landscape chevron.** `rn` points it diagonally, so the open chevron reads as an "L".
  `ref160` points it sideways. Shipping turned it diagonal on 2026-09-10 (59c50782e2c9).
* **The phone-landscape layout.** `rn` shows the Color Button and the Color Menu where `ref160`
  shows the two-column palette, so the landscape drawer and Clear frames are not comparable. This is
  the same drift the iOS slice records.
* **The portrait palette spacing.** `rn` swatches sit 3 to 12 dp from `ref160`'s, the same v1.6.0
  spacing the iOS slice records as drift.
* **The bottom-corner icons.** `ref160` draws the chevron and gear lighter (darkest pixel 183/255
  against `rn`'s 130). The iOS captures show the same values, and there the iOS slice found `rn`
  within 2/255 of `web-prod`.

**Comparator artifact.** `ref160`'s WebView reports its brush and size toggles unchecked whatever is
chosen, so every "selected" mismatch is the reference's tree, not `rn`'s. `rn` exposes the chosen
option as selected. The A11Y-2 record carries this.

**Unjudged without `web-prod`:**

* **The S7 picker.** The picker sits 25 to 27 dp higher on `rn` in every cell; the hexagons agree in
  size within 2 dp. v1.6.0's WebView was not edge-to-edge, so its picker centres in a shorter
  viewport.
* **Clear's height in landscape.** `rn` places the Clear tab's top at 48 dp; `ref160` places it at
  19 dp.
* **The portrait Collapse chevron.** With the drawer open in portrait, `rn`'s chevron sits 4.6 dp
  from `ref160`'s. Every other drawer tile is within 2 dp.

**S12 ink is not compared.** `rn`'s ink follows the driven paths: one zigzag, one loop and one
diagonal. On this emulator, `ref160` lays down extra copies of the same strokes, offset sideways:
two in landscape, more in portrait. Both arms received the same taps and stroke samples, and each
batch began from a fresh install. Why v1.6.0 does this under synthetic touch was not investigated.
The portrait page placement matches.

Everywhere else in the 28 pairs, `rn` matched `ref160` within 2 dp on control frames and 2/255 on
the sampled colours. That includes the portrait drawer, both width menus and the brush menu.

## Not covered

* S0 recordings, the per-size stills S4.1 to S5.5, S8 to S11, S13, and the V1 to V5 variants.
* A `web-prod` arm at this viewport, which would judge the Flat cells and the two unjudged
  differences.
* `android-tablet` and every larger font size.
