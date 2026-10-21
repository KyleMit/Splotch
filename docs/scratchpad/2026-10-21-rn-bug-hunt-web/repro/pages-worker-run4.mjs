import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { connect, open, boot, stroke, expect, ENGINE, OUT } from './driver.mjs';
import { installAiFixture } from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const WORKER_ACTIVATION_TIMEOUT_MS = 45_000;
const LATE_ERROR_WINDOW_MS = 1_000;
const take = process.env.HUNT_TAKE ?? 'initial';

const browser = await connect();
const rows = [];
try {
  const s = await open(browser, 'phone', { serviceWorkers: 'allow' });
  const consoleErrors = [],
    requests = [],
    timeline = [];
  let phase = 'boot';
  s.page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push({ phase, url: s.page.url(), text: message.text() });
  });
  s.page.on('pageerror', (error) =>
    timeline.push({ phase, url: s.page.url(), message: error.message })
  );
  s.ctx.on('request', (request) => requests.push(request.url()));
  try {
    await installAiFixture(s.ctx);
    await boot(s);
    for (let i = 0; i < 3; i++) await stroke(s);
    await expect
      .poll(
        () =>
          s.page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active),
        { timeout: WORKER_ACTIVATION_TIMEOUT_MS }
      )
      .toBe(true);
    await s.page.reload();
    await expect.poll(() => s.page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    if (take === 'settled') {
      await s.page
        .locator('html[data-drawing-live][data-controls-live]')
        .waitFor({ state: 'attached' });
      await new Promise((resolve) => setTimeout(resolve, LATE_ERROR_WINDOW_MS));
    }
    for (const [path, file, status] of [
      ['/', 'index.html', 200],
      ['/privacy', 'privacy.html', 200],
      ['/changelog', 'changelog.html', 200],
      ['/beta?os=ios', 'beta.html', 200],
      ['/feedback', 'feedback.html', 200],
      ['/admin', 'admin.html', 200],
      ['/design', 'design.html', 200],
      ['/worker-unknown/deep/path', '404.html', 404],
    ]) {
      phase = path;
      const response = await s.page.goto(`http://127.0.0.1:6150${path}`);
      if (take === 'settled') {
        if (path === '/')
          await s.page
            .locator('html[data-drawing-live][data-controls-live]')
            .waitFor({ state: 'attached' });
        await expect.poll(() => s.page.evaluate(() => document.fonts.status)).toBe('loaded');
        await new Promise((resolve) => setTimeout(resolve, LATE_ERROR_WINDOW_MS));
      }
      const actual = createHash('sha256')
        .update(await response.body())
        .digest('hex');
      const expected = createHash('sha256')
        .update(readFileSync(`experiments/native-architecture/dist/web/${file}`))
        .digest('hex');
      const row = {
        at: new Date().toISOString(),
        engine: ENGINE,
        take,
        path,
        file,
        status: response.status(),
        fromWorker: response.fromServiceWorker(),
        actual,
        expected,
        match: actual === expected,
        controller: await s.page.evaluate(
          () => navigator.serviceWorker.controller?.scriptURL ?? null
        ),
      };
      expect(row.status).toBe(status);
      expect(row.match).toBe(true);
      if (path === '/admin') expect(row.fromWorker).toBe(false);
      rows.push(row);
      appendFileSync(`${OUT}/evidence/run4/worker-pages.jsonl`, JSON.stringify(row) + '\n');
      console.log(JSON.stringify(row));
    }
    const completion = {
      at: new Date().toISOString(),
      engine: ENGINE,
      take,
      errors: s.errors,
      consoleErrors,
      external: s.external,
      requests,
      timeline,
    };
    appendFileSync(
      `${OUT}/evidence/run4/worker-completions.jsonl`,
      JSON.stringify(completion) + '\n'
    );
    expect(s.errors).toEqual([]);
    expect(s.external).toEqual([]);
    expect(
      requests.filter((url) => !['http://127.0.0.1:6150', 'null'].includes(new URL(url).origin))
    ).toEqual([]);
    expect(consoleErrors.filter((e) => !/^Failed to load resource:.*404/.test(e.text))).toEqual([]);
  } finally {
    await s.ctx.close();
  }
} finally {
  await browser.close();
}
expect(rows).toHaveLength(8);
