import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { localContext, fontsReady, receipt, BASE, EVIDENCE } from './pages-run4.mjs';

const FRAGMENT_TIMEOUT_MS = 15_000;

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const arm = process.env.HUNT_ARM ?? 'rn';
const privacy = JSON.parse(
  readFileSync('experiments/native-architecture/src/information/privacy.generated.json', 'utf8')
).web;
const releases = JSON.parse(readFileSync('web/src/lib/releases.json', 'utf8'));
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
mkdirSync(`${EVIDENCE}/links`, { recursive: true });
const rows = [];

async function inspect(page) {
  return page.evaluate(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = document.getElementById(id);
    const alternatives = [...document.querySelectorAll('[id]')].filter(
      (e) => e.id.split('~')[0] === id.split('~')[0]
    );
    const read = (e) => ({
      id: e.id,
      shown: e.checkVisibility(),
      top: e.getBoundingClientRect().top,
      variant: e.closest('[data-page-variant]')?.getAttribute('data-page-variant') ?? null,
    });
    return {
      url: location.href,
      id,
      found: !!target,
      target: target ? read(target) : null,
      alternatives: alternatives.map(read),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

async function run(id, js, action, options = {}) {
  const s = await localContext(browser, {
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: js,
    reducedMotion: 'reduce',
    ...options,
  });
  const row = {
    id: `${arm}-${engine}-${id}`,
    arm,
    engine,
    js,
    at: new Date().toISOString(),
    status: 'OBSERVED',
  };
  try {
    await action(s.page, row);
    await fontsReady(s.page);
    row.inspect = await inspect(s.page);
    row.read = await receipt(s.page);
    row.external = s.external;
    row.errors = s.errors;
    row.consoleErrors = s.consoleErrors;
    await s.page.screenshot({ path: `${EVIDENCE}/links/${row.id}.png` });
  } catch (error) {
    row.status = 'HARNESS_REVIEW';
    row.error = String(error.stack);
  } finally {
    await s.context.close();
    rows.push(row);
    appendFileSync(`${EVIDENCE}/deep-links.jsonl`, JSON.stringify(row) + '\n');
    console.log(
      JSON.stringify({ id: row.id, status: row.status, inspect: row.inspect, error: row.error })
    );
  }
}

try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    await run(`footer-whats-new-${repeat}`, false, async (page) => {
      await page.goto(`${BASE}/privacy`);
      const link = page
        .getByRole('link', { name: "What's new", exact: true })
        .filter({ visible: true });
      await expect(link).toHaveAttribute('href', `/changelog#${releases[0].id}`);
      await link.click();
      await expect(page).toHaveURL(`${BASE}/changelog#${releases[0].id}`);
    });
    for (const js of [false, true]) {
      for (const [name, path, target] of [
        ['privacy-canonical', '/privacy', privacy.sections.at(-1).id],
        ['changelog-canonical', '/changelog', releases.at(-1).id],
        ['design-canonical', '/design', 'dottie'],
      ])
        await run(`${name}-js${js ? 'on' : 'off'}-${repeat}`, js, async (page) => {
          await page.goto(`${BASE}${path}#${target}`);
          if (js) {
            await expect.poll(async () => (await inspect(page)).target?.shown ?? false).toBe(true);
            await expect
              .poll(
                async () => {
                  const r = await inspect(page);
                  return r.target.top >= -1 && r.target.top < r.viewport.height;
                },
                { timeout: FRAGMENT_TIMEOUT_MS }
              )
              .toBe(true);
          }
        });
    }
    if (arm === 'rn') {
      await run(
        `copied-phone-light-to-desktop-dark-${repeat}`,
        false,
        async (page) => {
          await page.goto(`${BASE}/privacy#${privacy.sections.at(-1).id}~phone-light`);
        },
        { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }
      );
    }
  }
} finally {
  await browser.close();
}
expect(rows).toHaveLength(arm === 'rn' ? 16 : 14);
