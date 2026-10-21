import type { Page, Request } from '@playwright/test';
import { expect } from '../fixtures.ts';
import { ADMIN_ACCESS_TOKEN, MANAGED_ACCESS_CODE } from '../server/serverEnv.ts';
import { ADMIN_CODE_HEADING, adminSignInForm, test } from '../support/group-a.ts';

const TOKENS_PATH = '/api/admin/tokens';
// The console shows "Copied!" for this long after a copy, and the steps below straddle it: each is
// shorter than the window, and together they outlast the first copy's timer.
const COPY_REPEAT_STEP_MS = 1000;
const CLOCK_PAUSE_LEAD_MS = 1000;
const TOUCH_TARGET_MIN_PX = 44;
const COMPACT_ROW_MAX_PX = 120;
const LEDGER_WIDTHS = [1280, 830, 561, 390, 320] as const;
const COPY_LABELS = {
  code: { idle: `Copy ${MANAGED_ACCESS_CODE}`, copied: `Copied ${MANAGED_ACCESS_CODE}` },
  link: {
    idle: `Copy link for ${MANAGED_ACCESS_CODE}`,
    copied: `Copied link for ${MANAGED_ACCESS_CODE}`,
  },
};

function codeRow(page: Page) {
  return page.getByRole('row').filter({
    has: page.getByRole('button', { name: `Remove ${MANAGED_ACCESS_CODE}`, exact: true }),
  });
}

// A write that resolves at once, so the copy's continuation has run before the next step.
async function stubClipboard(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const writes: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          writes.push(text);
          return Promise.resolve();
        },
      },
    });
    Object.assign(window, { clipboardWrites: writes });
  });
  return () =>
    page.evaluate(() => (window as Window & { clipboardWrites?: string[] }).clipboardWrites ?? []);
}

async function signInThroughTheForm(page: Page) {
  const form = adminSignInForm(page);
  await form.key.fill(ADMIN_ACCESS_TOKEN);
  await form.submit.click();
  await expect(page.getByRole('heading', { name: ADMIN_CODE_HEADING })).toBeVisible();
}

test.describe('the admin console', () => {
  test('keeps its rows inside the ledger, with every action at the touch floor, at every width', async ({
    adminPage: page,
  }) => {
    const row = codeRow(page);
    for (const width of LEDGER_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(row).toBeVisible();
      const [box, remove] = await Promise.all([
        row.boundingBox(),
        row
          .getByRole('button', { name: `Remove ${MANAGED_ACCESS_CODE}`, exact: true })
          .boundingBox(),
      ]);

      expect(remove?.height, `Remove at ${width}px`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX);
      expect((remove?.x ?? 0) + (remove?.width ?? 0), `Remove at ${width}px`).toBeLessThanOrEqual(
        (box?.x ?? 0) + (box?.width ?? 0)
      );
      expect(box?.height, `the row at ${width}px`).toBeLessThan(COMPACT_ROW_MAX_PX);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `the page at ${width}px`
      ).toBe(width);
      for (const button of await row.getByRole('button').all()) {
        const size = await button.boundingBox();
        expect(size?.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX);
      }
    }
  });

  test('names each copy button for its code and announces the copy', async ({
    adminPage: page,
  }) => {
    await stubClipboard(page);
    const row = codeRow(page);

    await row.getByRole('button', { name: COPY_LABELS.code.idle, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: COPY_LABELS.code.copied })).toHaveText(
      COPY_LABELS.code.copied
    );
    await expect(
      row.getByRole('button', { name: COPY_LABELS.code.copied, exact: true })
    ).toHaveText('Copied!');

    await row.getByRole('button', { name: COPY_LABELS.link.idle, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: COPY_LABELS.link.copied })).toHaveText(
      COPY_LABELS.link.copied
    );
  });

  test('restarts a copy’s Copied window when the same cell is copied again', async ({
    adminPage: page,
  }) => {
    const clipboardWrites = await stubClipboard(page);
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + CLOCK_PAUSE_LEAD_MS);
    const copy = codeRow(page).getByRole('button', {
      name: new RegExp(`^Cop(y|ied) ${MANAGED_ACCESS_CODE}$`),
    });
    await expect(copy).toHaveText('Copy');

    await copy.click();
    await expect(copy).toHaveText('Copied!');
    await page.clock.runFor(COPY_REPEAT_STEP_MS);
    await copy.click();
    await expect.poll(async () => (await clipboardWrites()).length).toBe(2);
    await page.clock.runFor(COPY_REPEAT_STEP_MS);

    await expect(copy).toHaveText('Copied!');
  });

  test('asks before removing a code, and sends nothing when the question is refused', async ({
    adminPage: page,
  }) => {
    const removals: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'DELETE' && new URL(request.url()).pathname === TOKENS_PATH)
        removals.push(request);
    });
    const remove = codeRow(page).getByRole('button', {
      name: `Remove ${MANAGED_ACCESS_CODE}`,
      exact: true,
    });

    const refused = page.waitForEvent('dialog');
    const refusedClick = remove.click();
    const question = await refused;
    expect(question.type()).toBe('confirm');
    expect(question.message()).toBe(
      `Remove ${MANAGED_ACCESS_CODE}? Anyone using this code loses AI access.`
    );
    await question.dismiss();
    await refusedClick;
    await expect(codeRow(page)).toBeVisible();
    expect(removals).toHaveLength(0);

    const accepted = page.waitForEvent('dialog');
    const acceptedClick = remove.click();
    await (await accepted).accept();
    await acceptedClick;
    await expect.poll(() => removals.length).toBe(1);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Token storage is unavailable' })
    ).toBeVisible();
    await expect(codeRow(page)).toBeVisible();
  });

  test('says so when a change cannot reach the server', async ({ adminPage: page }) => {
    await page.route(
      (url) => url.pathname === TOKENS_PATH,
      (route) => (route.request().method() === 'POST' ? route.abort() : route.continue())
    );
    await page.getByPlaceholder('Add a code…').fill(`e2e-offline-${Date.now()}`);
    await page.getByRole('button', { name: 'Add code' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toBeVisible();
  });

  test('forgets an unsent code when its owner signs out', async ({ adminPage: page }) => {
    const draft = page.getByPlaceholder('Add a code…');
    await draft.fill('e2e-unsent-draft');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await signInThroughTheForm(page);
    await expect(draft).toHaveValue('');
  });

  test('keeps a copy left pending at sign-out from marking the next session copied', async ({
    adminPage: page,
  }) => {
    await page.evaluate(() => {
      let releaseClipboard!: () => void;
      const pendingWrite = new Promise<void>((resolve) => {
        releaseClipboard = resolve;
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => pendingWrite },
      });
      Object.assign(window, { releaseClipboard });
    });
    await codeRow(page).getByRole('button', { name: COPY_LABELS.code.idle, exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await signInThroughTheForm(page);

    // Read inside the page right after the write's continuation has run: the defect shows "Copied!"
    // for 1.5 seconds only, so a retrying assertion would wait it out and pass against the bug.
    const labelAfterRelease = await page.evaluate(async (label) => {
      (window as Window & { releaseClipboard?: () => void }).releaseClipboard?.();
      await new Promise((settle) => setTimeout(settle, 0));
      return document.querySelector(`[aria-label$="${label}"]`)?.textContent?.trim();
    }, MANAGED_ACCESS_CODE);
    expect(labelAfterRelease).toBe('Copy');
  });
});
