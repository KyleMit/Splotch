import { error } from '@sveltejs/kit';
import {
  API_KEY_HEADER,
  ACCESS_TOKEN_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '$lib/apiHeaders';
import { apiHandler, fail, throttled } from '$lib/server/http';
import { GENERATION_UNAVAILABLE_CODE, type GenerationUnavailable } from '$lib/ai/generationResult';
import { rateLimit } from '$lib/server/rateLimit';
import { generationResultBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import {
  discardJob,
  readJob,
  takeJobImage,
  type GenerationJobContext,
} from '$lib/server/generationJobs';
import { completeFreeGeneration, failFreeGeneration } from '$lib/server/freeGenerationGrants';
import { issueReportToken, type ReportTokenBinding } from '$lib/server/reportToken';
import { SAFETY_REFUSAL_STATUS } from '$lib/drawing/aiImageResponse';
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
// A job id is 256 bits of randomness handed only to the caller that started the
// job, so possession is the authorization. Shape-checking it keeps a malformed
// id from becoming a blob-store lookup.
const JOB_ID_PATTERN = /^[a-f0-9]{64}$/;

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
      cause instanceof Error ? cause.message : cause
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

  const jobId = url.searchParams.get('job') ?? '';
  if (!JOB_ID_PATTERN.test(jobId)) throw error(400, 'Unknown generation');

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
  if (job.status === 'pending') return new Response(null, { status: 202 });

  const binding = reportBinding(request, job.context);

  if (job.status === 'refusal') {
    await settleFreeGeneration(job.context, false, 'safety');
    await discardJob(jobId);
    const headers: Record<string, string> = {};
    const reportToken = binding
      ? issueReportToken(binding, { kind: 'false-positive-refusal', refusalReason: job.reason })
      : null;
    if (reportToken) headers[REPORT_TOKEN_HEADER] = reportToken;
    return fail(SAFETY_REFUSAL_STATUS, `Drawing was blocked for safety: ${job.reason}`, headers);
  }

  if (job.status === 'error') {
    await settleFreeGeneration(job.context, false, 'upstream');
    await discardJob(jobId);
    throw error(502, job.reason);
  }

  let image: Uint8Array | null;
  try {
    image = await takeJobImage(jobId);
  } catch {
    // Same class as an unreadable status: the store, not the job. Nothing has
    // been settled or discarded yet, so the next poll can still collect it.
    return unavailable();
  }
  // The status said `image` but the bytes are gone — the only way that happens
  // is the blob expiring between the two reads. Retryable, not a refusal.
  if (!image) throw error(502, 'That creation could not be collected');

  const freeRemaining = await settleFreeGeneration(job.context, true, 'upstream');
  await discardJob(jobId);

  const headers: Record<string, string> = {
    'Content-Type': job.mimeType,
    'Cache-Control': 'no-store',
  };
  if (freeRemaining !== null) headers[FREE_GENERATIONS_REMAINING_HEADER] = String(freeRemaining);
  if (job.context.free && binding) {
    const reportToken = issueReportToken(binding);
    if (reportToken) headers[REPORT_TOKEN_HEADER] = reportToken;
  }
  return new Response(Buffer.from(image), { headers });
};

export const GET: RequestHandler = apiHandler(collect);
