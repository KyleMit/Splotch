import type { Page, Request, Route } from '@playwright/test';
import sharp from 'sharp';
import { MANAGED_ACCESS_CODE } from '../server/serverEnv.ts';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import {
  closeDialog,
  gateCard,
  goToSettingsSection,
  openDrawer,
  openSettings,
  setGatePolicies,
  solveGate,
} from '../support/group-b.ts';

// Generation answers are stubbed at the network: the suite's server cannot authenticate with a
// model provider, and a spec must pick whether a picture arrives, fails or is refused.
test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

const INVITE_PATH = `/?ai_access_token=${MANAGED_ACCESS_CODE}`;
const STYLE = 'Magical';
const FREE_PICTURES_LEFT = 7;
const FREE_PICTURES_LIMIT = 10;
const PICTURE_SIDE_PX = 64;
const PICTURE_BACKGROUND = '#ff9900';
const PROVIDER_REFUSED = 422;
const PROVIDER_FAILED = 502;
// What a refusal carries so the child's original can be reported; any printable token will do.
const REFUSAL_REPORT_TOKEN = 'test-refusal-report-token';
// How long a request that should never be sent gets to show up. It only has to outlast the work a
// fresh page does as it settles, so a slower worker lengthens it without changing the verdict.
const LATE_REQUEST_WINDOW_MS = 750;

let picture: Buffer;
test.beforeAll(async () => {
  picture = await sharp({
    create: {
      width: PICTURE_SIDE_PX,
      height: PICTURE_SIDE_PX,
      channels: 3,
      background: PICTURE_BACKGROUND,
    },
  })
    .webp()
    .toBuffer();
});

// Holds every generation request at the network until the spec answers it, in order. An answer is
// reported done only once Playwright has delivered it, so the page has it before the spec moves on.
async function holdGenerations(page: Page) {
  const requests: Request[] = [];
  const waiting: Route[] = [];
  await page.route(/\/api\/generate-image(\?|$)/, async (route) => {
    requests.push(route.request());
    waiting.push(route);
  });
  const oldest = () => {
    const route = waiting.shift();
    if (!route) throw new Error('No generation request is waiting for an answer');
    return route;
  };
  return {
    requests,
    async succeed() {
      await oldest().fulfill({ status: 200, contentType: 'image/webp', body: picture });
    },
    async fail(status: number) {
      await oldest().fulfill({
        status,
        contentType: 'application/json',
        headers: { 'X-Report-Token': REFUSAL_REPORT_TOKEN },
        body: JSON.stringify({ ok: false, error: 'The provider said no' }),
      });
    },
  };
}

// Opens the invite link, which saves the access code, then turns AI Art on in Settings.
async function openWithAiOn(page: Page) {
  await page.goto(INVITE_PATH);
  await waitForDrawingScreen(page);
  const settings = await openSettings(page);
  await goToSettingsSection(settings, 'AI Art');
  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  await expect(settings.getByRole('textbox', { name: 'Saved access code' })).toHaveValue(
    MANAGED_ACCESS_CODE
  );
  await closeDialog(settings);
}

// Answers the free allowance's status request, which the app makes once AI is on and nothing else
// supplies a credential. `reply` sees how many requests there have been, counting this one.
async function answerAllowance(
  page: Page,
  reply: (request: number) => { status: number; body: object }
) {
  const requests: Request[] = [];
  await page.route('**/api/free-generation-grant', async (route) => {
    requests.push(route.request());
    const { status, body } = reply(requests.length);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

async function turnOnAiWithNoCredential(page: Page) {
  const settings = await openSettings(page);
  await goToSettingsSection(settings, 'AI Art');
  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  await expect(settings.getByRole('switch', { name: 'Create AI Images' })).toBeChecked();
  await closeDialog(settings);
}

function aiButton(page: Page) {
  return page.getByRole('button', { name: /^Create AI image/ });
}

async function chooseStyle(page: Page) {
  const prompt = page.getByRole('dialog', { name: 'Pick a style' });
  await prompt.getByRole('button', { name: STYLE, exact: true }).click();
}

test.describe('AI pictures', () => {
  test('a fresh installation shows no AI button and asks for no allowance', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const allowanceRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/free-generation-grant'))
        allowanceRequests.push(request.url());
    });

    await openDrawer(page);
    await page.waitForTimeout(LATE_REQUEST_WINDOW_MS);

    await expect(aiButton(page)).toHaveCount(0);
    expect(allowanceRequests).toEqual([]);
  });

  test('an access-code invite saves the code without turning AI on', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await page.goto(INVITE_PATH);
    await waitForDrawingScreen(page);
    await expect.poll(() => page.url()).not.toContain('ai_access_token');
    await openDrawer(page);
    await expect(aiButton(page)).toHaveCount(0);

    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'AI Art');
    const toggle = settings.getByRole('switch', { name: 'Create AI Images' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();

    await expect(toggle).toBeChecked();
    await expect(settings.getByRole('textbox', { name: 'Saved access code' })).toHaveValue(
      MANAGED_ACCESS_CODE
    );
  });

  test('the AI button sends the drawing and shows the picture it gets back', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const generations = await holdGenerations(page);
    await openWithAiOn(page);
    await drawingScreen.drawStroke();
    await openDrawer(page);

    await aiButton(page).click();
    await chooseStyle(page);
    await expect.poll(() => generations.requests.length).toBe(1);

    const [request] = generations.requests;
    expect(request.method()).toBe('POST');
    expect(new URL(request.url()).searchParams.get('style')).toBe(STYLE);
    expect(request.headers()['content-type']).toBe('image/webp');
    expect(request.headers()['x-access-token']).toBe(MANAGED_ACCESS_CODE);
    expect(request.postDataBuffer()?.length ?? 0).toBeGreaterThan(0);

    await generations.succeed();
    const result = page.getByRole('dialog', { name: 'AI Result' });
    await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeVisible();
    const download = page.waitForEvent('download');
    await result.getByRole('button', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/^splotch-ai-.+\.webp$/);
  });

  test('with style choice switched off the button generates at once', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const generations = await holdGenerations(page);
    await openWithAiOn(page);
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'AI Art');
    await settings.getByRole('switch', { name: 'Customize AI Style' }).click();
    await closeDialog(settings);
    await drawingScreen.drawStroke();
    await openDrawer(page);

    await aiButton(page).click();

    await expect.poll(() => generations.requests.length).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Pick a style' })).toHaveCount(0);
    await generations.succeed();
    await expect(
      page.getByRole('dialog', { name: 'AI Result' }).getByRole('img', { name: 'Your AI picture' })
    ).toBeVisible();
  });

  test('a stalled picture lets the child keep drawing, and a failed one can be tried again', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const generations = await holdGenerations(page);
    await openWithAiOn(page);
    await drawingScreen.drawStroke();
    await openDrawer(page);
    await aiButton(page).click();
    await chooseStyle(page);
    await expect.poll(() => generations.requests.length).toBe(1);

    await page.getByRole('button', { name: 'Keep drawing while this is made' }).click();
    await expect(
      page.getByRole('button', { name: 'Your picture is being made — tap to watch' })
    ).toBeVisible();
    await drawingScreen.drawStroke();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();

    await generations.fail(PROVIDER_FAILED);
    await page.getByRole('button', { name: "That didn't work — tap to see" }).click();
    const result = page.getByRole('dialog', { name: 'AI Result' });
    await expect(result.getByRole('heading', { name: /didn't work/i })).toBeVisible();
    await closeDialog(result);

    await expect(aiButton(page)).toBeEnabled();
    await aiButton(page).click();
    await chooseStyle(page);
    await expect.poll(() => generations.requests.length).toBe(2);
    await generations.succeed();
    await expect(
      page.getByRole('dialog', { name: 'AI Result' }).getByRole('img', { name: 'Your AI picture' })
    ).toBeVisible();
  });
});

test.describe('the free allowance', () => {
  test('names the pictures left, and sends the installation instead of a code', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const allowance = await answerAllowance(page, () => ({
      status: 200,
      body: { ok: true, remaining: FREE_PICTURES_LEFT, limit: FREE_PICTURES_LIMIT },
    }));
    const generations = await holdGenerations(page);
    await turnOnAiWithNoCredential(page);
    await drawingScreen.drawStroke();
    await openDrawer(page);
    await expect(
      page.getByRole('button', { name: `Create AI image, ${FREE_PICTURES_LEFT} free left` })
    ).toBeVisible();
    expect(allowance[0].headers()['x-installation-id']).toMatch(/^[0-9a-f]{64}$/);

    await aiButton(page)
      .or(page.getByRole('button', { name: /^Create AI image/ }))
      .click();
    await chooseStyle(page);
    await expect.poll(() => generations.requests.length).toBe(1);

    const [request] = generations.requests;
    expect(request.headers()['x-installation-id']).toBe(
      allowance[0].headers()['x-installation-id']
    );
    expect(request.headers()['x-access-token']).toBeUndefined();
    await generations.succeed();
    await expect(
      page.getByRole('dialog', { name: 'AI Result' }).getByRole('img', { name: 'Your AI picture' })
    ).toBeVisible();
  });

  test('an exhausted allowance keeps the button and points it at setting up a key', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await answerAllowance(page, () => ({
      status: 200,
      body: { ok: true, remaining: 0, limit: FREE_PICTURES_LIMIT },
    }));
    await turnOnAiWithNoCredential(page);
    await drawingScreen.drawStroke();
    await openDrawer(page);

    await page.getByRole('button', { name: 'Set up AI image', exact: true }).click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByText('Your 10 free AI creations are used up.')).toBeVisible();
    await expect(settings.getByPlaceholder('Paste your OpenAI API key')).toBeVisible();
  });
});

test.describe('AI pictures behind the Grown-Ups Only check', () => {
  test('the AI button asks first, and a solve opens the style prompt', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openWithAiOn(page);
    await setGatePolicies(page, 'Every time', ['Generating an AI image']);
    await drawingScreen.drawStroke();
    await openDrawer(page);

    await aiButton(page).click();
    await expect(gateCard(page)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Pick a style' })).toHaveCount(0);
    await solveGate(page);

    await expect(page.getByRole('dialog', { name: 'Pick a style' })).toBeVisible();
  });

  test('reporting a picture waits for its own check, then confirms and sends', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const generations = await holdGenerations(page);
    const reports: string[] = [];
    await page.route('**/api/report-image', async (route) => {
      reports.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reportId: 'test-report-id' }),
      });
    });
    await openWithAiOn(page);
    await setGatePolicies(page, 'Every time', ['Reporting an AI result']);
    await drawingScreen.drawStroke();
    await openDrawer(page);
    await aiButton(page).click();
    await chooseStyle(page);
    await expect.poll(() => generations.requests.length).toBe(1);
    await generations.succeed();
    const result = page.getByRole('dialog', { name: 'AI Result' });
    await result.getByRole('button', { name: 'Report this picture' }).click();

    await expect(gateCard(page)).toBeVisible();
    expect(reports).toEqual([]);
    await solveGate(page);
    const confirm = page.getByRole('dialog', { name: /Report/ }).filter({ hasText: 'Send report' });
    await expect(confirm).toBeVisible();
    expect(reports).toEqual([]);
    await confirm.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(/test-report-id/)).toBeVisible();
    expect(reports).toEqual(['POST']);
  });

  test('reporting a refusal uses the same check before it confirms', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const generations = await holdGenerations(page);
    const reports: string[] = [];
    await page.route('**/api/report-image', async (route) => {
      reports.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reportId: 'refusal-report-id' }),
      });
    });
    await openWithAiOn(page);
    await setGatePolicies(page, 'Every time', ['Reporting an AI result']);
    await drawingScreen.drawStroke();
    await openDrawer(page);
    await aiButton(page).click();
    await chooseStyle(page);
    await expect.poll(() => generations.requests.length).toBe(1);
    await generations.fail(PROVIDER_REFUSED);
    const result = page.getByRole('dialog', { name: 'AI Result' });
    await result.getByRole('button', { name: 'Report this refusal' }).click();

    await expect(gateCard(page)).toBeVisible();
    expect(reports).toEqual([]);
    await solveGate(page);
    const confirm = page.getByRole('dialog', { name: /Report/ }).filter({ hasText: 'Send report' });
    await confirm.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(/refusal-report-id/)).toBeVisible();
    expect(reports).toEqual(['POST']);
  });
});
