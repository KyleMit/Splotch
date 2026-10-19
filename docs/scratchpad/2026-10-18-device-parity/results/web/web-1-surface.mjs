// WEB-1 drawing-surface cells: page locks and the context-menu guard (X57), engine remount and
// pointer recovery across in-app navigation, and the eraser's hover affordances.
import {
  boot,
  button,
  capture,
  collapseDrawer,
  contact,
  onBothArms,
  openSection,
  openSettings,
  openDialogs,
  paperBox,
  regionDigest,
  undoDepth,
  where,
} from './harness.mjs';
import { readHeadings, readLinks, readSurfaceLocks } from './page-probes.mjs';

const INK = [
  [0.3, 0.4],
  [0.6, 0.45],
];
const INK_MID = [0.45, 0.425];

async function openPrivacyInApp(s) {
  await openSettings(s);
  await openSection(s, 'About');
  await s.page
    .getByRole('link', { name: 'Privacy Policy' })
    .filter({ visible: true })
    .first()
    .click();
  await s.page.waitForTimeout(2000);
}

function watchContextMenus() {
  window.__contextMenus = [];
  window.addEventListener('contextmenu', (event) => {
    const target = event.target;
    window.__contextMenus.push({
      target: target?.tagName?.toLowerCase() ?? null,
      prevented: event.defaultPrevented,
    });
  });
}

// In-app navigation brings an open Settings back on return (E0784); close it before drawing.
async function returnToDrawing(s, how = () => s.page.goBack()) {
  await how();
  await s.page.locator(s.paper).waitFor({ state: 'visible' });
  await s.page.waitForTimeout(1500);
  const restored = await openDialogs(s);
  if (restored.length) {
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(1200);
  }
  return restored;
}

async function pointAt(s, locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export const SURFACE_CELLS = {
  'surface-locks': async (browser) => {
    const result = {};
    for (const profile of ['android', 'desktop']) {
      result[profile] = await onBothArms(browser, profile, async (s) => {
        await boot(s);
        const drawing = await s.page.evaluate(readSurfaceLocks);
        await openPrivacyInApp(s);
        const privacy = await s.page.evaluate(readSurfaceLocks);
        const backLinks = (await s.page.evaluate(readLinks)).filter((link) =>
          /drawing/i.test(link.text)
        );
        const shot = await capture(s, `surface-privacy-in-app-${profile}-${s.arm}`);
        await s.page.goBack();
        await s.page.waitForTimeout(1500);
        const returned = await s.page.evaluate(readSurfaceLocks);
        return { drawing, privacy, backLinks, shot, returned };
      });
    }
    return result;
  },

  'context-menu-guard': async (browser) => {
    const result = {};
    for (const profile of ['android', 'desktop']) {
      result[profile] = await onBothArms(
        browser,
        profile,
        async (s) => {
          await boot(s);
          const box = await paperBox(s);
          const targets = {
            paper: { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 },
            settings: await pointAt(s, button(s, 'Settings')),
          };
          for (const point of Object.values(targets)) {
            if (profile === 'desktop')
              await s.page.mouse.click(point.x, point.y, { button: 'right' });
            else {
              await s.cdp.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ ...point, id: 7 }],
              });
              await s.page.waitForTimeout(1200);
              await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            }
            await s.page.waitForTimeout(400);
          }
          const synthetic = await s.page.evaluate(() => {
            const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
            document.querySelector('canvas, [data-testid="drawing-paper"]').dispatchEvent(event);
            return event.defaultPrevented;
          });
          await collapseDrawer(s);
          return {
            events: await s.page.evaluate(() => window.__contextMenus),
            synthetic,
            locks: await s.page.evaluate(readSurfaceLocks),
          };
        },
        { initScripts: [watchContextMenus] }
      );
    }
    return result;
  },

  'engine-remount-in-app': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const blank = await regionDigest(s, INK_MID);
      await contact(s, [INK]);
      const inked = await regionDigest(s, INK_MID);
      await openPrivacyInApp(s);
      const away = await where(s);
      const restored = await returnToDrawing(s);
      const kept = (await regionDigest(s, INK_MID)) === inked;
      await contact(s, [INK.map(([x, y]) => [x, y + 0.15])]);
      const depth = await undoDepth(s);
      return { inkDrawn: inked !== blank, away, restored, kept, undoDepthAfterMore: depth };
    }),

  'engine-launch-param-remount': async (browser) => {
    const result = {};
    for (const [name, query] of [
      ['invite', '?ai_access_token=test-token'],
      ['stale-recovery', '?v=0.0.0-other-build'],
    ]) {
      result[name] = await onBothArms(browser, 'desktop', async (s) => {
        await boot(s, `/${query}`);
        await s.page.waitForTimeout(1500);
        const stripped = new URL(s.page.url()).search;
        await openPrivacyInApp(s);
        const away = await where(s);
        await s.page.goBack();
        await s.page.waitForTimeout(2000);
        return {
          stripped,
          away,
          back: await where(s),
          paperVisible: await s.page.locator(s.paper).isVisible(),
          headings: await s.page.evaluate(readHeadings),
        };
      });
    }
    return result;
  },

  // Hold the mouse on the paper, leave the drawing through history and come back, then keep
  // moving and release: the remounted surface owes that pointer nothing.
  // Enter the drawing from the information page's own link, hold the mouse on the paper, go
  // Back to that page and Forward again, then keep moving and release: the remounted surface owes
  // that pointer nothing. A window marker tells a same-document remount from a reload.
  'engine-held-pointer-remount': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await s.page.goto(`${s.base}/privacy`);
      await s.page.waitForTimeout(2000);
      const link = s.page.getByRole('link', { name: /drawing/i }).filter({ visible: true }).first();
      const linkText = await link.innerText();
      await link.click();
      await s.page.locator(s.paper).waitFor({ state: 'visible' });
      await s.page.waitForTimeout(2000);
      await s.page.evaluate(() => {
        window.__sameDocument = true;
      });
      const atDrawing = await where(s);
      const tail = [0.6, 0.7];
      const blankTail = await regionDigest(s, tail);
      const box = await paperBox(s);
      await s.page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await s.page.mouse.down();
      await s.page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.35, { steps: 8 });
      await s.page.goBack();
      await s.page.waitForTimeout(1500);
      const away = await where(s);
      await s.page.goForward();
      await s.page.locator(s.paper).waitFor({ state: 'visible' });
      await s.page.waitForTimeout(1500);
      const sameDocument = await s.page.evaluate(() => window.__sameDocument === true);
      await s.page.mouse.move(box.x + box.width * tail[0], box.y + box.height * tail[1], { steps: 20 });
      await s.page.mouse.up();
      await s.page.waitForTimeout(800);
      const tailPainted = (await regionDigest(s, tail)) !== blankTail;
      const shot = await capture(s, `engine-held-pointer-${s.arm}`);
      return { linkText, atDrawing, away, sameDocument, tailPainted, shot, undoDepth: await undoDepth(s) };
    }),

  'engine-idle-gap-jump': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const box = await paperBox(s);
      const gapMid = [0.5, 0.5];
      const blankGap = await regionDigest(s, gapMid);
      await s.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
      await s.page.mouse.down();
      await s.page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35, { steps: 10 });
      await s.page.waitForTimeout(1500);
      await s.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7);
      await s.page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.72, { steps: 6 });
      await s.page.mouse.up();
      await s.page.waitForTimeout(800);
      const connectingLine = (await regionDigest(s, gapMid)) !== blankGap;
      const shot = await capture(s, `engine-idle-gap-${s.arm}`);
      return { connectingLine, shot, undoDepth: await undoDepth(s) };
    }),

  'engine-hover-leave': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const box = await paperBox(s);
      for (let i = 0; i <= 20; i += 1)
        await s.page.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * 0.5);
      const palette = await pointAt(s, s.page.getByRole('button', { name: 'Purple' }));
      await s.page.mouse.move(palette.x, palette.y, { steps: 5 });
      await s.page.waitForTimeout(800);
      return { undoDepth: await undoDepth(s) };
    }),

  'eraser-hover': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      await contact(s, [INK]);
      await button(s, 'Expand controls').click();
      await s.page.waitForTimeout(800);
      await button(s, 'Brushes').click();
      await s.page.waitForTimeout(1000);
      const eraser = s.page
        .getByRole('button', { name: /Eraser/ })
        .filter({ visible: true })
        .first();
      const eraserFound = (await eraser.count()) > 0;
      if (eraserFound) await eraser.click();
      await s.page.waitForTimeout(1000);
      await collapseDrawer(s);
      const box = await paperBox(s);
      await s.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 5 });
      await s.page.waitForTimeout(600);
      const hovering = await s.page.evaluate(
        ([x, y]) => {
          const element = document.elementFromPoint(x, y);
          return {
            cursor: element ? getComputedStyle(element).cursor : null,
            touchAction: element ? getComputedStyle(element).touchAction : null,
          };
        },
        [box.x + box.width * 0.5, box.y + box.height * 0.6]
      );
      const hoverShot = await capture(s, `eraser-hover-${s.arm}`);
      const palette = await pointAt(s, s.page.getByRole('button', { name: 'Purple' }));
      await s.page.mouse.move(palette.x, palette.y + 60, { steps: 5 });
      await s.page.mouse.move(palette.x, palette.y, { steps: 3 });
      const leftShot = await capture(s, `eraser-left-${s.arm}`);
      return { eraserFound, hovering, hoverShot, leftShot };
    }),
};
