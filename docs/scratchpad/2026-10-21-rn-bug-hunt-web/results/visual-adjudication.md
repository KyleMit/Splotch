## Visual observations and decision rule

The owner's rule is “whatever is better.” A pixel or box difference is recorded even when it is
neutral or beneficial. It becomes a new finding only after two reproductions establish a visible
regression against shipping. The capture and metric matrix is exhaustive for the requested cells;
manual visual judgments below name the samples actually inspected.

Initial inspected samples: Chromium 390×844, Light / Raised / 100%, all eight states; full-size
Settings cards and enlarged Cat art detail. The rendered controls align within 2 px in the blank,
drawer, picker, brush, width, Clear-drag and coloring samples. The Settings measurement pilot
mistakenly compared RN's full-screen semantic dialog with shipping's card; the full campaign
measures the actual RN `modal-surface` card. That pilot container mismatch is not a product
difference.

* **Backdrop treatment:** RN blurs the drawing behind the picker and Settings, while shipping's
  capture is sharper under its dimming. This changes many pixels without changing picker geometry.
  The RN treatment keeps the choice legible and does not establish a regression.
* **Settings typography and row geometry:** both arms load Quicksand Variable. In Chromium,
  shipping's hub row buttons use Arial; in WebKit they use the system-ui default. RN's rows use
  Quicksand. The receipts record computed font family, weight, size and line height, as well as
  font-face loading status. In the 320×568 Light / Raised / 100% capture, row geometry differences
  accumulate to about 30 px near the bottom of the scrolling list. This is a real parity
  observation, not the corrected semantic-container error. A larger target or a different wrap is
  not by itself a worse experience.
* **Coloring rasterization:** Cat's outlines differ across the paired images even when the drawing
  controls match. The enlarged face/paws sample remains crisp and recognizable in both arms. A high
  whole-screen pixel percentage is insufficient to call the RN art worse.

Numerical ranges and additional inspected samples follow. No new visual finding is established by
the reviewed samples; the complete per-pair metrics remain available for further inspection.

Additional inspected sample: Chromium 320×568, Dark / Flat / 130%, all eight states in the
[review sheet](../evidence/visual/chromium/phone-320x568/dark-bare-130/review-sheet.png). No main
control, picker cell or flyout option has a box difference >2 px in this configuration. Pixel
percentages range from 0.252% (drawer) to 8.933% (Settings); the Settings row displacement reaches
29.992 px. The large controls and flyouts remain identifiable; the card's lower rows are scrollable
in both arms. This sample does not establish a worse RN result.

Additional inspected sample: Chromium 844×390, Dark / Flat / 130%, all eight states in the
[landscape review sheet](../evidence/visual/chromium/phone-844x390/dark-bare-130/review-sheet.png).
The Color Button replaces the palette, the brush and width flyouts run horizontally, and Settings
uses its compact landscape opening view in both arms. The picker and drawing controls retain their
paired geometry. The different backdrop blur and outline rasterization remain observations.

The matrix uses identical engine-default user agents in each pair, touch-enabled phone/tablet
viewports, no notch safe-area emulation and DPR 1. It proves responsive viewport parity for these
contexts; it is not an Android/iOS browser-identity or physical-device visual acceptance matrix. The
expanded tablet capture confirms that Mint and the other visible swatches are collected from their
DOM palette ancestry, including names omitted by the discarded collector whitelist.

Additional inspected sample: Chromium 1180×820, Dark / Flat / 130%, all eight states in the
[tablet landscape review sheet](../evidence/visual/chromium/tablet-1180x820/dark-bare-130/review-sheet.jpg).
Every measured box, including the wide Settings shell and its mapped controls, stays within 2 px.
The pixel difference ranges from 0.053% on blank paper to 3.301% on the coloring page. Both arms
show the left palette rail, bottom drawer, horizontal flyouts and wide Settings navigation. No
visible regression is established by this sample.

Additional inspected samples: Chromium 820×1180 Light / Raised / 100%
([portrait tablet sheet](../evidence/visual/chromium/tablet-820x1180/light-buttons-100/review-sheet.jpg))
and 1920×1080 Dark / Flat / 130%
([large desktop sheet](../evidence/visual/chromium/desktop-1920x1080/dark-bare-130/review-sheet.jpg)),
each across all eight states. The desktop's expanded palette includes Indigo, Mint and Magenta in
both DOM receipts, and its large picker remains aligned. The desktop sample has no >2 px box
differences; pixel differences range from 0.027% on blank paper to 1.994% on Cat. The representative
sheets show no visible regression to promote to a finding.

Additional inspected sample: WebKit 26.6, 320×568 Dark / Flat / 130%, all eight states in the
[WebKit phone sheet](../evidence/visual/webkit/phone-320x568/dark-bare-130/review-sheet.jpg). Main
control, drawer, palette, picker and flyout rectangles align within 2 px. Settings row displacement
reaches 20.094 px in this sample, with the same wrapping distinction. Pixel differences range from
0.092% on blank/drawer to 6.687% on Settings; Cat differs by only 0.376%. Backdrop and art
differences are smaller here than in Chromium. No worse RN result is established by the inspected
WebKit sample.

Additional inspected samples, each across all eight states:

* [WebKit 1920×1080 Dark / Flat / 130%](../evidence/visual/webkit/desktop-1920x1080/dark-bare-130/review-sheet.jpg).
  The large picker, palette rail, dock, wide Settings and held Clear match their intended layouts.
* [Firefox 320×568 Dark / Flat / 130%](../evidence/visual/firefox/phone-320x568/dark-bare-130/review-sheet.jpg).
  The small-screen controls, picker, flyouts and held Clear remain aligned. No retained visible
  stroke halo appears in this sample. Settings retains the observed font/wrap distinction.

Neither inspected sample establishes a worse RN result. The raw per-state metrics, rather than the
lossy review sheets, remain the numerical authority. `repro/review-sheet.mjs` regenerates labelled
sheets from the original paired PNGs.

Additional inspected sample: Firefox 1920×1080 Dark / Flat / 130%, all eight states in the
[Firefox desktop sheet](../evidence/visual/firefox/desktop-1920x1080/dark-bare-130/review-sheet.jpg).
No measured box differs by more than 2 px. Thresholded pixel differences range from 0.026% on blank
paper to 0.644% on Settings. The selected navigation fill differs in Settings; both clearly indicate
the selected pane. The palette, picker, flyouts, held Clear and Cat remain legible and aligned. This
sample does not establish a worse RN result.

### Corrected WebKit request policy

The first WebKit matrix blocked local `blob:` image URLs because their URL hostname is empty. These
were same-origin resources, not remote traffic. All 448 first-pass pairs are preserved under
`evidence/visual-discarded/webkit-local-blob-blocked/` and excluded from the accepted matrix. The
replacement permits only the two local app origins' blob URLs and waits for shipping's coloring
image to decode. Chromium and Firefox had no such blocked requests. The first corrected coloring
pair's shipping image is pixel-identical to the discarded take, but the complete WebKit recapture
keeps a uniform state history and trustworthy loading policy. The corrected 320×568 review sheet
above was inspected again; its listed numbers and disposition are unchanged.

### Final numerical disposition

All 1,472 accepted pairs compare successfully, with zero unsettled captures, page errors or denied
resources. Every required state was reachable, including held Clear. No missing or extra measured
control and no non-Settings box delta over 2 px occurs. Settings has 13 geometry categories across
88 pairs: 32 Chromium, 32 WebKit and 24 Firefox. Maximum row/control displacement is 29.992 px in
Chromium, 20.094 px in WebKit and 10 px in Firefox. Thresholded whole-screen pixel difference ranges
are 0.013–9.019% in Chromium, 0.001–6.986% in WebKit and 0.008–7.002% in Firefox.

The corrected WebKit desktop sheet was inspected again after recapture. Its eight states retain the
previous disposition. Settings font/wrap and selected-row treatment, backdrop blur and Cat outline
rasterization remain observations. No additional difference met the two-reproduction, visible-and-
worse rule for a finding. This is exhaustive metric collection with representative manual review; it
does not claim a human-equivalent judgment of every changed pixel.
