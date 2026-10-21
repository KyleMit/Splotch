import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '../../apiHeaders';
import { IMAGE_REPORT_FORM_FIELDS } from '../../imageReport';
import { isReportingConfigured } from '../github';
import { MAX_REPORT_REQUEST_BYTES, submitImageReport } from '../imageReport';
import { authorizeImageReport } from '../imageReportAuthorization';
import { AI_REPORTING_UNAVAILABLE_MESSAGE } from '../imageReportUnavailable';
import { apiHandler, json, readFormBody } from '../http';
import type { ApiHandler } from './apiEvent';

export type ImageReportResponse = { ok: true; reportId: string } | { ok: false; error: string };

export const POST: ApiHandler = apiHandler(async ({ request, getClientAddress }) => {
  if (!isReportingConfigured()) {
    return json(
      { ok: false, error: AI_REPORTING_UNAVAILABLE_MESSAGE } satisfies ImageReportResponse,
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

  const body = await readFormBody(request, MAX_REPORT_REQUEST_BYTES);
  if (!body.ok) {
    const tooLarge = body.reason === 'too-large';
    const error = tooLarge ? 'That AI report is too large to send.' : 'Expected an AI report.';
    return json({ ok: false, error } satisfies ImageReportResponse, {
      status: tooLarge ? 413 : 400,
    });
  }

  const { form } = body;
  const result = await submitImageReport({
    kind: form.get(IMAGE_REPORT_FORM_FIELDS.kind),
    drawing: form.get(IMAGE_REPORT_FORM_FIELDS.drawing),
    output: form.get(IMAGE_REPORT_FORM_FIELDS.output),
    style: form.get(IMAGE_REPORT_FORM_FIELDS.style),
    reportContext: authorization.reportContext,
  });
  return result.ok
    ? json({ ok: true, reportId: result.reportId } satisfies ImageReportResponse)
    : json({ ok: false, error: result.error } satisfies ImageReportResponse, {
        status: result.status,
      });
});
