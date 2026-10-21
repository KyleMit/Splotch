import { expect, test } from '../fixtures.ts';
import { MANAGED_ACCESS_CODE } from '../server/serverEnv.ts';
import { openDocument } from '../support/app.ts';

test.describe('the export, hosted as the deploy hosts it', () => {
  test('an unknown path answers 404 with the not-found page', async ({ page }) => {
    const response = await openDocument(page, '/no-such-page');

    expect(response.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'This page wandered off' })).toBeVisible();
  });

  test('a page carries the headers netlify.toml sets', async ({ request }) => {
    const headers = (await request.get('/privacy')).headers();

    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toBe(
      "frame-ancestors 'none'; report-uri /api/csp-report"
    );
  });

  test('a retired path redirects as netlify.toml says', async ({ request }) => {
    const answer = await request.get('/android-beta', { maxRedirects: 0 });

    expect(answer.status()).toBe(308);
    expect(answer.headers().location).toBe('/beta?os=android');
  });

  test('/api reaches the function on the same origin, under the suite env', async ({ request }) => {
    const answer = await request.post('/api/verify-access-code', {
      data: { code: MANAGED_ACCESS_CODE },
    });

    expect(answer.status()).toBe(200);
    expect(await answer.json()).toEqual({ ok: true, accessCode: MANAGED_ACCESS_CODE });
  });
});
