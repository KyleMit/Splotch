import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { installAiFixture } from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';
import { solveGate, settle } from '../../2026-10-18-device-parity/results/web/harness.mjs';
const OUT = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
const ACTION_TIMEOUT_MS = 30000;
const b = await chromium.connectOverCDP('http://127.0.0.1:6111');
const records = [],
  external = [];
let requests = [];
try {
  const ctx = b.contexts()[0],
    page = ctx.pages()[0];
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  await ctx.route('**', (r) => {
    const u = new URL(r.request().url());
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return r.fallback();
    external.push(u.origin + u.pathname);
    return r.abort();
  });
  requests = await installAiFixture(ctx);
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  const prior = JSON.parse(readFileSync(`${OUT}/chromium-androidremote-ai-results.json`, 'utf8'));
  expect(
    prior.fixtureRequests.filter((r) => r.path === '/api/generate-image' && r.method === 'POST')
  ).toHaveLength(1);
  const card = page.getByRole('dialog', { name: 'AI Result', exact: true });
  await expect(card.getByRole('button', { name: 'Download', exact: true })).toBeVisible({
    timeout: ACTION_TIMEOUT_MS,
  });
  await expect(card.getByRole('img', { name: 'Your AI picture', exact: true })).toBeVisible();
  const frame = await settle(page);
  writeFileSync(
    `${OUT}/chromium-androidremote-ai-result.png`,
    frame.frame ?? (await page.screenshot())
  );
  records.push({ id: 'A02-result', status: 'pass', shot: 'chromium-androidremote-ai-result.png' });
  await page.getByRole('button', { name: 'Report this picture', exact: true }).click();
  if (
    await page
      .locator('[aria-label^="What is "]')
      .isVisible()
      .catch(() => false)
  )
    await solveGate({ page });
  const confirm = page.getByRole('dialog', { name: 'Report this picture', exact: true });
  await expect(confirm).toBeVisible();
  expect(requests.filter((r) => r.path === '/api/report-image')).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect
    .poll(
      () => requests.filter((r) => r.path === '/api/report-image' && r.method === 'POST').length,
      { timeout: ACTION_TIMEOUT_MS }
    )
    .toBe(1);
  await expect(page.getByText(/^Thanks\. We'll review/)).toBeVisible({
    timeout: ACTION_TIMEOUT_MS,
  });
  const sent = await settle(page);
  writeFileSync(
    `${OUT}/chromium-androidremote-ai-report.png`,
    sent.frame ?? (await page.screenshot())
  );
  records.push({ id: 'A03-report', status: 'pass', shot: 'chromium-androidremote-ai-report.png' });
  const storage = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('splotch-beta-ai-jobs-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('state').objectStore('state').get('current');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            resolve({
              attempts: req.result?.attempts?.length ?? 0,
              originalModels:
                req.result?.attempts?.filter(
                  (a) => typeof a.originalModel === 'string' && a.originalModel.length > 0
                ).length ?? 0,
              localStorageOriginalModels: Object.values(localStorage).filter((v) =>
                v.includes('originalModel')
              ).length,
            });
            db.close();
          };
        };
      })
  );
  expect(storage.originalModels).toBeGreaterThan(0);
  expect(storage.localStorageOriginalModels).toBe(0);
  records.push({ id: 'A08-idb-original', status: 'pass', storage });
} catch (error) {
  records.push({ id: 'current-step', status: 'blocked', error: String(error) });
} finally {
  writeFileSync(
    `${OUT}/chromium-androidremote-ai-followup.json`,
    JSON.stringify({ records, fixtureRequests: requests, externalBlocked: external }, null, 2) +
      '\n'
  );
  console.log(records);
  await b.close();
}
