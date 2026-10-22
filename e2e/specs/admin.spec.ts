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

// What is wrong with the ledger's row at a window width: its actions at the touch floor, inside the
// row, the row compact, and the page not scrolling sideways. Empty when nothing is.
async function ledgerProblems(page: Page, width: number): Promise<string[]> {
  const row = codeRow(page);
  const box = await row.boundingBox();
  const buttons = await row.getByRole('button').all();
  const boxes = await Promise.all(buttons.map((button) => button.boundingBox()));
  const problems: string[] = [];
  if (!box) return [`the row is not laid out at ${width}px`];
  if (box.height >= COMPACT_ROW_MAX_PX) problems.push(`the row is ${box.height}px tall`);
  for (const action of boxes) {
    if (!action) problems.push('an action is not laid out');
    else if (action.height < TOUCH_TARGET_MIN_PX)
      problems.push(`an action is ${action.height}px tall`);
    else if (action.x + action.width > box.x + box.width) problems.push('an action leaves the row');
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth !== width) problems.push(`the page is ${scrollWidth}px wide`);
  return problems;
}

test.describe('the admin console', () => {
  test('keeps its rows inside the ledger, with every action at the touch floor, at every width', async ({
    adminPage: page,
  }) => {
    for (const width of LEDGER_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(codeRow(page)).toBeVisible();

      await expect
        .poll(() => ledgerProblems(page, width), { message: `at ${width}px` })
        .toEqual([]);
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
