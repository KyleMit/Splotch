import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { localContext, fontsReady, receipt, followAnchor, BASE, EVIDENCE } from './pages-run4.mjs';

const SCROLL_TIMEOUT_MS = 15_000;
const DISCLOSURE_ATTEMPT_TIMEOUT_MS = 250;

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const profiles = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
  narrow: { width: 320, height: 740 },
};
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
const SCROLL_QUIET_SAMPLES = 3;
const SCROLL_QUIET_TOLERANCE_PX = 0.25;
mkdirSync(`${EVIDENCE}/anchors`, { recursive: true });

async function showContents(page, label) {
  const disclosure = page
    .getByRole('button', { name: new RegExp(`^${label},`) })
    .filter({ visible: true });
  const navigation = page
    .getByRole('navigation', { name: label, exact: true })
    .filter({ visible: true })
    .first();
  await expect(async () => {
    if (await disclosure.count()) {
      if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await disclosure.click();
    }
    await expect(navigation).toBeVisible({ timeout: DISCLOSURE_ATTEMPT_TIMEOUT_MS });
  }).toPass({ timeout: SCROLL_TIMEOUT_MS });
  return navigation;
}

try {
  for (const [profile, viewport] of Object.entries(profiles).filter(
    ([name]) => !process.env.HUNT_PROFILES || process.env.HUNT_PROFILES.split(',').includes(name)
  ))
    for (const js of (process.env.HUNT_JS ?? 'on,off').split(',').map((value) => value === 'on')) {
      for (const [name, label] of [
        ['privacy', 'Privacy policy contents'],
        ['changelog', 'Changelog contents'],
        ['design', 'Contents'],
      ].filter(
        ([name]) => !process.env.HUNT_PAGES || process.env.HUNT_PAGES.split(',').includes(name)
      )) {
        const s = await localContext(browser, {
          viewport,
          hasTouch: profile !== 'desktop',
          javaScriptEnabled: js,
          reducedMotion: 'reduce',
        });
        const { page } = s;
        const take = process.env.HUNT_TAKE;
        const id = `${take ? take + '-' : ''}${engine}-${profile}-js${js ? 'on' : 'off'}-${name}`;
        const row = {
          id,
          engine,
          profile,
          js,
          name,
          at: new Date().toISOString(),
          take: take ?? 'pointer',
          linkMode: process.env.HUNT_LINK_MODE ?? 'pointer',
          status: 'PASS',
          followed: [],
        };
        try {
          await page.goto(`${BASE}/${name}`);
          const navigation = await showContents(page, label);
          const links = await navigation
            .locator('a[href^="#"]')
            .evaluateAll((nodes) =>
              nodes
                .filter((n) => n.checkVisibility())
                .map((n) => ({ href: n.getAttribute('href'), text: n.textContent }))
            );
          expect(links.length).toBeGreaterThan(0);
          row.links = links;
          const order = name === 'changelog' ? [links.at(-1), ...links.slice(0, -1)] : links;
          for (const link of order) {
            await showContents(page, label);
            const followed = await followAnchor(page, link.href);
            let previous = null,
              quiet = 0;
            await expect
              .poll(
                async () => {
                  const top = await page.evaluate(
                    (href) =>
                      document
                        .getElementById(decodeURIComponent(href.slice(1)))
                        .getBoundingClientRect().top,
                    link.href
                  );
                  quiet =
                    previous !== null && Math.abs(top - previous) <= SCROLL_QUIET_TOLERANCE_PX
                      ? quiet + 1
                      : 0;
                  previous = top;
                  return quiet;
                },
                { timeout: SCROLL_TIMEOUT_MS }
              )
              .toBeGreaterThanOrEqual(SCROLL_QUIET_SAMPLES);
            await fontsReady(page);
            const capture = `${id}-${link.href.slice(1).replaceAll('~', '-')}.png`;
            await page.screenshot({ path: `${EVIDENCE}/anchors/${capture}` });
            row.followed.push({
              ...followed,
              quietTop: previous,
              evidence: `evidence/run4/anchors/${capture}`,
            });
          }
          const top = page
            .getByRole('link', { name: 'Back to top', exact: true })
            .filter({ visible: true })
            .first();
          if (await top.count())
            row.toTop = await followAnchor(page, await top.getAttribute('href'));
          if (name === 'design' && js) {
            const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
            const picker = page.getByRole('radiogroup', { name: 'Preview theme', exact: true });
            const dark = picker.getByRole('radio', { name: 'Dark', exact: true });
            await dark.click();
            await expect(dark).toHaveAttribute('aria-checked', 'true');
            await picker.getByRole('radio', { name: 'Light', exact: true }).click();
            await expect(picker.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute(
              'aria-checked',
              'true'
            );
            expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(stored);
            row.themePreview = { dark: true, light: true, noStorageWrite: true };
          }
          row.final = await receipt(page);
          expect(row.final.csp).toEqual([]);
          expect(s.errors).toEqual([]);
          expect(s.external).toEqual([]);
        } catch (error) {
          row.status = 'REVIEW';
          row.error = String(error.stack);
          row.final = await receipt(page).catch(() => null);
        } finally {
          await page.screenshot({ path: `${EVIDENCE}/anchors/${id}.png` }).catch(() => {});
          await page
            .locator('body')
            .ariaSnapshot()
            .then((tree) => writeFileSync(`${EVIDENCE}/anchors/${id}.aria.txt`, tree))
            .catch(() => {});
          row.errors = s.errors;
          row.external = s.external;
          row.consoleErrors = s.consoleErrors;
          await s.context.close();
          appendFileSync(`${EVIDENCE}/anchor-observations.jsonl`, JSON.stringify(row) + '\n');
          console.log(
            JSON.stringify({
              id,
              status: row.status,
              followed: row.followed.length,
              error: row.error?.slice(0, 350),
            })
          );
        }
      }
    }
} finally {
  await browser.close();
}
