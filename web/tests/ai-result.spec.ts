import { expect, test, type Page } from '@playwright/test';
import { DIAL_MAX_SIZE_PX } from '../src/lib/components/aiDialGeometry';
import { AI_LOADING_SUBTITLE, AI_LOADING_TITLE } from '../src/lib/ai/loadingCopy';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import {
  invokeAiGeneration,
  keepDrawingBlockPx,
  loadingBoxes,
  openAiResult,
  prepareAiGeneration,
  resultBoxes,
  revealAiResult,
  revealedBoxes,
  settledStageHeight,
  stripTokens,
} from './ai-harness';

// The AI result modal's presentation: generation upload, the dial and reveal,
// and the geometry that has to hold across viewports. The report flow the modal
// launches lives in ai-report.spec.ts.
// Watch it run with:
//   npm run test:e2e:headed -- ai-result

// Big enough that the picture's height, not the card, is what limits it — the
// case the fixed-width card used to leave mostly empty.
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

// A phone with a cutout at the top and a home indicator at the bottom. The
// insets are an iPhone-class notch and indicator; what matters is only that both
// are non-zero and the top one clears NOTCH_INSET_THRESHOLD_PX (ADR-0026), so
// the card is judged against a display that actually eats into both edges.
const NOTCHED_PHONE_VIEWPORT = { width: 390, height: 844 };
const NOTCHED_PHONE_INSETS = { top: 59, bottom: 34 };

// Resolves length expressions to real pixels by letting the engine compute them
// on a throwaway probe inside `host`. getComputedStyle hands back an unresolved
// token stream for an unregistered custom property, so a `clamp()` of vmin — or
// an `env()` — can only be read back through something that actually used it.
// The probe is taken out of flow so measuring the card never moves it.
function resolveLengths(page: Page, host: string, expressions: string[]) {
  return page.evaluate(
    ({ host, expressions }) => {
      const parent = document.querySelector(host);
      if (!parent) throw new Error(`No host for the length probe: ${host}`);
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden';
      parent.append(probe);
      const resolved = expressions.map((expression) => {
        probe.style.paddingTop = expression;
        return parseFloat(getComputedStyle(probe).paddingTop);
      });
      probe.remove();
      return resolved;
    },
    { host, expressions }
  );
}

// The bounds of the band the card is centered on, read off the card itself so
// the assertions track whatever the gutter and the insets actually resolved to.
async function cardBounds(page: Page) {
  const [top, bottom, side] = await resolveLengths(page, 'dialog.ai-result-modal', [
    'var(--result-top-bound)',
    'var(--result-bottom-bound)',
    'var(--result-side-bound)',
  ]);
  if (top === undefined || bottom === undefined || side === undefined) {
    throw new Error('AI result bounds were not measurable');
  }
  return { top, bottom, side };
}

// Chromium emulates env(safe-area-inset-*) only over CDP — there is no viewport
// option for it — so this is the one seam that can render the app as a notched
// phone sees it. Returns what CSS actually resolved, so a caller can prove the
// override landed rather than assuming it.
async function emulateSafeAreaInsets(page: Page, insets: { top: number; bottom: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
  const [top, bottom] = await resolveLengths(page, 'body', [
    'env(safe-area-inset-top)',
    'env(safe-area-inset-bottom)',
  ]);
  return { top, bottom };
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

  for (const viewport of [
    { width: 390, height: 480, label: '390px phone portrait at 480px high' },
    { width: 844, height: 390, label: '390px phone landscape' },
    { width: 320, height: 568, label: '320px phone portrait' },
  ]) {
    for (const autoSave of [false, true]) {
      const saveMode = autoSave ? ' with auto-save' : '';
      test(`keeps loading and reveal geometry stable on ${viewport.label}${saveMode}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        if (autoSave) {
          await page.addInitScript(
            (key) => localStorage.setItem(key, 'true'),
            STORAGE_KEYS.autoSaveAi
          );
        }
        const endpoint = await openAiResult(page);

        const caption = page.locator('.ai-loading-caption');
        await expect(caption).toBeVisible();
        await settledStageHeight(page);
        const loading = await loadingBoxes(page);

        expect(loading.card.y).toBeGreaterThanOrEqual(-1);
        expect(loading.card.y + loading.card.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(loading.content.y + loading.content.height).toBeLessThanOrEqual(
          loading.card.y + loading.card.height + 1
        );
        expect(loading.caption.y + loading.caption.height).toBeLessThanOrEqual(
          loading.card.y + loading.card.height + 1
        );

        await endpoint.succeed();
        await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });

        // The one thing the reveal is allowed to change: the keep-drawing pill
        // leaves and the picture opens up into the room it was holding. The
        // stage glides through that, so let it land before measuring.
        const block = await keepDrawingBlockPx(page);
        await settledStageHeight(page);
        const revealed = await revealedBoxes(page);

        // Never the other way: a picture that shrank as it arrived, or a card
        // that grew past the room the loading state proved it had.
        expect(revealed.stage.height).toBeGreaterThanOrEqual(loading.stage.height - 1);
        expect(revealed.stage.height - loading.stage.height).toBeLessThanOrEqual(block + 1);
        expect(revealed.card.height).toBeLessThanOrEqual(loading.card.height + 1);
        expect(loading.card.height - revealed.card.height).toBeLessThanOrEqual(block + 1);
      });
    }
  }

  // The strip is anchored to the card, not the viewport corner the old flag sat
  // in — so the gap under the picture is the same on a phone-sized dialog and on
  // a desktop, where that flag drifted furthest from what it referred to.
  for (const viewport of [
    { width: 768, height: 1024, label: 'iPad portrait' },
    { width: 1440, height: 900, label: 'desktop' },
  ]) {
    test(`anchors the disclosure strip below the result card on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await revealAiResult(page);

      const { card, strip, report } = await resultBoxes(page);
      const tokens = await stripTokens(page);
      expect(strip.y - (card.y + card.height)).toBeCloseTo(tokens.gap, 0);
      expect(strip.x + strip.width / 2).toBeCloseTo(card.x + card.width / 2, 0);
      // The card's height budget is reserved off these two tokens, so either one
      // drifting from what actually renders would reserve short and clip the
      // strip — or the Report target overhanging it — off a short screen.
      expect(strip.height).toBeCloseTo(tokens.height, 0);
      expect(report.height).toBeCloseTo(tokens.tap, 0);
    });
  }

  // The picture is drawn as large as its own aspect allows in the room the
  // viewport has, rather than inside a fixed-width card that left most of a
  // desktop screen empty. Both halves of that are measurable: the card carries
  // nothing but its own padding beside the picture, and it fills its band from
  // bound to bound, so there is no height left for the picture to have taken.
  test('draws the picture at the full height its band allows', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await revealAiResult(page);

    const { card } = await resultBoxes(page);
    const bounds = await cardBounds(page);
    const stage = await page.locator('.ai-stage').boundingBox();
    const inlinePadding = await page
      .locator('.ai-result-content')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    const natural = await page
      .locator('.stage-img.result')
      .evaluate(
        (el) => (el as HTMLImageElement).naturalWidth / (el as HTMLImageElement).naturalHeight
      );
    if (!stage) throw new Error('AI stage geometry was not measurable');

    expect(card.width - stage.width).toBeCloseTo(2 * inlinePadding, 0);
    expect(stage.width / stage.height).toBeCloseTo(natural, 2);
    // The couple of pixels of slack are --result-sizing-air plus the subpixel
    // rounding of a card centered on a half-pixel offset.
    const bandBottom = DESKTOP_VIEWPORT.height - bounds.bottom;
    expect(card.y).toBeGreaterThanOrEqual(bounds.top - 1);
    expect(card.y).toBeLessThanOrEqual(bounds.top + 2);
    expect(card.y + card.height).toBeGreaterThan(bandBottom - 2);
    expect(card.y + card.height).toBeLessThanOrEqual(bandBottom + 1);
  });

  // A big screen is where the old fixed-width card looked worst, and also where
  // running the picture to the screen edge would stop reading as a modal over
  // the app. The gutter is what buys the frame back; on a phone it collapses to
  // little more than a hairline, because there the picture is what's scarce. The
  // range is the product claim — roughly this much room on this class of screen;
  // everything below it is the rule the bounds follow from that one number.
  for (const screen of [
    { label: 'desktop', viewport: DESKTOP_VIEWPORT, least: 70, most: 80 },
    { label: 'phone', viewport: { width: 390, height: 844 }, least: 8, most: 16 },
  ]) {
    test(`frames the card in a ${screen.label}-sized gutter`, async ({ page }) => {
      await page.setViewportSize(screen.viewport);
      await revealAiResult(page);

      const { card } = await resultBoxes(page);
      const bounds = await cardBounds(page);
      const [gutter, reserve] = await resolveLengths(page, 'dialog.ai-result-modal', [
        'var(--result-gutter)',
        'var(--report-strip-reserve)',
      ]);
      if (gutter === undefined || reserve === undefined) {
        throw new Error('The gutter was not measurable');
      }

      expect(gutter).toBeGreaterThanOrEqual(screen.least);
      expect(gutter).toBeLessThanOrEqual(screen.most);
      // No cutout is emulated here, so the gutter is the whole of both of these.
      expect(bounds.top).toBeCloseTo(gutter, 0);
      expect(bounds.side).toBeCloseTo(gutter, 0);
      // The bottom also has the strip hanging in it, and takes whichever is
      // deeper — the strip's room on a phone, the gutter on a desktop.
      expect(bounds.bottom).toBeCloseTo(Math.max(gutter, reserve), 0);

      // The card honors them: a picture too narrow to fill the width sits
      // further in than the side bound, never outside it.
      expect(card.x).toBeGreaterThanOrEqual(bounds.side - 1);
      expect(card.y).toBeGreaterThanOrEqual(bounds.top - 1);
      expect(card.y + card.height).toBeLessThanOrEqual(screen.viewport.height - bounds.bottom + 1);
    });
  }

  // The card is centered on the band between the display's top inset and the
  // strip's room below, not on the viewport — `viewport-fit=cover` (ADR-0026)
  // puts the top of the viewport under the cutout, so centering on the viewport
  // slides the Close disc beneath a notch on exactly the phones the app is most
  // used on. Both states are covered: the loading card is the taller of the two
  // and reaches the top bound first.
  for (const state of ['loading', 'revealed'] as const) {
    test(`clears the display's safe areas on a notched phone while ${state}`, async ({ page }) => {
      await page.setViewportSize(NOTCHED_PHONE_VIEWPORT);
      const insets = await emulateSafeAreaInsets(page, NOTCHED_PHONE_INSETS);
      // Proves the emulation reached CSS: without it every assertion below holds
      // trivially on a device with no cutout at all.
      expect(insets).toEqual(NOTCHED_PHONE_INSETS);

      if (state === 'loading') await openAiResult(page);
      else await revealAiResult(page);

      const card = await page.locator('dialog.ai-result-modal').boundingBox();
      const close = await page.locator('.ai-result-close').boundingBox();
      if (!card || !close) throw new Error('AI result geometry was not measurable');

      // The Close disc, not the card, is what the cutout actually eats into: it
      // is inset from the card's own top corner, so a card that merely starts
      // below the band can still be hiding its one dismissal control.
      expect(card.y).toBeGreaterThanOrEqual(insets.top - 1);
      expect(close.y).toBeGreaterThanOrEqual(insets.top);

      // Still bounded below by the strip's room, which carries the bottom inset:
      // honoring the top must not come out of the home indicator's clearance.
      // The revealed card hangs a report row below the art and the loading card
      // has nothing there, so the state picks which edges must clear the bound —
      // never whether the bound is checked.
      const bottomBound = NOTCHED_PHONE_VIEWPORT.height - insets.bottom;
      const bounded = state === 'revealed' ? [card, (await resultBoxes(page)).report] : [card];
      for (const box of bounded) {
        expect(box.y + box.height).toBeLessThanOrEqual(bottomBound + 1);
      }
    });
  }

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

  // The strip sits on the dimmed backdrop, which is dark under either theme, so
  // its colors are literal rather than theme tokens that flip in light mode.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`paints the strip on backdrop colors in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await revealAiResult(page);

      const chrome = await page
        .getByRole('button', { name: 'Report this picture' })
        .evaluate((button) => {
          const strip = button.closest('.ai-result-disclosure') as HTMLElement;
          const icon = button.querySelector('svg') as SVGElement;
          return {
            fill: getComputedStyle(strip).backgroundColor,
            ground: getComputedStyle(strip).backdropFilter,
            text: getComputedStyle(strip).color,
            report: getComputedStyle(button).color,
            iconFill: getComputedStyle(icon).fill,
          };
        });
      expect(chrome.fill).toBe('rgba(23, 23, 29, 0.72)');
      // The fill alone leaves the drawing showing through under 12px text; the
      // brightness floor is what keeps the ink legible over light artwork.
      expect(chrome.ground).toContain('brightness');
      expect(chrome.text).toBe('rgb(179, 177, 191)');
      expect(chrome.report).toBe('rgb(224, 147, 147)');
      // Beats the modal shell's icon re-ink, which would repaint it dark on dark.
      expect(chrome.iconFill).toBe(chrome.report);
    });
  }

  for (const viewport of [
    { width: 740, height: 360 },
    { width: 700, height: 420 },
  ]) {
    test(`keeps result content inside the card at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await revealAiResult(page);

      const { card, content, report } = await resultBoxes(page);
      expect(content.y + content.height).toBeLessThanOrEqual(card.y + card.height + 1);
      // The card gives up height for the strip rather than pushing it off the
      // bottom of a short screen. Measured on the Report box, not the strip:
      // its tap target is taller than the pill and overhangs it, so the strip
      // can sit fully on screen while the bottom of a 44px target is clipped.
      expect(report.y).toBeGreaterThanOrEqual(-1);
      expect(report.y + report.height).toBeLessThanOrEqual(viewport.height + 1);
    });
  }

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

  // AiConfetti's fall keyframes read --stage-h off .ai-stage (set by a
  // ResizeObserver in AiImageResult) instead of a fixed 540px, so the leaves
  // reach the bottom of the real stage on any viewport.
  test.describe('--stage-h tracks the stage element', () => {
    const stageHeightVar = (page: Page) =>
      page
        .locator('.ai-stage')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--stage-h').trim());

    test('reflects the stage element’s real rendered height', async ({ page }) => {
      await openAiResult(page);

      await expect
        .poll(() =>
          page.locator('.ai-stage').evaluate((el) => {
            const stageH = parseFloat(getComputedStyle(el).getPropertyValue('--stage-h'));
            return Math.abs(stageH - el.getBoundingClientRect().height);
          })
        )
        .toBeLessThan(0.5);
    });

    // The error state's {:else} unmounts .ai-stage; a retry mounts a fresh
    // element. Regression coverage for the observer staying bound to the old,
    // now-detached element instead of following aiStageEl to the new one.
    test('re-observes a fresh .ai-stage after an error-then-retry', async ({ page }) => {
      const endpoint = await openAiResult(page);
      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);

      await endpoint.fail();
      await expect(page.getByText(/didn't work/i)).toBeVisible();

      await invokeAiGeneration(page);
      await expect(page.locator('.dial')).toBeVisible();
      await expect.poll(() => stageHeightVar(page)).toMatch(/^[\d.]+px$/);
    });
  });
});
