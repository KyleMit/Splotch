import { appendFileSync } from 'node:fs';
import { connect, open, boot, button, record, expect, OUT, ENGINE } from './driver.mjs';
import { settings, land, solve } from './ui.mjs';

const browser = await connect();
try {
  const s = await open(browser, 'phone');
  try {
    await boot(s);
    await record(s, 'G02-wrong-answer-lockout', async () => {
      await settings(s, 'Parent Center');
      const group = s.page.getByRole('radiogroup', {
        name: 'Opening Parent Center parental gate frequency',
        exact: true,
      });
      await group.getByRole('radio', { name: 'Every time', exact: true }).click();
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await settings(s, 'Parent Center');
      await land(s);
      const problems = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const eq = s.page.locator('[aria-label^="What is "]').filter({ visible: true });
        const label = await eq.getAttribute('aria-label');
        const [a, b] = label.match(/\d+/g).map(Number);
        problems.push(label);
        await s.page.keyboard.type(String(a * b + 1));
        await expect(button(s.page, 'Check answer')).toBeEnabled();
        await s.page.keyboard.press('Enter');
        if (attempt < 2) await land(s);
      }
      await expect(button(s.page, '1')).toBeDisabled();
      const started = Date.now();
      await s.page.screenshot({ path: `${OUT}/evidence/${ENGINE}-phone-gate-locked.png` });
      await s.page.keyboard.type('123');
      await expect(button(s.page, 'Check answer')).toBeDisabled();
      await expect
        .poll(() => button(s.page, '1').isEnabled(), { timeout: 45000, intervals: [500] })
        .toBe(true);
      const lockedMs = Date.now() - started;
      await solve(s, true);
      await expect(
        s.page.getByRole('heading', { name: 'Parent Center', exact: true })
      ).toBeVisible();
      return {
        wrongAnswers: 3,
        problems,
        lockedMs,
        disabledDuringLockout: true,
        recoveredAndSolved: true,
        limits: 'Real 30s base lockout; subsequent exponential lockouts not exercised.',
      };
    });
  } finally {
    await s.ctx.close();
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} gate lockout case ended: three wrong answers, real-clock disabled-key interval, recovery and keyboard solution attempted.\n`
  );
} finally {
  await browser.close();
}
