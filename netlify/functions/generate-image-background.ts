import { aiProvider } from '../../web/src/lib/server/ai/provider';
import {
  claimJob,
  completeJob,
  isGenerationWork,
  takeJobInput,
  verifyWorkTicket,
  WORK_TICKET_HEADER,
} from '../../web/src/lib/server/generationJobs';

// The long half of image generation (ADR-0115). A background function gets 15
// minutes where the request that started this one had to answer in under 26.
//
// It stays deliberately thin. Settling the free-generation reservation and
// minting the report token both need SvelteKit's `$lib`/`$env` aliases, which
// this build does not have, so they stay with the poll request that collects the
// result — and that constraint is a feature: nothing secret has to be written
// down for a later request to pick up.

const badPayload = () => new Response('Bad payload', { status: 400 });

export default async (request: Request): Promise<Response> => {
  const raw = await request.text();

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return badPayload();
  }

  // The function URL is public, so until the ticket checks out this is anyone's
  // input: read only the job id the ticket is bound to, and nothing else.
  const jobId =
    typeof payload === 'object' && payload !== null && 'jobId' in payload ? payload.jobId : null;
  if (typeof jobId !== 'string') return badPayload();

  if (
    !verifyWorkTicket(
      request.headers.get(WORK_TICKET_HEADER),
      jobId,
      raw,
      process.env.REPORT_TOKEN_SECRET
    )
  ) {
    console.warn('[generate-image-background] rejected an unsigned or mismatched job');
    return new Response('Forbidden', { status: 403 });
  }

  let claimId: string | null = null;
  try {
    claimId = await claimJob(jobId);
    if (!claimId) return new Response(null, { status: 200 });

    // A signed payload of the wrong shape was written by a start on a different
    // deploy, not by an attacker. It is recorded as this job's failure so the
    // poll refunds the slot and stops waiting, rather than left pending until
    // the job expires.
    if (!isGenerationWork(payload)) {
      console.error('[generate-image-background] a signed job did not match GenerationWork');
      await completeJob(
        jobId,
        claimId,
        { status: 'error', reason: 'the job was not one this worker can run' },
        null
      );
      return new Response(null, { status: 200 });
    }

    // Read and delete in one step: from here the drawing lives in this worker's
    // memory, and a copy left at rest for the whole generation serves nothing.
    const input = await takeJobInput(jobId);
    if (!input) {
      await completeJob(
        jobId,
        claimId,
        { status: 'error', reason: 'the drawing was not there' },
        null
      );
      return new Response(null, { status: 200 });
    }

    const result = await aiProvider.generateImage({
      apiKey: payload.apiKey,
      image: { bytes: input, mimeType: payload.mimeType },
      prompt: payload.prompt,
      deadlineMs: payload.deadlineMs,
    });

    if (result.kind === 'image') {
      const bytes = Buffer.from(result.data, 'base64');
      await completeJob(
        jobId,
        claimId,
        { status: 'image', mimeType: result.mimeType },
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      );
    } else {
      await completeJob(jobId, claimId, { status: result.kind, reason: result.reason }, null);
    }
  } catch (cause) {
    // Netlify retries a background function that fails — twice, a minute apart.
    // On a paid model call that is three generations billed for one drawing, and
    // a child watching an outcome that keeps being overwritten. So every failure
    // is recorded as this job's answer and reported as success to the platform.
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[generate-image-background] ${jobId} failed: ${reason}`);
    if (claimId)
      await completeJob(jobId, claimId, { status: 'error', reason }, null).catch(() => {
        // Nothing left to do: the poll falls through to `expired` on its own.
      });
  }

  return new Response(null, { status: 200 });
};

export const config = { background: true };
