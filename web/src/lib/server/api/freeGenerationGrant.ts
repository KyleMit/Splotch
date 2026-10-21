import { INSTALLATION_ID_HEADER } from '../../apiHeaders';
import { FREE_GENERATION_LIMIT, type FreeGenerationGrantStatus } from '../../freeGenerations';
import { isInstallationId } from '../../installationId';
import { config } from '../config';
import {
  getDailyFreeGenerationStatus,
  getFreeGenerationGrantStatus,
} from '../freeGenerationGrants';
import { apiHandler, fail, throttled } from '../http';
import { rateLimit } from '../rateLimit';
import { freeGenerationGrantStatusBucket } from '../rateLimitKeys';
import { rateLimitPolicy } from '../rateLimitPolicy';
import type { ApiHandler } from './apiEvent';

export const GET: ApiHandler = apiHandler(async ({ request, getClientAddress }) => {
  const limited = rateLimit(
    freeGenerationGrantStatusBucket(getClientAddress()),
    rateLimitPolicy.freeGrantStatus
  );
  if (limited.limited) return throttled(limited.retryAfter);
  const installationId = request.headers.get(INSTALLATION_ID_HEADER);
  if (!isInstallationId(installationId)) return fail(400, 'Installation grant unavailable');
  if (!config.openAiApiKey()) return fail(503, 'Free generations are unavailable');
  const daily = await getDailyFreeGenerationStatus();
  if (!daily.available) return fail(503, 'Free generations are unavailable today');
  const { remaining } = await getFreeGenerationGrantStatus(installationId);
  const body: FreeGenerationGrantStatus = { ok: true, remaining, limit: FREE_GENERATION_LIMIT };
  return Response.json(body);
});
