import { expect, test, type Page } from '@playwright/test';
import { DIAL_MAX_SIZE_PX, MASK_CLEARANCE } from '../src/lib/components/aiDialGeometry';
import { AI_LOADING_SUBTITLE, AI_LOADING_TITLE } from '../src/lib/ai/loadingCopy';
import { aiOutputFor } from './artifacts/ai-output-fixtures';
import {
  DESKTOP_VIEWPORT,
  NOTCHED_PHONE_VIEWPORT,
  invokeAiGeneration,
  loadingBoxes,
  openAiResult,
  prepareAiGeneration,
  resolveLengths,
  resolvedStageLengthPx,
  revealAiResult,
  revealedBoxes,
} from './ai-harness';

// The AI result modal's presentation: generation upload, the dial and reveal,
// and the error and refusal states. The card's geometry across viewports lives
// in ai-result-layout.spec.ts, and the report flow the modal launches in
// ai-report.spec.ts.
// Watch it run with:
//   npm run test:e2e:headed -- ai-result

async function reservedStageSize(page: Page) {
  const [width] = await resolveLengths(page, 'dialog.ai-result-modal', [
    'min(var(--result-stage-max-w), calc(var(--result-stage-max-h) * var(--result-aspect)))',
  ]);
  const aspect = await page
    .locator('dialog.ai-result-modal')
    .evaluate((card) => parseFloat(getComputedStyle(card).getPropertyValue('--result-aspect')));
  if (width === undefined || !Number.isFinite(aspect) || aspect <= 0) {
    throw new Error('The reserved AI stage geometry was not measurable');
  }
  return { width, height: width / aspect };
}

interface DelayedImageSource {
  path: string;
  body: Buffer;
}

async function delayImageObjectUrls(page: Page, sources: DelayedImageSource[]) {
  await page.addInitScript(
    (paths) => {
      const createObjectUrl = URL.createObjectURL.bind(URL);
      const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
      let nextImage = 0;
      URL.createObjectURL = (blob) => {
        if (nextImage < paths.length && blob instanceof Blob && blob.type.startsWith('image/')) {
          return paths[nextImage++];
        }
        return createObjectUrl(blob);
      };
      URL.revokeObjectURL = (url) => {
        if (!paths.some((path) => url.endsWith(path))) revokeObjectUrl(url);
      };
    },
    sources.map(({ path }) => path)
  );

  return Promise.all(
    sources.map(async ({ path, body }) => {
      let release!: () => void;
      let observeRequest!: () => void;
      const canLoad = new Promise<void>((resolve) => (release = resolve));
      const requested = new Promise<void>((resolve) => (observeRequest = resolve));
      await page.route(`**${path}`, async (route) => {
        observeRequest();
        await canLoad;
        await route.fulfill({ status: 200, contentType: 'image/jpeg', body });
      });
      return { requested, release };
    })
  );
}
test.describe('AI result modal', () => {
  test('uploads the live canvas as a non-empty image POST', async ({ page }) => {
    const endpoint = await openAiResult(page);

    const request = await endpoint.waitForFirstRequest();
    expect(endpoint.requests).toHaveLength(1);
    expect(request.method).toBe('POST');
    expect(request.contentType).toMatch(/^image\/(webp|png)$/);
    expect(request.bytes).toBeGreaterThan(0);

    await endpoint.fail();
  });

  // The blur ramps 18px to 2px across a run of about half a minute, so a raw
  // per-frame value rewrites this image's filter sixty times a second to move it
  // by under a hundredth of a pixel — over the canvas the child is still drawing
  // on. Quantizing is the rule the waiting polaroid's fill percent already
  // follows. Asserted as a ratio against frames painted in the same window, so a
  // starved worker scales both together.
  test('the preview blur writes far fewer filters than frames it spans', async ({ page }) => {
    await openAiResult(page);
    const preview = page.locator('.stage-img.preview');
    await expect(preview).toBeVisible();

    const measured = await page.evaluate(async () => {
      const image = document.querySelector('.stage-img.preview') as HTMLElement;
      const first = image.style.filter;
      let writes = 0;
      let frames = 0;
      const observer = new MutationObserver((records) => {
        writes += records.length;
      });
      observer.observe(image, { attributes: true, attributeFilter: ['style'] });
      let counting = true;
      const countFrame = () => {
        frames += 1;
        if (counting) requestAnimationFrame(countFrame);
      };
      requestAnimationFrame(countFrame);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      counting = false;
      observer.disconnect();
      return { writes, frames, first, last: image.style.filter };
    });

    // The ceiling alone would be satisfied by a blur that never moves at all, so
    // a frozen or deleted ramp would make this performance test greener. Prove
    // the filter still advances before believing the count.
    expect(measured.last).not.toBe(measured.first);
    expect(measured.writes).toBeGreaterThan(0);

    // Over a 2s window the blur moves by roughly a pixel, so a quarter-pixel
    // step admits a handful of writes where the raw value wrote one per frame.
    expect(measured.frames).toBeGreaterThan(30);
    expect(measured.writes).toBeLessThan(measured.frames / 4);
  });

  test('plays the dial and reveals the result image', async ({ page }) => {
    const endpoint = await prepareAiGeneration(page);
    await expect(page.locator('.ai-loading-caption')).toHaveCount(0);
    await invokeAiGeneration(page);
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible();

    // Loading state: the progress dial sits over the real canvas export.
    await expect(page.locator('.dial')).toBeVisible();
    await expect(page.locator('.stage-img.preview')).toBeVisible();
    const loadingCaption = page.locator('.ai-loading-caption');
    await expect(loadingCaption).toContainText(AI_LOADING_TITLE);
    await expect(loadingCaption).toContainText(AI_LOADING_SUBTITLE);

    await endpoint.succeed();

    const resultImage = page.locator('.stage-img.result');
    await expect(resultImage).toBeAttached();
    expect(await resultImage.evaluate((image) => getComputedStyle(image).filter)).toBe('blur(2px)');

    // When the mocked image arrives the dial races to full, then the result
    // cross-fades in and the download button pops in.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible();

    // The disclosure lives on the strip below the card, not in the card footer.
    const strip = page.locator('.ai-result-disclosure');
    await expect(strip).toContainText('AI-generated picture');
    const footer = page.locator('.ai-result-footer');
    await expect(footer).not.toContainText('AI-generated picture');
    await expect(footer.getByRole('button')).toHaveCount(1);
    const report = strip.getByRole('button', { name: 'Report this picture' });
    await expect(report).toBeVisible();
    await expect(report).toContainText('Report');
    await expect(report.locator('[data-icon="flag"]')).toBeVisible();

    // The dial is torn down after the reveal.
    await expect(page.locator('.dial')).toHaveCount(0);
    await expect(loadingCaption).toHaveCount(0);
  });

  test('reserves the picture area while the first preview image decodes', async ({ page }) => {
    const [preview] = await delayImageObjectUrls(page, [
      { path: '/delayed-ai-preview', body: aiOutputFor(page.viewportSize()) },
    ]);

    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
    await preview.requested;

    const loading = await loadingBoxes(page);
    const reserved = await reservedStageSize(page);
    expect(loading.stage.width).toBeCloseTo(reserved.width, 0);
    expect(loading.stage.height).toBeCloseTo(reserved.height, 0);
    await expect(page.locator('.stage-sizer:not(.loaded)')).toHaveCount(1);

    preview.release();
    await expect
      .poll(() =>
        page.locator('.stage-img.preview').evaluate((image) => {
          const img = image as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        })
      )
      .toBe(true);
    await expect(page.locator('.stage-sizer.loaded')).toHaveCount(1);

    await endpoint.fail();
  });

  test('reserves a minimized result while its image decodes', async ({ page }) => {
    const [preview, result] = await delayImageObjectUrls(page, [
      { path: '/delayed-ai-preview', body: aiOutputFor(page.viewportSize()) },
      { path: '/delayed-ai-result', body: aiOutputFor({ width: 800, height: 800 }) },
    ]);
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await preview.requested;
    preview.release();
    await expect(page.locator('.stage-sizer.loaded')).toHaveCount(1);

    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator('dialog.ai-result-modal')).toBeHidden();
    await endpoint.succeed();
    await result.requested;
    await expect(page.locator('.ai-waiting-polaroid')).toContainText('Ready!');

    await page.locator('.ai-waiting-polaroid').click();
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
    await expect(page.locator('.stage-sizer:not(.loaded)')).toHaveCount(1);
    const revealed = await revealedBoxes(page);
    const reserved = await reservedStageSize(page);
    expect(revealed.stage.width).toBeCloseTo(reserved.width, 0);
    expect(revealed.stage.height).toBeCloseTo(reserved.height, 0);
    await expect(page.locator('.stage-img.result.shown')).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);

    result.release();
    await expect(page.locator('.stage-sizer.loaded')).toHaveCount(1);
  });

  // The dial is a fraction of the stage, which now grows to a desktop's worth of
  // room — so it stops at its cap rather than becoming a dinner plate. The
  // confetti's mask hole is derived from the same two numbers, so a dial that
  // outgrew this would also punch a hole in the leaves nothing sits behind.
  test('caps the loading dial once the stage outgrows it', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await openAiResult(page);

    const dial = page.locator('.dial');
    await expect(dial).toBeVisible();
    // Polled, not read once: the stage collapses to nothing for as long as the
    // preview it is sized from is an <img> that has not decoded yet, and the
    // dial is a fraction of the stage.
    await expect
      .poll(async () => (await dial.boundingBox())?.width ?? 0)
      .toBeCloseTo(DIAL_MAX_SIZE_PX, 0);
  });

  test('shows the error state', async ({ page }) => {
    const endpoint = await openAiResult(page);
    await endpoint.fail();

    await expect(page.getByText(/didn't work/i)).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
    await expect(page.locator('.ai-loading-caption')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Report this refusal' })).toHaveCount(0);
  });

  test('shows the safety refusal state', async ({ page }) => {
    const endpoint = await openAiResult(page);
    await endpoint.fail(422);

    await expect(page.getByText("Let's try drawing something else!")).toBeVisible();
    await expect(page.locator('.ai-result-error.safety')).toBeVisible();
    await expect(page.getByText(/try drawing something different/i)).toBeVisible();
    const audience = page.getByText('For grown-ups');
    const report = page.getByRole('button', { name: 'Report this refusal' });
    await expect(audience).toBeVisible();
    await expect(audience).toHaveAttribute('id', 'refusalReportAudience');
    await expect(report).toBeVisible();
    await expect(report).toHaveAttribute('aria-describedby', 'refusalReportAudience');
  });

  // Action-level coverage for the scoped pinchZoom (aiPreview.ts math is unit-
  // tested; this drives the real .ai-stage wiring in Chromium): a two-finger
  // spread scales the .zoom-layer and marks the stage .zoomed, while a lone
  // finger on the un-zoomed preview passes straight through (ADR-0076).
  test('the revealed result pinch-zooms, and a lone finger passes through', async ({ page }) => {
    await revealAiResult(page);

    const result = await page.locator('.ai-stage').evaluate((node) => {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (name: string, id: number, x: number, y: number) => {
        const ev = new PointerEvent(name, {
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        });
        node.dispatchEvent(ev);
        return ev;
      };

      const layer = node.querySelector('.zoom-layer') as HTMLElement;

      // A lone finger on the un-zoomed preview must not be intercepted.
      fire('pointerdown', 9, cx, cy);
      const lonePrevented = fire('pointermove', 9, cx + 6, cy).defaultPrevented;
      fire('pointerup', 9, cx + 6, cy);
      const afterLoneTap = layer.style.transform;

      // Two fingers spreading apart zoom the picture.
      fire('pointerdown', 1, cx - 10, cy);
      fire('pointerdown', 2, cx + 10, cy);
      fire('pointermove', 1, cx - 50, cy);
      fire('pointermove', 2, cx + 50, cy);
      const transform = layer.style.transform;
      const zoomed = node.classList.contains('zoomed');

      // Pinching back to the starting spread lands on scale 1 again.
      fire('pointermove', 1, cx - 10, cy);
      fire('pointermove', 2, cx + 10, cy);
      fire('pointerup', 1, cx - 10, cy);
      fire('pointerup', 2, cx + 10, cy);
      const afterPinchBack = layer.style.transform;

      return { transform, zoomed, lonePrevented, afterLoneTap, afterPinchBack };
    });

    expect(result.lonePrevented).toBe(false);
    expect(result.zoomed).toBe(true);
    expect(result.transform).toMatch(/scale\(/);
    expect(result.transform).not.toMatch(/scale\(1\)/);
    // The rest state has one DOM representation — an empty inline transform —
    // whether it was never left or was returned to.
    expect(result.afterLoneTap).toBe('');
    expect(result.afterPinchBack).toBe('');
  });

  // AiConfetti's fall keyframes read --stage-h off .ai-stage, declared there
  // from the card's budget and the picture's aspect rather than measured, so
  // the leaves reach the bottom of the real stage on any viewport.
  test.describe('--stage-h tracks the stage element', () => {
    const stageHeightPx = (page: Page) => resolvedStageLengthPx(page, '--stage-h');

    test('reflects the stage element’s real rendered height', async ({ page }) => {
      await openAiResult(page);

      await expect
        .poll(async () => {
          const rendered = await page
            .locator('.ai-stage')
            .evaluate((el) => el.getBoundingClientRect().height);
          return Math.abs((await stageHeightPx(page)) - rendered);
        })
        .toBeLessThan(0.5);
    });

    // The error state's {:else} unmounts .ai-stage; a retry mounts a fresh
    // element, which carries the declaration like the first did.
    test('declares the height on a fresh .ai-stage after an error-then-retry', async ({ page }) => {
      const endpoint = await openAiResult(page);
      await expect.poll(() => stageHeightPx(page)).toBeGreaterThan(0);

      await endpoint.fail();
      await expect(page.getByText(/didn't work/i)).toBeVisible();

      await invokeAiGeneration(page);
      await expect(page.locator('.dial')).toBeVisible();
      await expect.poll(() => stageHeightPx(page)).toBeGreaterThan(0);
    });
  });

  // The confetti's mask hole is declared from the same two numbers the dial
  // sizes itself by, opened by the clearance — so on a phone, where the dial is
  // a fraction of the stage, and on a desktop, where it sits at its cap, the
  // hole is that much wider than the dial actually renders.
  for (const [label, viewport] of [
    ['a phone', NOTCHED_PHONE_VIEWPORT],
    ['a desktop', DESKTOP_VIEWPORT],
  ] as const) {
    test(`cuts the confetti hole a clearance wider than the dial on ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openAiResult(page);
      const dial = page.locator('.dial');
      await expect(dial).toBeVisible();
      await expect
        .poll(async () => {
          const dialWidth = (await dial.boundingBox())?.width ?? 0;
          const radius = await resolvedStageLengthPx(page, '--confetti-rx');
          return dialWidth > 0 ? Math.abs(radius - (dialWidth / 2) * MASK_CLEARANCE) : Infinity;
        })
        // A layout unit and a half: the dial is a percentage of a fractional
        // stage and rounds on its own, while the declared radius does not. A
        // wrong constant misses by tens of pixels, not by one.
        .toBeLessThan(1.5);
    });
  }
});
