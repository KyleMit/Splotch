import { appendFileSync } from 'node:fs';
import {
  connect,
  open,
  boot,
  record,
  expect,
  OUT,
  ENGINE,
  stroke,
  undoDepth,
  BASE,
} from './driver.mjs';
import { settings } from './ui.mjs';

const browser = await connect();
try {
  for (const profile of ['phone', 'tablet', 'desktop']) {
    const s = await open(browser, profile);
    await s.ctx.route('**/__harness__/prior', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Prior fixture</title><p>Harness prior page</p>',
      })
    );
    try {
      await s.page.goto(BASE + '/__harness__/prior');
      await boot(s);
      await record(s, 'L03-browser-back', async () => {
        await stroke(s);
        await settings(s, 'Sound');
        await s.page.goBack();
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        expect(s.page.url()).toBe(BASE + '/');
        const coarse = await s.page.evaluate(() => matchMedia('(pointer: coarse)').matches);
        await s.page.goBack();
        if (coarse) {
          await expect(s.page.locator('[data-testid="drawing-paper"]')).toBeVisible();
          expect(s.page.url()).toBe(BASE + '/');
          expect(await undoDepth(s)).toBe(1);
          await s.page.goBack();
        }
        await expect(s.page.getByText('Harness prior page', { exact: true })).toBeVisible();
        return {
          coarse,
          settingsBackClosedWholeDialog: true,
          guardAbsorbedOneBack: coarse,
          exitedToFixture: true,
          limits:
            'Named local history sentinel; no information routes opened. Fine pointer intentionally has no drawing guard.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} browser Back batch ended; modal dismissal and coarse-pointer one-Back guard exercised against a local sentinel fixture.\n`
  );
} finally {
  await browser.close();
}
