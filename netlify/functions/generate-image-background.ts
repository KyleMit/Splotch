import { aiProvider } from '../../web/src/lib/server/ai/provider';
import { completeJob, verifyWorkTicket } from '../../web/src/lib/server/generationJobs';

// The long half of image generation (ADR-0115). A background function gets 15
// minutes where the request that started this one had to answer in under 26.
//
// It stays deliberately thin. Settling the free-generation reservation and
// minting the report token both need SvelteKit's `$lib`/`$env` aliases, which
// this build does not have, so they stay with the poll request that collects the
// result — and that constraint is a feature: nothing secret has to be written
// down for a later request to pick up.

interface WorkPayload {
  jobId: string;
  apiKey: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  deadlineMs: number;
}

// This URL is publicly reachable, so the ticket is what makes "only we call it"
// true rather than assumed — without it anyone could drive paid model calls.
const TICKET_HEADER = 'X-Work-Ticket';

export default async (request: Request): Promise<Response> => {
  const raw = await request.text();

  let work: WorkPayload;
  try {
    work = JSON.parse(raw) as WorkPayload;
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  if (
    !verifyWorkTicket(
      request.headers.get(TICKET_HEADER),
      work.jobId,
      raw,
      process.env.REPORT_TOKEN_SECRET
    )
  ) {
    console.warn('[generate-image-background] rejected an unsigned or mismatched job');
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const result = await aiProvider.generateImage({
      apiKey: work.apiKey,
      image: { base64: work.imageBase64, mimeType: work.mimeType },
      prompt: work.prompt,
      deadlineMs: work.deadlineMs,
    });

    if (result.kind === 'image') {
      const bytes = Buffer.from(result.data, 'base64');
      await completeJob(
        work.jobId,
        { status: 'image', mimeType: result.mimeType },
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      );
    } else {
      await completeJob(work.jobId, { status: result.kind, reason: result.reason }, null);
    }
  } catch (cause) {
    // Netlify retries a background function that fails — twice, a minute apart.
    // On a paid model call that is three generations billed for one drawing, and
    // a child watching an outcome that keeps being overwritten. So every failure
    // is recorded as this job's answer and reported as success to the platform.
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[generate-image-background] ${work.jobId} failed: ${reason}`);
    await completeJob(work.jobId, { status: 'error', reason }, null).catch(() => {
      // Nothing left to do: the poll falls through to `expired` on its own.
    });
  }

  return new Response(null, { status: 200 });
};

export const config = { background: true };
