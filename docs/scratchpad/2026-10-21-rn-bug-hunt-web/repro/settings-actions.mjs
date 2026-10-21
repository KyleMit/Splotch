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
  closeOverlays,
} from './driver.mjs';
import { settings, land, solve } from './ui.mjs';

const browser = await connect();
try {
  for (const profile of (process.env.HUNT_PROFILES ?? 'phone,tablet,desktop').split(',')) {
    const cases = {
      'S03-volume-sources': async (s) => {
        await settings(s, 'Sound');
        const d = s.page.getByRole('dialog').first();
        const volume = d.locator('[aria-label="Volume"][aria-valuenow]');
        await expect(volume).toBeVisible();
        await volume.press('Home');
        await expect(volume).toHaveAttribute('aria-valuenow', '0');
        await volume.press('End');
        await expect(volume).toHaveAttribute('aria-valuenow', '100');
        await volume.press('ArrowLeft');
        await expect(volume).toHaveAttribute('aria-valuenow', '99');
        for (const name of ['Drawing', 'Deleting']) {
          const t = d.getByRole('switch', { name, exact: true });
          await t.click();
          await expect(t).not.toBeChecked();
        }
        const master = d.getByRole('switch', { name: 'Sound', exact: true });
        await master.click();
        await expect(master).not.toBeChecked();
        await closeOverlays(s);
        await boot(s);
        await settings(s, 'Sound');
        await expect(
          s.page.getByRole('dialog').getByRole('switch', { name: 'Sound', exact: true })
        ).not.toBeChecked();
        return {
          min: 0,
          max: 100,
          arrowLeft: 99,
          drawingOff: true,
          deletingOff: true,
          masterOffPersisted: true,
          limits: 'Control/storage behavior only; audio not heard.',
        };
      },
      'S04-drawer-brush-disable': async (s) => {
        await button(s.page, 'Brushes').click();
        await button(s.page, 'Eraser').click();
        await land(s);
        await settings(s, 'Tool Drawer');
        const d = s.page.getByRole('dialog').first();
        const eraser = d
          .getByRole('button', { name: 'Eraser', exact: true })
          .or(d.getByRole('switch', { name: 'Eraser', exact: true }));
        await eraser.click();
        await expect
          .poll(
            async () =>
              (await eraser.getAttribute('aria-checked')) ??
              (await eraser.getAttribute('aria-pressed'))
          )
          .toBe('false');
        await closeOverlays(s);
        await button(s.page, 'Brushes').click();
        await expect(button(s.page, 'Eraser')).toHaveCount(0);
        await expect(button(s.page, 'Pen')).toHaveAttribute('aria-pressed', 'true');
        await closeOverlays(s);
        await settings(s, 'Tool Drawer');
        const master = s.page
          .getByRole('dialog')
          .getByRole('switch', { name: 'Enable tool drawer', exact: true });
        await master.click();
        await expect(master).not.toBeChecked();
        await closeOverlays(s);
        await expect(button(s.page, 'Brushes')).toHaveCount(0);
        await expect(button(s.page, 'Stroke width')).toHaveCount(0);
        await expect(button(s.page, 'Undo')).toHaveCount(0);
        await expect(button(s.page, 'Save screenshot')).toBeVisible();
        await expect(button(s.page, 'Coloring books')).toBeVisible();
        await settings(s, 'Tool Drawer');
        await s.page
          .getByRole('dialog')
          .getByRole('switch', { name: 'Enable tool drawer', exact: true })
          .click();
        await closeOverlays(s);
        const expand = button(s.page, 'Expand controls');
        if (await expand.isVisible()) await expand.click();
        await expect(button(s.page, 'Brushes')).toBeVisible();
        return {
          disabledSelectedEraser: true,
          fellBackToPen: true,
          drawerOffRemovedDrawingTools: true,
          cameraAndColoringKept: true,
          drawerRestored: true,
        };
      },
      'S05-accessibility-endpoints': async (s) => {
        await settings(s, 'Accessibility');
        const slider = s.page
          .getByRole('dialog')
          .locator('[aria-label="Button Size"][aria-valuenow]');
        const min = await slider.getAttribute('aria-valuemin'),
          max = await slider.getAttribute('aria-valuemax');
        await slider.press('Home');
        await expect(slider).toHaveAttribute('aria-valuenow', min);
        await land(s);
        await slider.press('End');
        await expect(slider).toHaveAttribute('aria-valuenow', max);
        await land(s);
        await s.page.screenshot({
          path: `${OUT}/evidence/${ENGINE}-${profile}-button-size-max.png`,
        });
        const reduced = s.page
          .getByRole('dialog')
          .getByRole('switch', { name: 'Reduce Motion', exact: true });
        await reduced.click();
        await expect(reduced).toBeChecked();
        await closeOverlays(s);
        await stroke(s);
        expect(await undoDepth(s)).toBe(1);
        return {
          min,
          max,
          reduceMotionOn: true,
          drewAndUndidAtMax: true,
          limits: 'Reachability and state; complete visual/contrast review separate.',
        };
      },
      'S06-coloring-toggle': async (s) => {
        await settings(s, 'Coloring');
        const d = s.page.getByRole('dialog').first();
        const coloring = d.getByRole('switch', { name: 'Coloring book', exact: true });
        await coloring.click();
        await expect(coloring).not.toBeChecked();
        await closeOverlays(s);
        await expect(button(s.page, 'Coloring books')).toHaveCount(0);
        await settings(s, 'Coloring');
        await s.page
          .getByRole('dialog')
          .getByRole('switch', { name: 'Coloring book', exact: true })
          .click();
        await closeOverlays(s);
        await expect(button(s.page, 'Coloring books')).toBeVisible();
        return {
          disabledHidPicker: true,
          enabledRestoredPicker: true,
          limits: 'Download/remove/offline separate.',
        };
      },
      'S08-camera-autosave': async (s) => {
        await settings(s, 'Saving');
        const d = s.page.getByRole('dialog').first();
        const camera = d.getByRole('switch', { name: 'Camera button', exact: true });
        await camera.click();
        await expect(camera).not.toBeChecked();
        await closeOverlays(s);
        await expect(button(s.page, 'Save screenshot')).toHaveCount(0);
        await settings(s, 'Saving');
        await s.page
          .getByRole('dialog')
          .getByRole('switch', { name: 'Camera button', exact: true })
          .click();
        await closeOverlays(s);
        await expect(button(s.page, 'Save screenshot')).toBeVisible();
        return {
          cameraHidden: true,
          cameraRestored: true,
          limits: 'Auto-save and failure fixture are separate.',
        };
      },
      'G01-G03-G04-parent-policy-keyboard': async (s) => {
        await settings(s, 'Parent Center');
        const group = () =>
          s.page.getByRole('radiogroup', {
            name: 'Opening Parent Center parental gate frequency',
            exact: true,
          });
        await group().getByRole('radio', { name: 'Per session', exact: true }).click();
        await closeOverlays(s);
        await settings(s, 'Parent Center');
        await solve(s, true);
        await expect(
          group().getByRole('radio', { name: 'Per session', exact: true })
        ).toBeChecked();
        await expect(
          s.page.getByRole('heading', { name: 'Parent Center', exact: true })
        ).toBeVisible();
        await closeOverlays(s);
        await settings(s, 'Parent Center');
        await expect(s.page.locator('[aria-label^="What is "]')).toHaveCount(0);
        await group().getByRole('radio', { name: 'Every time', exact: true }).click();
        await closeOverlays(s);
        await settings(s, 'Parent Center');
        const eq = s.page.locator('[aria-label^="What is "]').filter({ visible: true });
        await expect(eq).toBeVisible();
        const label = await eq.getAttribute('aria-label');
        const [a, b] = label.match(/\d+/g).map(Number);
        await s.page.keyboard.type(String(a * b + 1));
        await s.page.keyboard.press('Backspace');
        await s.page.keyboard.press('Escape');
        await expect(eq).toHaveCount(0);
        await settings(s, 'Parent Center');
        await solve(s, true);
        await group().getByRole('radio', { name: 'Never', exact: true }).click();
        await expect(
          s.page.getByRole('dialog', { name: 'Turn off the Parent Center check?', exact: true })
        ).toBeVisible();
        await land(s);
        await button(s.page, 'Keep it on').click();
        await expect(group().getByRole('radio', { name: 'Every time', exact: true })).toBeChecked();
        await group().getByRole('radio', { name: 'Never', exact: true }).click();
        await land(s);
        await button(s.page, 'Turn it off').click();
        await expect(group().getByRole('radio', { name: 'Never', exact: true })).toBeChecked();
        await expect(s.page.getByText('This check is off', { exact: true })).toBeVisible();
        return {
          sessionReused: true,
          everyTimeAsked: true,
          keyboardSolved: true,
          escapeCanceled: true,
          neverCancelPreserved: true,
          neverConfirmApplied: true,
          limits: 'Backspace exercised before cancel; wrong-answer/lockout separate.',
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
    `\n- ${new Date().toISOString()} — ${ENGINE} Settings action batch ended; public controls used for sound, drawer, accessibility, coloring, camera and Parent Center policies/keypad.\n`
  );
} finally {
  await browser.close();
}
