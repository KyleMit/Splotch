import { json } from '@sveltejs/kit';
import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '$lib/apiHeaders';
import { isReportingConfigured } from '$lib/server/github';
import { MAX_REPORT_REQUEST_BYTES, submitImageReport } from '$lib/server/imageReport';
import { authorizeImageReport } from '$lib/server/imageReportAuthorization';
import { apiHandler, readBodyWithinLimit } from '$lib/server/http';
import type { RequestHandler } from './$types';

export type ImageReportResponse = { ok: true; reportId: string } | { ok: false; error: string };

export const POST: RequestHandler = apiHandler(async ({ request, getClientAddress }) => {
  if (!isReportingConfigured()) {
    return json(
      {
        ok: false,
        error: 'AI reporting is not available right now. Please try again later.',
      } satisfies ImageReportResponse,
      { status: 503 }
    );
  }

  const authorization = await authorizeImageReport({
    apiKey: request.headers.get(API_KEY_HEADER),
    token: request.headers.get(ACCESS_TOKEN_HEADER),
    installationId: request.headers.get(INSTALLATION_ID_HEADER),
    reportToken: request.headers.get(REPORT_TOKEN_HEADER),
    clientAddress: getClientAddress(),
  });
  if (!authorization.authorized) return authorization.response;

  const body = await readBodyWithinLimit(request, MAX_REPORT_REQUEST_BYTES);
  if (!body.ok) {
    return json(
      { ok: false, error: 'That AI report is too large to send.' } satisfies ImageReportResponse,
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    // Re-parse the bytes already bounded above; `request.formData()` would read
    // the stream a second time and reintroduce the unbounded buffer.
    // Copied into a plain Uint8Array and wrapped as a Blob: the ambient BodyInit
    // union takes no typed array, and Buffer's ArrayBufferLike is not a BlobPart.
    // Bounded by the cap above, so the copy is at most MAX_REPORT_REQUEST_BYTES.
    form = await new Response(new Blob([new Uint8Array(body.bytes)]), {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    return json({ ok: false, error: 'Expected an AI report.' } satisfies ImageReportResponse, {
      status: 400,
    });
  }

  const result = await submitImageReport({
    kind: form.get('kind'),
    drawing: form.get('drawing'),
    output: form.get('output'),
    style: form.get('style'),
  });
  return result.ok
    ? json({ ok: true, reportId: result.reportId } satisfies ImageReportResponse)
    : json({ ok: false, error: result.error } satisfies ImageReportResponse, {
        status: result.status,
      });
});
