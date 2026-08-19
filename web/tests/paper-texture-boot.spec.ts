// The controlled reproduction for issue #828 — the boot artifact reported as a
// brief flash of "sporadic tiling" mid-page on Android Chrome.
//
// Every candidate ruled out in that issue was an <img>, and the per-frame boot
// instrumentation there walked <img> elements only. The paper's grain is not an
// <img>: it is a `background-image` on `.paper-sheet`. So it sat outside the
// whole net, and it covers exactly the region reported.
//
// It is fetched over the network at boot like any other image, and the request
// is not issued until `.paper-sheet` has laid out, because the preload scanner
// does not read URLs out of the CSS the prerender inlines into a <style>. Until
// it lands the sheet paints flat `--paper`; when it lands the sheet repaints
// grained and measurably darker, the texture being a low-alpha grain (ADR-0052).
// Measured against this build, the sheet holds the flat state for ~800 ms on a
// 4G profile and ~3.6 s on slow 3G.
//
// That is the artifact's substrate rather than the percept: a device re-rasters
// a full-viewport invalidation tile by tile, so patches land at the two tones a
// beat apart — "sporadic tiling", mid-page, on a blank canvas, with no broken-
// image glyph. Emulated Chromium rasters too cheaply to split the repaint, so
// the tiling itself still needs the device. What this pins is the pair of states
// it alternates between, on demand and without a device.
//
// It is a reproduction, so it asserts the defect — and it is worth being exact
// about which fixes it can see. Only a fix that ships the texture WITH the
// document (a data URI in the prerendered CSS, say) trips the flat-state
// assertion, because that leaves the held route below nothing to hold. A fix
// that merely issues the request EARLIER does not: the route intercepts the
// texture whatever prompted the request, so the spec would stay green while the
// artifact survived. That shape has already been tried and measured — a preload
// hint moved the request ~15 ms earlier and left the flat window unchanged
// (797 → 791 ms at 4G, 3632 → 3619 ms on slow 3G) — so rather than let the next
// one slide past, `noPreloadHint` fails on it and sends the reader here.
//
// Retire this spec with the fix that does trip the flat-state assertion.
import { expect, test, type Page } from '@playwright/test';

// Grain reads as per-pixel luminance spread; a flat fill has effectively none.
// Sits between the measured pair — untextured 0.0, textured ~1.7.
const FLAT_LUMINANCE_SD = 0.5;
const GRAINED_LUMINANCE_SD = 1;

// The low-alpha grain darkens the sheet as well as roughening it (measured ~13
// luminance levels, 250.3 → 237.1). The tone step is what makes a half-repainted
// region read as patchy rather than as a subtle sharpening, so it is the part
// worth pinning.
const MIN_TONE_STEP = 5;

const PAPER_TEXTURE = '**/handmade-paper.webp';
const PATCH_WIDTH_PX = 240;
const PATCH_HEIGHT_PX = 120;

type PatchStats = { mean: number; sd: number };

/** Luminance mean + spread over a patch of the paper, away from its edges. */
async function paperPatch(page: Page): Promise<PatchStats> {
  const box = await page.locator('.paper-sheet').boundingBox();
  expect(box, 'the paper sheet has no box to sample').not.toBeNull();
  const png = await page.screenshot({
    clip: {
      x: box!.x + box!.width / 4,
      y: box!.y + box!.height / 2 - PATCH_HEIGHT_PX / 2,
      width: PATCH_WIDTH_PX,
      height: PATCH_HEIGHT_PX,
    },
  });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = surface.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    let sumOfSquares = 0;
    const count = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
      sum += luminance;
      sumOfSquares += luminance * luminance;
    }
    const mean = sum / count;
    // Clamped: a perfectly flat patch lands the subtraction fractionally below zero.
    return { mean, sd: Math.sqrt(Math.max(0, sumOfSquares / count - mean * mean)) };
  }, png.toString('base64'));
}

test.describe('the paper texture at boot', () => {
  test('the sheet paints flat before the texture, grained after', async ({ page }) => {
    // Holding the response makes the pre-arrival state observable on demand
    // instead of only under a network profile that happens to be slow enough.
    let releaseTexture!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseTexture = resolve;
    });
    await page.route(PAPER_TEXTURE, async (route) => {
      await held;
      await route.continue();
    });

    // Not gotoApp: a background-image the used styles reference holds the window
    // load event open, so this spec's held response would wait out the whole
    // timeout on gotoApp's default navigation. It needs no gate unlock either —
    // the paper is toddler-facing surface. The canvas is the hydration signal,
    // exactly as it is there.
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#drawingCanvas')).toBeVisible();

    // noPreloadHint: the held route above is blind to what issued the request, so
    // a preload hint would leave every assertion below green while the flat
    // window survived. Fail here instead — see the header for the measurements
    // that say a hint does not close it.
    await expect(
      page.locator('link[rel="preload"][href*="handmade-paper"]'),
      'the document now hints the texture: this reproduction cannot see whether that helped, ' +
        'and a preload was measured not to close the flat window — re-verify before trusting it'
    ).toHaveCount(0);

    const untextured = await paperPatch(page);
    expect(
      untextured.sd,
      'the paper is an unrelieved flat fill until the texture lands'
    ).toBeLessThan(FLAT_LUMINANCE_SD);

    releaseTexture();
    // Carried out of the poll so the tone step below describes the very frame
    // that satisfied the grain threshold, rather than a later re-sample.
    let grained!: PatchStats;
    await expect
      .poll(
        async () => {
          grained = await paperPatch(page);
          return grained.sd;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(GRAINED_LUMINANCE_SD);

    expect(
      untextured.mean - grained.mean,
      'the two states differ by a visible tone step, not by grain alone'
    ).toBeGreaterThan(MIN_TONE_STEP);
  });
});
