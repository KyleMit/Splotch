import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { localContext, fontsReady, reactHydrated, receipt, BASE, EVIDENCE } from './pages-run4.mjs';

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const profiles = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
  narrow: { width: 320, height: 740 },
};
const sources = [
  '/privacy',
  '/changelog',
  '/beta',
  '/feedback',
  '/admin',
  '/design',
  '/unknown-links-probe',
];
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
try {
  for (const [profile, viewport] of Object.entries(profiles).filter(
    ([key]) => !process.env.HUNT_PROFILES || process.env.HUNT_PROFILES.split(',').includes(key)
  ))
    for (const js of (process.env.HUNT_JS ?? 'on,off').split(',').map((value) => value === 'on')) {
      const s = await localContext(browser, {
        viewport,
        javaScriptEnabled: js,
        reducedMotion: 'reduce',
      });
      try {
        for (const source of sources) {
          const errorStart = s.errors.length,
            timelineStart = s.timeline.length;
          const row = {
            take: process.env.HUNT_TAKE ?? 'initial',
            engine,
            profile,
            js,
            source,
            at: new Date().toISOString(),
            status: 'PASS',
            links: [],
          };
          try {
            await s.page.goto(BASE + source);
            await fontsReady(s.page);
            if (js && process.env.HUNT_SETTLE_HYDRATION === '1') await reactHydrated(s.page);
            const read = await receipt(s.page);
            const hrefs = [
              ...new Set(
                read.links
                  .map((x) => x.href)
                  .filter((href) => href.startsWith('/') && !href.startsWith('//'))
              ),
            ];
            expect(hrefs.length).toBeGreaterThan(0);
            for (const href of hrefs) {
              await s.page.goto(BASE + source);
              await fontsReady(s.page);
              if (js && process.env.HUNT_SETTLE_HYDRATION === '1') await reactHydrated(s.page);
              const link = s.page
                .locator(`a[href=${JSON.stringify(href)}]`)
                .filter({ visible: true })
                .first();
              await link.click();
              await expect(s.page).toHaveURL(new URL(href, BASE).href);
              await s.page.waitForLoadState('load');
              await fontsReady(s.page);
              if (js && process.env.HUNT_SETTLE_HYDRATION === '1') await reactHydrated(s.page);
              const target = await s.page.evaluate(() => {
                const id = decodeURIComponent(location.hash.slice(1));
                const node = id ? document.getElementById(id) : null;
                return {
                  url: location.href,
                  title: document.title,
                  id,
                  hashFound: id ? !!node : null,
                  hashShown: node?.checkVisibility() ?? null,
                  headings: [...document.querySelectorAll('h1')]
                    .filter((e) => e.checkVisibility())
                    .map((e) => e.textContent),
                };
              });
              if (href !== '/' || !js) expect(target.headings).toHaveLength(1);
              if (target.id && !target.hashFound) row.status = 'KNOWN_WEB003';
              row.links.push({ href, ...target });
            }
            expect(s.external).toEqual([]);
            expect(s.errors.slice(errorStart)).toEqual([]);
          } catch (error) {
            row.status = 'REVIEW';
            row.error = String(error.stack);
          }
          row.errors = s.errors.slice(errorStart);
          row.timeline = s.timeline.slice(timelineStart);
          row.external = [...s.external];
          appendFileSync(`${EVIDENCE}/local-links.jsonl`, JSON.stringify(row) + '\n');
          console.log(
            JSON.stringify({
              engine,
              profile,
              js,
              source,
              status: row.status,
              followed: row.links.length,
              error: row.error?.slice(0, 200),
            })
          );
        }
      } finally {
        await s.context.close();
      }
    }
} finally {
  await browser.close();
}
