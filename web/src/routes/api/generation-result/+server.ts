import { error } from '@sveltejs/kit';
import { API_KEY_HEADER, ACCESS_TOKEN_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { GENERATION_JOB_PARAM } from '$lib/apiParams';
import { apiHandler, throttled } from '$lib/server/http';
import {
  GENERATION_ACCEPTED_STATUS,
  GENERATION_UNAVAILABLE_CODE,
  type GenerationUnavailable,
} from '$lib/ai/generationResult';
import { rateLimit } from '$lib/server/rateLimit';
import { generationResultBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import {
  pictureResponse,
  prepareDeliveredImage,
  safetyRefusalResponse,
  type DeliveredImage,
} from '$lib/server/generationDelivery';
import {
  discardJob,
  isJobId,
  readJob,
  readJobImage,
  type GenerationJobContext,
} from '$lib/server/generationJobs';
import { completeFreeGeneration, failFreeGeneration } from '$lib/server/freeGenerationGrants';
import { loggableError } from '$lib/server/logRedaction';
import type { ReportTokenBinding } from '$lib/server/reportToken';
import type { RequestHandler } from './$types';

// Collects a generation that /api/generate-image handed to the background worker
// (ADR-0115). Everything that needs a credential or the free-grant ledger lives
// here rather than in the worker, which is built without the aliases to reach
// either — so no secret is ever written to the job store for a later request to
// pick up.

const UNAVAILABLE_STATUS = 503;

function unavailable(): Response {
  const body: GenerationUnavailable = {
    ok: false,
    code: GENERATION_UNAVAILABLE_CODE,
    error: 'That creation could not be collected just now',
  };
  return Response.json(body, { status: UNAVAILABLE_STATUS });
}

function reportBinding(request: Request, context: GenerationJobContext): ReportTokenBinding | null {
  const apiKey = request.headers.get(API_KEY_HEADER)?.trim();
  if (apiKey) return { kind: 'byok', credential: apiKey };
  const token = request.headers.get(ACCESS_TOKEN_HEADER)?.trim();
  if (token) return { kind: 'managed', credential: token };
  const installationId =
    context.free?.installationId ?? request.headers.get(INSTALLATION_ID_HEADER);
  if (installationId) return { kind: 'free', credential: installationId };
  return null;
}

/**
 * Spend the reserved slot now that a picture exists. The picture is already made
 * and already paid for, so a ledger write that fails must not turn it into an
 * error the child sees — the reservation lapses on its own and the response
 * simply omits the remaining-count header.
 */
async function settleFreeGeneration(
  context: GenerationJobContext,
  succeeded: boolean,
  failureKind: 'safety' | 'upstream'
): Promise<number | null> {
  if (!context.free) return null;
  const { installationId, reservationId } = context.free;
  try {
    if (!succeeded) {
      await failFreeGeneration(installationId, failureKind, reservationId);
      return null;
    }
    return (await completeFreeGeneration(installationId, reservationId)).remaining;
  } catch (cause) {
    console.warn(
      '[generation-result] failed to record the settled generation:',
      loggableError(cause)
    );
    return null;
  }
}

const collect: RequestHandler = async ({ request, url, getClientAddress }) => {
  const { limited, retryAfter } = rateLimit(
    generationResultBucket(getClientAddress()),
    rateLimitPolicy.generationResult
  );
  if (limited) return throttled(retryAfter);

  // Possessing the job id is the authorization (generationJobs.ts); checking its
  // shape keeps a malformed one from becoming a blob-store lookup.
  const jobId = url.searchParams.get(GENERATION_JOB_PARAM) ?? '';
  if (!isJobId(jobId)) throw error(400, 'Unknown generation');

  const job = await readJob(jobId);
  // Retryable *and worth continuing to wait for*: the store is what failed, not
  // the job, so the picture may well be sitting there finished. The code is what
  // lets the client tell this from a generation that genuinely failed — a status
  // three meanings share cannot.
  if (job.status === 'unavailable') return unavailable();
  if (job.status === 'expired') {
    // Aged out or already gone, and either way this is the last request that
    // will ever name this job — the client stops polling on a 404. Anything
    // still sitting under that id has no reader left, so it goes now rather
    // than waiting for the scheduled purge.
    await discardJob(jobId);
    throw error(404, 'That creation is no longer available');
  }
  if (job.status === 'pending') return new Response(null, { status: GENERATION_ACCEPTED_STATUS });

  const binding = reportBinding(request, job.context);

  if (job.status === 'refusal') {
    await settleFreeGeneration(job.context, false, 'safety');
    await discardJob(jobId);
    return safetyRefusalResponse(job.reason, binding);
  }

  if (job.status === 'error') {
    await settleFreeGeneration(job.context, false, 'upstream');
    await discardJob(jobId);
    throw error(502, job.reason);
  }

  let image: Uint8Array | null;
  try {
    image = await readJobImage(jobId);
  } catch {
    // Same class as an unreadable status: the store, not the job. Nothing has
    // been settled or discarded yet, so the next poll can still collect it.
    return unavailable();
  }
  // The status said `image` but the bytes are gone: the scheduled purge or a
  // concurrent collector's discardJob removed the job between the two reads.
  // Either way the next poll answers 404, so this is a plain 502, which tells
  // the client to stop waiting — not GENERATION_UNAVAILABLE, and not a refusal.
  if (!image) throw error(502, 'That creation could not be collected');

  let prepared: DeliveredImage;
  try {
    prepared = await prepareDeliveredImage(
      job.context.style,
      image,
      job.mimeType,
      'generation-result'
    );
  } catch (cause) {
    await settleFreeGeneration(job.context, false, 'upstream');
    await discardJob(jobId);
    throw cause;
  }

  const freeRemaining = await settleFreeGeneration(job.context, true, 'upstream');
  await discardJob(jobId);

  return pictureResponse(prepared, {
    freeRemaining,
    freeReportBinding: job.context.free ? binding : null,
  });
};

export const GET: RequestHandler = apiHandler(collect);
