import { chromium, expect } from '@playwright/test';
import { spawnViteServer } from '../../../../tools/lib/vite-server.mjs';
const server = spawnViteServer(5300, { command: 'preview', stdout: 'ignore', stderr: 'ignore' });
const browser = await chromium.launch();
try {
  await expect(async () =>
    expect((await fetch('http://localhost:5300/changelog')).ok).toBe(true)
  ).toPass({ timeout: 10000 });
  for (const route of ['changelog', 'privacy', 'design']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:5300/${route}`);
    const row = page.locator(
      route === 'design' ? '.header-toc summary' : '.contents-disclosure summary'
    );
    const noun = route === 'changelog' ? 'releases' : 'sections';
    const count = await page
      .locator(route === 'design' ? '.header-toc .toc-row' : '.contents-disclosure .toc-row')
      .count();
    await expect(row).toHaveAccessibleName(`Contents ${count} ${noun} ›`);
    const blob = row.locator('.count-blob');
    await expect(blob).toHaveText(String(count));
    await blob.evaluate((el) => (el.textContent = '999'));
    await expect(row).toHaveAccessibleName(`Contents ${count} ${noun} ›`);
    await expect(row).toContainText(`${count} ${noun}`);
    let rejection;
    try {
      await expect(blob).toHaveText(String(count), { timeout: 300 });
    } catch (error) {
      rejection = error.message;
    }
    expect(rejection).toBeTruthy();
    console.log(
      JSON.stringify({
        route,
        count,
        positive: true,
        wrongVisibleCount: '999',
        accessibleNameStillCorrect: true,
        oldSubstringStillPasses: true,
        newVisibleGuardRejected: true,
        error: rejection.split('\n').slice(0, 9).join('\n'),
      })
    );
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
