import { INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { FREE_GENERATION_LIMIT, type FreeGenerationGrantStatus } from '$lib/freeGenerations';
import { getFreeGenerationGrantStatus, isInstallationId } from '$lib/server/freeGenerationGrants';
import { fail, throttled } from '$lib/server/http';
import { rateLimit } from '$lib/server/rateLimit';
import { freeGenerationGrantStatusBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  const limited = rateLimit(
    freeGenerationGrantStatusBucket(getClientAddress()),
    rateLimitPolicy.freeGrantStatus
  );
  if (limited.limited) return throttled(limited.retryAfter);
  const installationId = request.headers.get(INSTALLATION_ID_HEADER);
  if (!isInstallationId(installationId)) return fail(400, 'Installation grant unavailable');
  const { remaining } = await getFreeGenerationGrantStatus(installationId);
  const body: FreeGenerationGrantStatus = { ok: true, remaining, limit: FREE_GENERATION_LIMIT };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
};
