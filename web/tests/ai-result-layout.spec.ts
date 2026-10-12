import { expect, test, type Page } from '@playwright/test';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { overrideSafeAreaInsets } from './cdp';
import {
  DESKTOP_VIEWPORT,
  NOTCHED_PHONE_VIEWPORT,
  keepDrawingBlockPx,
  loadingBoxes,
  openAiResult,
  resolveLengths,
  resultBoxes,
  revealAiResult,
  revealedBoxes,
  settledStageHeight,
  stripTokens,
} from './ai-harness';

// The AI result card's geometry that has to hold across viewports: its band,
// bounds, gutter, the disclosure strip's reserve, and the display's safe areas.
// The modal's generation lifecycle and loading presentation live in
// ai-result.spec.ts.
// Watch it run with:
//   npm run test:e2e:headed -- ai-result-layout

// The notch and indicator of an iPhone-class display on NOTCHED_PHONE_VIEWPORT.
// What matters is only that both are non-zero and the top one clears
// NOTCH_INSET_THRESHOLD_PX (ADR-0026), so the card is judged against a display
// that actually eats into both edges.
const NOTCHED_PHONE_INSETS = { top: 59, bottom: 34 };

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

// Returns what CSS actually resolved, so a caller can prove the override landed
// rather than assuming it. The override itself is overrideSafeAreaInsets in
// cdp.ts — shared, and careful to send all eight keys.
async function emulateSafeAreaInsets(page: Page, insets: { top: number; bottom: number }) {
  await overrideSafeAreaInsets(page, { ...insets, left: 0, right: 0 });
  const [top, bottom] = await resolveLengths(page, 'body', [
    'env(safe-area-inset-top)',
    'env(safe-area-inset-bottom)',
  ]);
  return { top, bottom };
}

test.describe('AI result card layout', () => {
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
});
