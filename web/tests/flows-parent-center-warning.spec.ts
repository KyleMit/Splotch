import { expect, test } from '@playwright/test';
import { openSettingsModal } from './helpers';
import { openArmedParentCenter, policyPicker } from './flows-harness';

// Settings itself is deliberately reachable without a challenge (ADR-0094), so
// Opening Parent Center set to Never is the choice that leaves every other
// policy on the device editable by whoever is holding it. That one choice is
// confirmed before it persists, and warned about for as long as it holds —
// never forbidden. The rest of Parent Center's behaviour is
// flows-parental-gate.spec.ts.

const UNPROTECTED_CONFIRM = 'dialog.unprotected-confirm';
const UNPROTECTED_CONSEQUENCE = /Anyone using this device can open Parent Center/;

test('cancelling the warning leaves the Parent Center check as it was', async ({ page }) => {
  const settings = await openArmedParentCenter(page);
  const parentCenter = policyPicker(settings, 'Opening Parent Center');

  await parentCenter.getByRole('radio', { name: 'Never' }).click();
  const confirm = page.locator(UNPROTECTED_CONFIRM);
  await expect(confirm.getByText(UNPROTECTED_CONSEQUENCE)).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep the check' }).click();

  await expect(confirm).not.toBeVisible();
  await expect(parentCenter.getByRole('radio', { name: 'Every time' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(settings.locator('.protection-warning')).toHaveCount(0);

  // Nothing was persisted, so the check is still standing after a relaunch.
  await settings.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  const reopened = await openSettingsModal(page);
  await reopened.getByRole('button', { name: 'Parent Center' }).click();
  await expect(page.locator('#parentalGate')).toBeVisible();
});

test('confirming the warning turns the check off and leaves a standing warning', async ({
  page,
}) => {
  const settings = await openArmedParentCenter(page);
  const parentCenter = policyPicker(settings, 'Opening Parent Center');

  await parentCenter.getByRole('radio', { name: 'Never' }).click();
  await page.locator(UNPROTECTED_CONFIRM).getByRole('button', { name: 'Turn it off' }).click();

  await expect(page.locator(UNPROTECTED_CONFIRM)).not.toBeVisible();
  await expect(parentCenter.getByRole('radio', { name: 'Never' })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  // The warning stands beside the policy for as long as the choice holds, and
  // is wired to the picker so a screen reader reads it with the control.
  const warning = settings.locator('.protection-warning');
  await expect(warning.getByText(UNPROTECTED_CONSEQUENCE)).toBeVisible();
  const warningId = await warning.getAttribute('id');
  await expect(parentCenter).toHaveAttribute('aria-describedby', new RegExp(warningId!));
});

test('the standing warning survives a relaunch and asks nothing of the mode it is on', async ({
  page,
}) => {
  const settings = await openArmedParentCenter(page);
  await policyPicker(settings, 'Opening Parent Center')
    .getByRole('radio', { name: 'Never' })
    .click();
  await page.locator(UNPROTECTED_CONFIRM).getByRole('button', { name: 'Turn it off' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  const reopened = await openSettingsModal(page);
  await reopened.getByRole('button', { name: 'Parent Center' }).click();

  await expect(page.locator('#parentalGate')).not.toBeVisible();
  await expect(
    reopened.locator('.protection-warning').getByText(UNPROTECTED_CONSEQUENCE)
  ).toBeVisible();
  // Re-picking the mode it is already on changes nothing, so there is nothing
  // left to confirm.
  await policyPicker(reopened, 'Opening Parent Center')
    .getByRole('radio', { name: 'Never' })
    .click();
  await expect(page.locator(UNPROTECTED_CONFIRM)).not.toBeVisible();
});

test('the other Parent Center modes change without a warning', async ({ page }) => {
  const settings = await openArmedParentCenter(page);
  const parentCenter = policyPicker(settings, 'Opening Parent Center');

  for (const mode of ['Per session', 'Every time']) {
    await parentCenter.getByRole('radio', { name: mode }).click();
    await expect(page.locator(UNPROTECTED_CONFIRM)).not.toBeVisible();
    await expect(parentCenter.getByRole('radio', { name: mode })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  }

  // Every other protection's Never gives up one operation's check, not the
  // editor that owns them all.
  await policyPicker(settings, 'Sending feedback').getByRole('radio', { name: 'Never' }).click();
  await expect(page.locator(UNPROTECTED_CONFIRM)).not.toBeVisible();
});

test('the warning is reachable and dismissable from the keyboard alone', async ({ page }) => {
  const settings = await openArmedParentCenter(page);
  const parentCenter = policyPicker(settings, 'Opening Parent Center');

  // Arrow keys move selection through the group, so Never is two steps from
  // Every time — and the step that lands on it opens the confirmation instead.
  await parentCenter.getByRole('radio', { name: 'Every time' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  const confirm = page.locator(UNPROTECTED_CONFIRM);
  await expect(confirm).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (selector) => document.querySelector(selector)?.contains(document.activeElement) ?? false,
        UNPROTECTED_CONFIRM
      )
    )
    .toBe(true);

  // Esc is the dialog's own way out, and it cancels rather than confirms: the
  // policy is left on the step the arrow keys passed through.
  await page.keyboard.press('Escape');
  await expect(confirm).not.toBeVisible();
  await expect(parentCenter.getByRole('radio', { name: 'Per session' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
});
