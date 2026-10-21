import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { localContext, fontsReady, receipt, BASE, EVIDENCE } from './pages-run4.mjs';

const KEYBOARD_READ_TIMEOUT_MS = 15_000;
const engine = process.env.HUNT_ENGINE ?? 'chromium';
const profiles = { narrow: { width: 320, height: 740 }, desktop: { width: 1280, height: 800 } };
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
mkdirSync(`${EVIDENCE}/keyboard`, { recursive: true });
async function keyActivate(locator, key = 'Enter') {
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.press(key);
}
async function followByKey(page, link) {
  const href = await link.getAttribute('href');
  await keyActivate(link);
  const target = decodeURIComponent(href.slice(1));
  try {
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const e = document.getElementById(id);
            const r = e?.getBoundingClientRect();
            return !!e?.checkVisibility() && r.top >= -1 && r.top < innerHeight;
          }, target),
        { timeout: KEYBOARD_READ_TIMEOUT_MS }
      )
      .toBe(true);
  } catch (error) {
    const state = await page.evaluate(
      (id) => ({
        href: location.href,
        target: document.getElementById(id)?.getBoundingClientRect().toJSON(),
        active: document.activeElement?.outerHTML,
        viewport: { width: innerWidth, height: innerHeight },
      }),
      target
    );
    throw new Error(`${href}: ${JSON.stringify(state)}\n${error.message}`, { cause: error });
  }
  return { href, targetVisible: true };
}
try {
  for (let repeat = 1; repeat <= Number(process.env.HUNT_REPEATS ?? 1); repeat++)
    for (const [profile, viewport] of Object.entries(profiles).filter(
      ([key]) => !process.env.HUNT_PROFILES || process.env.HUNT_PROFILES.split(',').includes(key)
    ))
      for (const js of (process.env.HUNT_JS ?? 'on,off').split(',').map((value) => value === 'on'))
        for (const path of [
          '/privacy',
          '/changelog',
          '/beta?os=android',
          '/design',
          '/feedback',
          '/admin',
        ].filter(
          (path) => !process.env.HUNT_PAGES || process.env.HUNT_PAGES.split(',').includes(path)
        )) {
          const s = await localContext(browser, {
            viewport,
            javaScriptEnabled: js,
            reducedMotion: 'reduce',
          });
          const { page, context } = s;
          const id = `${engine}-${profile}-js${js ? 'on' : 'off'}-${path.replaceAll(/[^a-z0-9]/gi, '_')}`;
          const row = {
            at: new Date().toISOString(),
            id,
            engine,
            profile,
            js,
            path,
            repeat,
            status: 'PASS',
          };
          try {
            await page.goto(`${BASE}${path}`);
            await fontsReady(page);
            if (path === '/privacy' || path === '/changelog') {
              const summary = page
                .locator('[data-testid="page-contents-shell"] button')
                .filter({ visible: true });
              if (js) {
                if (path === '/changelog') {
                  const older = page.getByRole('button', { name: /Show \d+ older releases/ });
                  await expect(async () => {
                    if (await older.count()) await keyActivate(older);
                    await expect(older).toHaveCount(0, { timeout: 250 });
                  }).toPass({ timeout: KEYBOARD_READ_TIMEOUT_MS });
                }
                if (await summary.count())
                  await expect(async () => {
                    if ((await summary.getAttribute('aria-expanded')) !== 'true')
                      await keyActivate(summary);
                    await expect(summary).toHaveAttribute('aria-expanded', 'true', {
                      timeout: 250,
                    });
                  }).toPass({ timeout: KEYBOARD_READ_TIMEOUT_MS });
              }
              const label = path === '/privacy' ? 'Privacy policy contents' : 'Changelog contents';
              const links = page
                .getByRole('navigation', { name: label, exact: true })
                .filter({ visible: true })
                .locator('a[href]');
              row.fragment = await followByKey(page, links.last());
              if (js && (await summary.count())) await expect(summary).toBeFocused();
            } else if (path.startsWith('/beta')) {
              if (js) {
                const android = page.locator('#beta-platform-android');
                const ios = page.locator('#beta-platform-ios');
                await expect(android).toHaveAttribute('aria-checked', 'true');
                await keyActivate(android, 'ArrowRight');
                await expect(ios).toHaveAttribute('aria-checked', 'true');
                expect(new URL(page.url()).searchParams.get('os')).toBe('ios');
                await keyActivate(ios, 'ArrowLeft');
                await expect(android).toHaveAttribute('aria-checked', 'true');
                await keyActivate(ios, 'Space');
                await expect(ios).toHaveAttribute('aria-checked', 'true');
                row.radioKeys = ['ArrowRight', 'ArrowLeft', 'Space'];
              } else {
                const ios = page.locator('nav a[href^="#beta-ios"]').filter({ visible: true });
                row.fragment = await followByKey(page, ios);
              }
              const details = page.locator('details').filter({ visible: true }).first();
              const summary = details.locator('summary');
              await keyActivate(summary, 'Space');
              await expect(details).toHaveAttribute('open', '');
              await keyActivate(summary, 'Enter');
              await expect(details).not.toHaveAttribute('open', '');
              row.detailsKeys = true;
            } else if (path === '/design') {
              if (js) {
                const group = page.getByRole('radiogroup', { name: 'Preview theme', exact: true });
                const light = group.getByRole('radio', { name: 'Light', exact: true });
                const dark = group.getByRole('radio', { name: 'Dark', exact: true });
                const before = await page.evaluate(() => ({ ...localStorage }));
                await expect(async () => {
                  if ((await dark.getAttribute('aria-checked')) !== 'true')
                    await keyActivate(light, 'ArrowRight');
                  await expect(dark).toHaveAttribute('aria-checked', 'true', { timeout: 250 });
                }).toPass({ timeout: KEYBOARD_READ_TIMEOUT_MS });
                await keyActivate(dark, 'ArrowLeft');
                await expect(light).toHaveAttribute('aria-checked', 'true');
                expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
                row.themeKeys = true;
              }
              const contents = page
                .getByRole('navigation', { name: 'Contents', exact: true })
                .filter({ visible: true });
              row.fragment = await followByKey(
                page,
                contents.getByRole('link', { name: 'Dottie', exact: true })
              );
            } else if (path === '/feedback' && js) {
              const sent = [];
              await context.route('**/api/report', async (route) => {
                sent.push(route.request().postDataJSON());
                await route.fulfill({
                  status: sent.length === 1 ? 503 : 200,
                  contentType: 'application/json',
                  body: JSON.stringify(
                    sent.length === 1
                      ? { ok: false, error: 'Keyboard fixture failure.' }
                      : { ok: true }
                  ),
                });
              });
              const field = page.getByRole('textbox').filter({ visible: true }).first();
              await expect(
                page.getByRole('button', { name: 'Send report', exact: true })
              ).toBeEnabled();
              await field.fill('A local keyboard-only report fixture.');
              const send = page.getByRole('button', { name: 'Send report', exact: true });
              await keyActivate(send);
              await expect(page.getByRole('alert')).toContainText('Keyboard fixture failure.');
              await keyActivate(send);
              await expect(page.getByRole('heading', { level: 1 })).toHaveText(
                'Thank you — your report is in.'
              );
              await keyActivate(page.getByRole('link', { name: 'Send another', exact: true }));
              await expect(field).toHaveValue('');
              expect(sent).toHaveLength(2);
              row.reportKeys = true;
            } else if (path === '/admin' && js) {
              const secret = page.getByLabel('Admin access key', { exact: true });
              await expect(secret).toBeEnabled();
              await secret.fill('run4-test-secret');
              await secret.press('Enter');
              await expect(
                page.getByRole('button', { name: 'Sign out', exact: true })
              ).toBeVisible();
              const code = `run4-keyboard-${engine}-${profile}`;
              const newCode = page.getByLabel('New access code', { exact: true });
              await newCode.fill(code);
              await newCode.press('Enter');
              await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
              await keyActivate(page.getByRole('button', { name: `Remove ${code}`, exact: true }));
              await expect(page.getByText(code, { exact: true })).toHaveCount(0);
              await keyActivate(page.getByRole('button', { name: 'Sign out', exact: true }));
              await expect(secret).toBeEnabled();
              row.adminKeys = true;
            }
            row.read = await receipt(page);
            await page.screenshot({ path: `${EVIDENCE}/keyboard/${id}.png` });
            const home = page
              .getByRole('link', { name: /^(Start drawing|Back to drawing)$/ })
              .filter({ visible: true })
              .first();
            await keyActivate(home);
            await expect(page).toHaveURL(`${BASE}/`);
            if (js) await page.locator('html[data-controls-live]').waitFor({ state: 'attached' });
            else
              await expect(page.getByRole('heading', { level: 1 })).toHaveText(
                'Splotch needs JavaScript to draw'
              );
            row.homeByKey = true;
            row.errors = s.errors;
            row.external = s.external;
            expect(s.errors).toEqual([]);
            expect(s.external).toEqual([]);
            expect(row.read.csp).toEqual([]);
          } catch (error) {
            row.status = 'REVIEW';
            row.error = String(error.stack);
            row.failure = await receipt(page).catch(() => null);
            await page
              .screenshot({ path: `${EVIDENCE}/keyboard/${id}-failed-${Date.now()}.png` })
              .catch(() => {});
          } finally {
            await context.close();
            appendFileSync(`${EVIDENCE}/keyboard.jsonl`, JSON.stringify(row) + '\n');
            console.log(
              JSON.stringify({ id, status: row.status, error: row.error?.slice(0, 600) })
            );
          }
        }
} finally {
  await browser.close();
}
