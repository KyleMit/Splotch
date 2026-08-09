import { INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { FREE_GENERATION_LIMIT, type FreeGenerationGrantStatus } from '$lib/freeGenerations';
import { config } from '$lib/server/config';
import {
  getDailyFreeGenerationStatus,
  getFreeGenerationGrantStatus,
  isInstallationId,
} from '$lib/server/freeGenerationGrants';
import { apiHandler, fail, throttled } from '$lib/server/http';
import { rateLimit } from '$lib/server/rateLimit';
import { freeGenerationGrantStatusBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = apiHandler(async ({ request, getClientAddress }) => {
  const limited = rateLimit(
    freeGenerationGrantStatusBucket(getClientAddress()),
    rateLimitPolicy.freeGrantStatus
  );
  if (limited.limited) return throttled(limited.retryAfter);
  const installationId = request.headers.get(INSTALLATION_ID_HEADER);
  if (!isInstallationId(installationId)) return fail(400, 'Installation grant unavailable');
  if (!config.geminiApiKey()) return fail(503, 'Free generations are unavailable');
  const daily = await getDailyFreeGenerationStatus();
  if (!daily.available) return fail(503, 'Free generations are unavailable today');
  const { remaining } = await getFreeGenerationGrantStatus(installationId);
  const body: FreeGenerationGrantStatus = { ok: true, remaining, limit: FREE_GENERATION_LIMIT };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
