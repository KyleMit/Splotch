// Helpers the group A specs share (ported from web/tests, issue 3154). The suite's common helpers
// are fixtures.ts, support/app.ts and support/drawing.ts; a helper only one spec uses stays in
// that spec.
import { expect, type Locator, type Page } from '@playwright/test';
import { ADMIN_SESSION_KEY } from '../../experiments/native-architecture/src/pageDocument/admin/adminContract.ts';
import { test as base } from '../fixtures.ts';
import { ADMIN_ACCESS_TOKEN } from '../server/serverEnv.ts';

export const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
export const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// React stamps a node with its props once it has hydrated the node, and a prerendered page answers
// no click until then. The pages carry no other signal that their handlers are in.
const REACT_PROPS_KEY_PREFIX = '__reactProps$';

/** Waits until React has taken over the element, so a click on it reaches its handler. */
export async function expectWired(element: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        element.evaluate(
          (node, prefix) => Object.keys(node).some((key) => key.startsWith(prefix)),
          REACT_PROPS_KEY_PREFIX
        ),
      { message: 'React has not hydrated the element' }
    )
    .toBe(true);
}

export type BrushName = 'Pen' | 'Crayon' | 'Magic brush' | 'Eraser';

/** Opens the tool drawer when it is folded; the drawer's own buttons answer once it is open. */
export async function openDrawer(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand controls' });
  if (await expand.isVisible()) await expand.click();
  await expect(page.getByRole('button', { name: 'Collapse controls' })).toBeVisible();
}

/** Picks a brush from the drawer's Brushes menu and waits for the menu to name it pressed. */
export async function chooseBrush(page: Page, brush: BrushName): Promise<void> {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Brushes', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Brush Menu' });
  await menu.getByRole('button', { name: brush, exact: true }).click();
  await expect(menu.getByRole('button', { name: brush, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
}

/** Opens Settings and answers its dialog. */
export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

export const ADMIN_PATH = '/admin';
const ADMIN_LOGIN_PATH = '/api/admin/login';

/** The access codes the suite's server lists: the managed code and nothing else. */
export const ADMIN_CODE_HEADING = /^Access codes/;

export function adminSignInForm(page: Page) {
  return {
    key: page.getByPlaceholder('Admin access key'),
    submit: page.getByRole('button', { name: 'Sign in', exact: true }),
  };
}

type AdminFixtures = { adminPage: Page };
type AdminWorkerFixtures = { adminSession: string };

// The server throttles sign-ins to ten a minute, so a worker signs in once, through the API, and
// every test that needs the console opens it with that session in storage, as a returning owner's
// browser holds it. A spec about signing in goes through the form instead.
export const test = base.extend<AdminFixtures, AdminWorkerFixtures>({
  adminSession: [
    async ({ playwright }, use, workerInfo) => {
      const api = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
      const answer = await api.post(ADMIN_LOGIN_PATH, { data: { key: ADMIN_ACCESS_TOKEN } });
      expect(answer.status(), 'the admin sign-in').toBe(200);
      const { session } = (await answer.json()) as { session: string };
      await api.dispose();
      await use(session);
    },
    { scope: 'worker' },
  ],
  adminPage: async ({ page, adminSession }, use) => {
    await page.addInitScript(
      ([key, session]) => localStorage.setItem(key, session),
      [ADMIN_SESSION_KEY, adminSession]
    );
    await page.goto(ADMIN_PATH);
    await expect(page.getByRole('heading', { name: ADMIN_CODE_HEADING })).toBeVisible();
    await use(page);
  },
});
