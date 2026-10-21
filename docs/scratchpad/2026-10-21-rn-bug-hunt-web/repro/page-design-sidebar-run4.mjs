import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { localContext, fontsReady, BASE, EVIDENCE } from './pages-run4.mjs';

const SIDEBAR_CLICK_TIMEOUT_MS = 2_500;
const SIDEBAR_WHEEL_DELTA_PX = 3_000;
const POINTER_MAX_Y_PX = 600;

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const arm = process.env.HUNT_ARM ?? 'rn';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
mkdirSync(`${EVIDENCE}/sidebar`, { recursive: true });
async function geometry(page) {
  return page.evaluate(() => {
    const shown = (e) => e.checkVisibility();
    const nav = [...document.querySelectorAll('nav[aria-label="Contents"]')].find(shown);
    const links = nav ? [...nav.querySelectorAll('a')].filter(shown) : [];
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const last = links.at(-1);
    const textRect = (e) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      const r = range.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const scrollContainers = [];
    for (let e = nav; e; e = e.parentElement)
      if (
        e.scrollHeight > e.clientHeight + 1 &&
        /(auto|scroll)/.test(getComputedStyle(e).overflowY)
      )
        scrollContainers.push({
          tag: e.tagName,
          rect: rect(e),
          scrollTop: e.scrollTop,
          clientHeight: e.clientHeight,
          scrollHeight: e.scrollHeight,
        });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      nav: nav
        ? {
            rect: rect(nav),
            clientHeight: nav.clientHeight,
            scrollHeight: nav.scrollHeight,
            scrollTop: nav.scrollTop,
            boxSizing: getComputedStyle(nav).boxSizing,
          }
        : null,
      last: last
        ? {
            text: last.textContent,
            href: last.getAttribute('href'),
            rect: rect(last),
            textRect: textRect(last),
          }
        : null,
      scrollContainers,
    };
  });
}
try {
  for (let repeat = 1; repeat <= 2; repeat++)
    for (const js of [true, false]) {
      const s = await localContext(browser, {
        viewport: { width: 1280, height: 800 },
        javaScriptEnabled: js,
        reducedMotion: 'reduce',
      });
      const { page } = s;
      const id = `${arm}-${engine}-js${js ? 'on' : 'off'}-${repeat}`;
      const row = { id, arm, engine, js, repeat, at: new Date().toISOString() };
      try {
        await page.goto(`${BASE}/design`);
        await fontsReady(page);
        const nav = page
          .getByRole('navigation', { name: 'Contents', exact: true })
          .filter({ visible: true })
          .first();
        await expect(nav).toBeVisible();
        const box = await nav.boundingBox();
        await page.mouse.move(
          box.x + box.width / 2,
          Math.min(POINTER_MAX_Y_PX, box.y + box.height / 2)
        );
        await page.mouse.wheel(0, SIDEBAR_WHEEL_DELTA_PX);
        let previous = null,
          quiet = 0;
        await expect
          .poll(async () => {
            const signature = JSON.stringify(await geometry(page));
            quiet = signature === previous ? quiet + 1 : 0;
            previous = signature;
            return quiet;
          })
          .toBeGreaterThanOrEqual(3);
        for (let attempt = 0; attempt < 3; attempt++) {
          const first = (await geometry(page)).scrollContainers[0];
          if (!first || first.scrollHeight - first.clientHeight - first.scrollTop <= 1) break;
          await page.mouse.wheel(0, SIDEBAR_WHEEL_DELTA_PX);
          await expect
            .poll(async () => {
              const current = (await geometry(page)).scrollContainers[0];
              return current.scrollHeight - current.clientHeight - current.scrollTop;
            })
            .toBeLessThanOrEqual(1);
        }
        row.scrolled = await geometry(page);
        await page.screenshot({ path: `${EVIDENCE}/sidebar/${id}-bottom.png` });
        const last = nav.locator('a').last();
        try {
          await last.click({ timeout: SIDEBAR_CLICK_TIMEOUT_MS });
          row.centerClick = true;
        } catch (error) {
          row.centerClick = false;
          row.clickError = String(error.message);
        }
        row.afterClick = await geometry(page);
        row.url = page.url();
        await page.screenshot({ path: `${EVIDENCE}/sidebar/${id}-after-click.png` });
        row.errors = s.errors;
        row.external = s.external;
      } catch (error) {
        row.error = String(error.stack);
      } finally {
        await s.context.close();
        appendFileSync(`${EVIDENCE}/design-sidebar.jsonl`, JSON.stringify(row) + '\n');
        console.log(JSON.stringify(row));
      }
    }
} finally {
  await browser.close();
}
