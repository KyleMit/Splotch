import { appendFileSync, writeFileSync } from 'node:fs';
import {
  connect,
  open,
  boot,
  button,
  record,
  expect,
  OUT,
  ENGINE,
  stroke,
  undoDepth,
} from './driver.mjs';
import { land, settings, solve } from './ui.mjs';
import {
  installAiFixture,
  AI_REPLIES,
  heldReply,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

async function toggle(s, name, value) {
  const control = s.page.getByRole('switch', { name, exact: true });
  if (((await control.getAttribute('aria-checked')) === 'true') !== value) await control.click();
  await expect(control).toHaveAttribute('aria-checked', String(value));
}
async function ready(s) {
  await boot(s);
  await settings(s, 'AI Art');
  await toggle(s, 'Create AI Images', true);
  await toggle(s, 'Customize AI Style', true);
  await toggle(s, 'Auto-Save AI Images', false);
  await s.page.keyboard.press('Escape');
  await expect(s.page.getByRole('dialog')).toHaveCount(0);
  await stroke(s);
  await expect(
    s.page.getByRole('button', { name: /AI image/ }).filter({ visible: true })
  ).toBeEnabled();
}
async function generate(s) {
  await s.page
    .getByRole('button', { name: /AI image/ })
    .filter({ visible: true })
    .click();
  if (await s.page.locator('[aria-label^="What is "]').filter({ visible: true }).count())
    await solve(s, true);
  await expect(button(s.page, 'Sticker')).toBeVisible();
  await land(s);
  await button(s.page, 'Sticker').click();
  await expect(s.page.getByRole('dialog', { name: 'AI Result', exact: true })).toBeVisible();
}
function saveLog(log, name) {
  writeFileSync(
    `${OUT}/evidence/run4/${ENGINE}-${name}-${Date.now()}-api.json`,
    JSON.stringify(log, null, 2) + '\n'
  );
}
async function report(s) {
  await button(s.page, 'Report this picture').click();
  if (await s.page.locator('[aria-label^="What is "]').filter({ visible: true }).count())
    await solve(s, true);
  await expect(
    s.page.getByRole('dialog', { name: 'Report this picture', exact: true })
  ).toBeVisible();
  await land(s);
}

const browser = await connect();
try {
  for (const profile of (process.env.HUNT_PROFILES ?? 'phone,tablet,desktop').split(',')) {
    const s = await open(browser, profile);
    const held = heldReply(AI_REPLIES.picture(profile === 'desktop' ? 'landscape' : 'portrait'));
    const log = await installAiFixture(s.ctx, { '/api/generate-image': [held.reply] });
    const sent = [];
    s.ctx.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/generate-image') sent.push(request.method());
    });
    try {
      await record(s, 'A01-A03-A08-fixture-success', async () => {
        await ready(s);
        await generate(s);
        await expect.poll(() => sent.length).toBe(1);
        const minimized = button(s.page, 'Keep drawing while you wait');
        await expect(minimized).toBeVisible();
        await minimized.click();
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        await stroke(s, [
          [
            [0.3, 0.5],
            [0.7, 0.55],
          ],
        ]);
        held.release();
        const restore = button(s.page, 'Show your finished picture');
        await expect(restore).toBeVisible({ timeout: 15000 });
        await restore.click();
        await expect(button(s.page, 'Download')).toBeVisible({ timeout: 15000 });
        await land(s);
        await s.page.screenshot({
          path: `${OUT}/evidence/run4/${ENGINE}-${profile}-ai-result.png`,
        });
        await report(s);
        await button(s.page, 'Cancel').click();
        await expect(
          s.page.getByRole('dialog', { name: 'Report this picture', exact: true })
        ).toHaveCount(0);
        expect(log.filter((x) => x.path === '/api/report-image').length).toBe(0);
        await report(s);
        await button(s.page, 'Send report').click();
        await expect.poll(() => log.filter((x) => x.path === '/api/report-image').length).toBe(1);
        await expect(s.page.getByText(/Thanks. We'll review it/)).toBeVisible();
        const storage = await s.page.evaluate(async () => {
          const names = await indexedDB.databases();
          return Promise.all(
            names.map(
              (info) =>
                new Promise((resolve) => {
                  const request = indexedDB.open(info.name);
                  request.onsuccess = () => {
                    const db = request.result;
                    const stores = [...db.objectStoreNames];
                    if (info.name === 'splotch-beta-ai-jobs-v1' && stores.includes('state')) {
                      const tx = db.transaction('state', 'readonly');
                      const state = tx.objectStore('state').get('current');
                      state.onsuccess = () => {
                        const attempts = state.result?.attempts ?? [];
                        db.close();
                        resolve({
                          name: info.name,
                          stores,
                          attempts: attempts.map((a) => ({
                            originalModelBytes: new TextEncoder().encode(a.originalModel).length,
                            inputLength: a.receipt.inputLength,
                            resultLength: a.receipt.resultLength,
                            phase: a.receipt.journal.phase,
                          })),
                        });
                      };
                      state.onerror = () => {
                        db.close();
                        resolve({ name: info.name, stores, error: true });
                      };
                    } else {
                      db.close();
                      resolve({ name: info.name, stores });
                    }
                  };
                  request.onerror = () => resolve({ name: info.name, error: true });
                })
            )
          );
        });
        expect(storage.some((x) => x.name === 'splotch-beta-ai-jobs-v1')).toBe(true);
        const jobs = storage.find((x) => x.name === 'splotch-beta-ai-jobs-v1');
        expect(jobs.attempts.length).toBeGreaterThan(0);
        expect(
          jobs.attempts.every(
            (a) =>
              a.originalModelBytes > 0 &&
              a.inputLength > 0 &&
              a.resultLength > 0 &&
              a.phase === 'result'
          )
        ).toBe(true);
        expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(1);
        return {
          requests: log,
          storage,
          oneUpload: true,
          minimizedAndDrew: true,
          cancelSentNothing: true,
          reportSentOnce: true,
          limits:
            'Original model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte image validation.',
        };
      });
    } finally {
      held.release();
      saveLog(log, `${profile}-success`);
      await s.ctx.close();
    }
  }
  for (const [name, reply] of Object.entries({
    serverError: AI_REPLIES.serverError,
    bare502: AI_REPLIES.bare502,
    malformedJson: AI_REPLIES.malformedJson,
    wrongType: AI_REPLIES.wrongType,
    throttled: AI_REPLIES.throttled,
    refusal: AI_REPLIES.refusal,
  })) {
    const s = await open(browser, 'phone');
    const log = await installAiFixture(s.ctx, {
      '/api/generate-image': [reply, AI_REPLIES.picture()],
    });
    try {
      await record(s, `A04-A05-${name}`, async () => {
        await ready(s);
        await generate(s);
        if (name === 'refusal') {
          await expect(button(s.page, 'Report this refusal')).toBeVisible({ timeout: 15000 });
          await s.page.keyboard.press('Escape');
          expect(await undoDepth(s)).toBe(1);
        } else {
          await expect(button(s.page, 'Try again')).toBeVisible({ timeout: 15000 });
          expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(1);
          await button(s.page, 'Try again').click();
          await expect(button(s.page, 'Download')).toBeVisible({ timeout: 15000 });
          expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(2);
        }
        return {
          requests: log,
          recovered: name !== 'refusal',
          limits:
            name === 'throttled'
              ? '429 behavior recorded; whether immediate retry is intentional requires source/shipping comparison.'
              : 'Fixture only; no live transport proven.',
        };
      });
    } finally {
      saveLog(log, `error-${name}`);
      await s.ctx.close();
    }
  }
  {
    const s = await open(browser, 'phone');
    const log = await installAiFixture(s.ctx);
    try {
      await record(s, 'S07-dummy-key-persistence', async () => {
        const dummy = 'sk-fixture-only-000000000000000000000000';
        await boot(s);
        await stroke(s);
        await settings(s, 'AI Art');
        await toggle(s, 'Create AI Images', true);
        const field = s.page.getByRole('textbox', { name: 'OpenAI API Key', exact: true });
        await expect(field).toBeVisible();
        await field.fill(dummy);
        await field.press('Control+z');
        await field.fill(dummy);
        await button(s.page, 'Save').click();
        const saved = s.page.getByRole('textbox', {
          name: 'Saved OpenAI API key (masked)',
          exact: true,
        });
        await expect(saved).toBeVisible({ timeout: 15000 });
        expect(await saved.inputValue()).not.toBe(dummy);
        expect(
          await s.page.evaluate(
            (value) => Object.values(localStorage).some((stored) => stored.includes(value)),
            dummy
          )
        ).toBe(false);
        await s.page.keyboard.press('Escape');
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        expect(await undoDepth(s)).toBe(1);
        await boot(s);
        await settings(s, 'AI Art');
        await expect(saved).toBeVisible();
        await button(s.page, 'Forget').click();
        await expect(field).toBeVisible();
        await s.page.keyboard.press('Escape');
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        await boot(s);
        await settings(s, 'AI Art');
        await expect(saved).toHaveCount(0);
        await expect(field).toBeVisible();
        expect(log.filter((x) => x.path === '/api/verify-key').length).toBe(1);
        expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(0);
        return {
          dummyOnly: true,
          verifiedThroughFixture: true,
          masked: true,
          noPlaintextLocalStorage: true,
          reloadRetained: true,
          forgetPersisted: true,
          fieldShortcutDidNotUndoInk: true,
          requests: log,
          limits:
            'No real key; encryption implementation covered by existing vault tests, not inferred from masking.',
        };
      });
    } finally {
      saveLog(log, 'dummy-key');
      await s.ctx.close();
    }
  }
  {
    const s = await open(browser, 'phone');
    const log = await installAiFixture(s.ctx, {
      '/api/generate-image': [AI_REPLIES.ticket],
      '/api/generation-result': [AI_REPLIES.pending, AI_REPLIES.picture()],
    });
    try {
      await record(s, 'A06-ticket-poll-success', async () => {
        await ready(s);
        await generate(s);
        await expect(button(s.page, 'Download')).toBeVisible({ timeout: 30000 });
        await land(s);
        const uploads = log.filter((x) => x.path === '/api/generate-image');
        const polls = log.filter((x) => x.path === '/api/generation-result');
        expect(uploads.length).toBe(1);
        expect(polls.length).toBe(2);
        expect(polls.every((x) => x.method === 'GET' && x.query.includes('a'.repeat(64)))).toBe(
          true
        );
        return {
          uploads: uploads.length,
          polls: polls.length,
          requests: log,
          limits:
            'Ticket then pending then image; long timeout and reload-mid-poll remain separate.',
        };
      });
    } finally {
      saveLog(log, 'poll');
      await s.ctx.close();
    }
  }
  {
    const s = await open(browser, 'phone');
    const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
    try {
      await record(s, 'A07-offline-reconnect', async () => {
        await ready(s);
        await s.ctx.setOffline(true);
        const wand = s.page
          .getByRole('button', { name: /AI image|finished picture/ })
          .filter({ visible: true });
        await expect
          .poll(async () => (await wand.count()) === 0 || !(await wand.first().isEnabled()))
          .toBe(true);
        expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(0);
        await s.ctx.setOffline(false);
        await expect(s.page.getByRole('button', { name: /Create AI image/ })).toBeEnabled({
          timeout: 15000,
        });
        await generate(s);
        await expect(button(s.page, 'Download')).toBeVisible({ timeout: 15000 });
        return {
          offlineDidNotUpload: true,
          reconnectedGenerationSucceeded: true,
          requests: log,
          limits: 'Playwright network-offline signal; no real endpoint delivery claimed.',
        };
      });
    } finally {
      await s.ctx.setOffline(false);
      saveLog(log, 'offline');
      await s.ctx.close();
    }
  }
  {
    const s = await open(browser, 'phone');
    await s.ctx.addInitScript(() => {
      window.__quotaFail = false;
      window.__quotaHits = 0;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.__quotaFail && this.transaction.db.name === 'splotch-beta-ai-jobs-v1') {
          window.__quotaHits++;
          throw new DOMException('Named fixture quota failure', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
    const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
    try {
      await record(s, 'W13-ai-idb-quota', async () => {
        await ready(s);
        await s.page.evaluate(() => (window.__quotaFail = true));
        await generate(s);
        await expect(button(s.page, 'Try again')).toBeVisible({ timeout: 15000 });
        await expect(
          s.page.getByRole('heading', { name: 'Out of space', exact: true })
        ).toBeVisible();
        const hits = await s.page.evaluate(() => window.__quotaHits);
        expect(hits).toBeGreaterThan(0);
        expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(0);
        await s.page.evaluate(() => (window.__quotaFail = false));
        await button(s.page, 'Try again').click();
        await expect(button(s.page, 'Download')).toBeVisible({ timeout: 15000 });
        expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(1);
        return {
          quotaHits: hits,
          uploadBeforeDurableStorage: false,
          retrySucceeded: true,
          requests: log,
          limits: 'Named IDB put QuotaExceededError fixture; actual origin storage not filled.',
        };
      });
    } finally {
      saveLog(log, 'quota');
      await s.ctx.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} AI batch ended: ${process.env.HUNT_CASES ? `selected cases ${process.env.HUNT_CASES}` : 'fixture success/minimize/report and error/retry cases'} attempted. All /api calls intercepted; request receipts saved.\n`
  );
} finally {
  await browser.close();
}
