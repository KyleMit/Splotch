import { json } from '@sveltejs/kit';
import { ACCESS_TOKEN_HEADER, API_KEY_HEADER } from '$lib/apiHeaders';
import { isReportingConfigured } from '$lib/server/github';
import { submitImageReport } from '$lib/server/imageReport';
import { authorizeImageReport } from '$lib/server/imageReportAuthorization';
import type { RequestHandler } from './$types';

export type ImageReportResponse = { ok: true } | { ok: false; error: string };

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!isReportingConfigured()) {
    return json(
      {
        ok: false,
        error: 'Picture reporting is not available right now. Please try again later.',
      } satisfies ImageReportResponse,
      { status: 503 }
    );
  }

  const authorization = await authorizeImageReport({
    apiKey: request.headers.get(API_KEY_HEADER),
    token: request.headers.get(ACCESS_TOKEN_HEADER),
    clientAddress: getClientAddress(),
  });
  if (!authorization.authorized) return authorization.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'Expected a picture report.' } satisfies ImageReportResponse, {
      status: 400,
    });
  }

  const result = await submitImageReport({
    drawing: form.get('drawing'),
    output: form.get('output'),
    style: form.get('style'),
  });
  return result.ok
    ? json({ ok: true } satisfies ImageReportResponse)
    : json({ ok: false, error: result.error } satisfies ImageReportResponse, {
        status: result.status,
      });
};
