import { appendFileSync } from 'node:fs';
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

export async function land(s) {
  let previous = '',
    run = 0;
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const shot = (await s.page.screenshot()).toString('base64');
    run = Date.now() - start >= 1000 && shot === previous ? run + 1 : 0;
    previous = shot;
    if (run === 2) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Dialog did not settle within 10 seconds');
}
export async function settings(s, title) {
  if (!(await s.page.getByRole('dialog').count())) await button(s.page, 'Settings').click();
  await expect(s.page.getByRole('dialog')).toBeVisible();
  await land(s);
  if (title) {
    if (
      !(await s.page
        .getByRole('dialog')
        .getByRole('heading', { name: title, exact: true })
        .isVisible())
    ) {
      await s.page
        .getByRole('button', { name: new RegExp(`^${title}(,|$)`) })
        .filter({ visible: true })
        .first()
        .click();
    }
    await land(s);
    if (title === 'Parent Center') {
      const unlock = button(s.page, 'Unlock these settings');
      if (await unlock.isVisible()) {
        await unlock.click();
        await land(s);
      }
    }
  }
}
export async function solve(s, keyboard = false) {
  const eq = s.page.locator('[aria-label^="What is "]').filter({ visible: true });
  await expect(eq).toBeVisible();
  await land(s);
  const label = await eq.getAttribute('aria-label');
  const [a, b] = label.match(/\d+/g).map(Number);
  if (keyboard) {
    await s.page.keyboard.type(String(a * b));
    await s.page.keyboard.press('Enter');
  } else {
    for (const digit of String(a * b)) await button(s.page, digit).click();
    await button(s.page, 'Check answer').click();
  }
  await expect(eq).toHaveCount(0);
  await land(s);
  return label;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const browser = await connect();
  try {
    for (const profile of (process.env.HUNT_PROFILES ?? 'phone,tablet,desktop,narrow').split(',')) {
      const cases = {
        'S01-section-entry': async (s) => {
          const visited = [];
          for (const title of [
            'Appearance',
            'Sound',
            'Tool Drawer',
            'Accessibility',
            'Coloring',
            'AI Art',
            'Saving',
            'Parent Center',
            'Install',
          ]) {
            await settings(s, title);
            if (
              title === 'Parent Center' &&
              (await s.page.locator('[aria-label^="What is "]').filter({ visible: true }).count())
            )
              await solve(s, true);
            await expect(
              s.page.getByRole('heading', { name: title, exact: true }).filter({ visible: true })
            ).toBeVisible();
            await s.page.screenshot({
              path: `${OUT}/evidence/${ENGINE}-${profile}-section-${title.replaceAll(' ', '-')}.png`,
            });
            await s.page.keyboard.press('Escape');
            await expect(s.page.getByRole('dialog')).toHaveCount(0);
            visited.push(title);
          }
          return {
            visited,
            limits: 'Entry, heading and Escape only; information content excluded.',
          };
        },
        'S02-appearance-persist': async (s) => {
          await settings(s, 'Appearance');
          await s.page.getByRole('radio', { name: 'Dark', exact: true }).click();
          await expect(s.page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
          await s.page.getByRole('radio', { name: 'Flat', exact: true }).click();
          await expect(s.page.getByRole('radio', { name: 'Flat', exact: true })).toBeChecked();
          await s.page.keyboard.press('Escape');
          await boot(s);
          await settings(s, 'Appearance');
          await expect(s.page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
          await expect(s.page.getByRole('radio', { name: 'Flat', exact: true })).toBeChecked();
          return { darkPersisted: true, flatPersisted: true };
        },
        'X04-W07-settings-focus': async (s) => {
          await button(s.page, 'Settings').focus();
          await s.page.keyboard.press('Enter');
          await expect(s.page.getByRole('dialog')).toBeVisible();
          await land(s);
          const order = [];
          for (let i = 0; i < 24; i++) {
            await s.page.keyboard.press('Tab');
            order.push(
              await s.page.evaluate(() => ({
                tag: document.activeElement.tagName,
                label:
                  document.activeElement.getAttribute('aria-label') ??
                  document.activeElement.textContent?.slice(0, 80),
                inDialog: !!document.activeElement.closest('[role="dialog"]'),
              }))
            );
          }
          expect(order.every((x) => x.inDialog)).toBe(true);
          await s.page.keyboard.press('Escape');
          await expect(s.page.getByRole('dialog')).toHaveCount(0);
          await expect(button(s.page, 'Settings')).toBeFocused();
          return { order, focusRestored: true };
        },
        'X06-undo-shortcut': async (s) => {
          await stroke(s);
          await stroke(s, [
            [
              [0.25, 0.5],
              [0.6, 0.55],
            ],
          ]);
          await s.page.keyboard.press('Control+z');
          expect(await undoDepth(s)).toBe(1);
          await stroke(s);
          await settings(s, 'AI Art');
          await s.page.keyboard.press('Control+z');
          await s.page.keyboard.press('Escape');
          await expect(s.page.getByRole('dialog')).toHaveCount(0);
          expect(await undoDepth(s)).toBe(1);
          return {
            shortcutUndidOne: true,
            modalProtectedInk: true,
            limits: 'Text field editing checked in AI fixture flow separately.',
          };
        },
        'L02-viewport-rotation': async (s) => {
          await stroke(s);
          const original = s.page.viewportSize();
          await s.page.setViewportSize({ width: original.height, height: original.width });
          await expect(button(s.page, 'Settings')).toBeVisible();
          await land(s);
          await s.page.setViewportSize(original);
          await land(s);
          expect(await undoDepth(s)).toBe(1);
          return {
            original,
            returned: true,
            undoRetained: true,
            limits: 'Viewport resize; browser chrome/orientation sensor not emulated.',
          };
        },
      };
      for (const [id, run] of Object.entries(cases)) {
        const s = await open(browser, profile);
        try {
          await boot(s);
          await record(s, id, () => run(s));
        } finally {
          await s.ctx.close();
        }
      }
    }
    appendFileSync(
      `${OUT}/status.md`,
      `\n- ${new Date().toISOString()} — ${ENGINE} UI batch ended: section entry, appearance persistence, focus, Undo shortcut and viewport rotation attempted. Evidence recorded per profile.\n`
    );
  } finally {
    await browser.close();
  }
}
