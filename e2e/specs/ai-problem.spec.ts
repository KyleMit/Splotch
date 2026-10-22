import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures.ts';
import {
  enableAi,
  openAiResult,
  setGateFrequency,
  solveParentalGate,
  startAiGeneration,
  stubAiEndpoint,
  test,
} from '../support/group-a.ts';

const REPORT_ROUTE = '**/api/report';
const SERVICE_UNAVAILABLE_STATUS = 503;
// The preview's closing line says what is withheld; it is not part of the report's message.
const NOT_SENT_PREFIX = 'Not sent:';

function problemDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Report this problem', exact: true });
}

// The failed generation's "Report a problem" path: a preview of exactly what goes to the support
// tracker, the grown-up check in front of it when Parent Center asks for one, and the send.
test.describe('reporting a problem with an AI picture', () => {
  test('after a second failure says it is still not working and offers the report', async ({
    drawingScreen,
  }) => {
    const { result, endpoint } = await openAiResult(drawingScreen);
    await endpoint.fail();
    await result.getByRole('button', { name: 'Try again' }).click();
    await endpoint.requestSeen(2);
    await endpoint.fail();

    await expect(result.getByRole('heading', { name: 'Still not working' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'Try again' })).toBeHidden();
    await result.getByRole('button', { name: 'Report a problem' }).click();
    await expect(problemDialog(drawingScreen.page)).toContainText('Attempts: 2 in a row');
  });

  for (const device of [false, true]) {
    test(`sends only the previewed diagnostics, with device info ${device ? 'included' : 'left out'}`, async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      const { result, endpoint } = await openAiResult(drawingScreen);
      await endpoint.fail(SERVICE_UNAVAILABLE_STATUS);
      await result.getByRole('button', { name: 'Report a problem' }).click();
      const confirm = problemDialog(page);
      const diagnostics = confirm
        .getByRole('region', { name: 'What will be sent' })
        .getByRole('paragraph');
      await expect(diagnostics.first()).toBeVisible();
      const previewed = (await diagnostics.allTextContents())
        .map((line) => line.trim())
        .filter((line) => !line.startsWith(NOT_SENT_PREFIX));
      await confirm.getByRole('checkbox', { name: /^Include device info/ }).setChecked(device);
      const request = page.waitForRequest(REPORT_ROUTE);
      await page.route(REPORT_ROUTE, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      );

      await confirm.getByRole('button', { name: 'Send report' }).click();

      const sent = await request;
      const payload = sent.postDataJSON();
      expect(Object.keys(payload).sort()).toEqual(
        device ? ['device', 'kind', 'message'] : ['kind', 'message']
      );
      expect(payload.kind).toBe('bug');
      expect(payload.message.split('\n')).toEqual(previewed);
      expect(sent.headers()['x-access-token']).toBeUndefined();
      expect(sent.headers()['x-report-token']).toBeUndefined();
      await expect(
        page.getByText('Thanks. Your problem report was sent to our private support tracker.')
      ).toBeVisible();
    });
  }

  test('asks for the grown-up check before showing or sending anything, when Parent Center says to', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const endpoint = await stubAiEndpoint(page);
    await enableAi(drawingScreen);
    await setGateFrequency(page, 'Reporting an AI result', 'Every time');
    const { result } = await startAiGeneration(drawingScreen);
    await endpoint.fail();

    await result.getByRole('button', { name: 'Report a problem' }).click();

    await expect(page.getByRole('dialog', { name: 'Grown-Ups Only', exact: true })).toBeVisible();
    await expect(problemDialog(page)).toBeHidden();
    await solveParentalGate(page);
    await expect(problemDialog(page)).toContainText('What will be sent');
  });

  test('that is rejected offers another confirmation, and the picture can still be retried', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.route(REPORT_ROUTE, (route) =>
      route.fulfill({
        status: SERVICE_UNAVAILABLE_STATUS,
        contentType: 'application/json',
        body: '{"ok":false,"error":"Reporting unavailable"}',
      })
    );
    const { result, endpoint } = await openAiResult(drawingScreen);
    await endpoint.fail();
    await result.getByRole('button', { name: 'Report a problem' }).click();
    await problemDialog(page).getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByRole('alert')).toHaveText('Could not send your problem report.');
    await expect(result.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry report' }).click();
    await expect(problemDialog(page)).toBeVisible();
    await problemDialog(page).getByRole('button', { name: 'Cancel' }).click();

    await result.getByRole('button', { name: 'Try again', exact: true }).click();
    await endpoint.succeed();
    await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeVisible();
  });
});
