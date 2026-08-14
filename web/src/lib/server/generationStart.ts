import { env } from '$env/dynamic/private';
import { config } from './config';
import { GENERATE_DEADLINE_MS } from '$lib/ai/limits';
import { issueWorkTicket, markJobPending, newJobId } from './generationJobs';
import type { GenerationJobContext } from './generationJobs';
import type { GenerationAuthorization } from './generationAuthorization';

// Handing a generation to the background worker (ADR-0115).
//
// The worker is a Netlify background function, so it exists only where Netlify
// is running the site. Under a plain `vite dev` there is nothing at that path,
// which is why availability is decided here rather than by the client: a caller
// says it *can* handle a later result, and this decides whether there is one to
// wait for.

const WORKER_PATH = '/.netlify/functions/generate-image-background';

// How long the worker may spend. It is not racing a platform ceiling — a
// background function gets 15 minutes — so this only exists to stop a wedged
// provider call holding a slot indefinitely. Sized well past the slowest effort
// tier measured in the bake-off (~2.5 min at high).
const WORKER_DEADLINE_MS = 5 * 60 * 1000;

// The client is told when to look, so the poll cadence is a server decision that
// can move with the model without shipping a new app. Below the fastest measured
// generation, since the first poll also proves the round trip works.
const FIRST_POLL_DELAY_MS = 4_000;

export interface StartedGeneration {
  jobId: string;
  pollAfterMs: number;
}

export interface GenerationWork {
  jobId: string;
  apiKey: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  deadlineMs: number;
}

/**
 * Whether a background worker exists to hand this job to. `NETLIFY` is set both
 * in the deployed environment and by `netlify dev`, which are exactly the two
 * places the function is reachable.
 */
export function backgroundWorkerAvailable(): boolean {
  // `process.env`, not `$env/dynamic/private`: this is the platform's own marker
  // for "Netlify is running me", not app configuration, and the throwaway
  // servers must not be made to declare it — e2e-server-env.test.mjs draws that
  // line and names NETLIFY as the example.
  return Boolean(process.env.NETLIFY) && Boolean(config.reportTokenSecret());
}

/** The generation deadline for a request answered in-line, not by the worker. */
export function synchronousDeadlineMs(): number {
  // The shipped deadline exists to lose a race to Netlify's platform ceiling on
  // purpose (ADR-0063). A local dev server has no such ceiling, and the manual
  // red-team suite needs a generation to actually finish before a human can
  // review whether it was safe to return. That suite is the only caller that
  // sets this; production never does.
  const override = Number(env.GENERATE_DEADLINE_MS_OVERRIDE);
  if (!Number.isFinite(override) || override <= 0) return GENERATE_DEADLINE_MS;
  // Clamped so the escape hatch cannot become the thing it exists beneath: a
  // synchronous request still has to answer before the platform kills it, and a
  // deadline past the worker's own ceiling would never fire at all.
  return Math.min(override, WORKER_DEADLINE_MS);
}

export function freeSettlement(
  authorization: GenerationAuthorization,
  reservationId: string | undefined
): GenerationJobContext['free'] {
  if (authorization.kind !== 'free' || !reservationId) return null;
  return { installationId: authorization.installationId, reservationId };
}

/**
 * Register the job and hand it to the worker. Returns null when the handoff
 * could not be made, so the caller falls back to answering in-line rather than
 * leaving a child watching a job nobody is working on.
 */
export async function startBackgroundGeneration(
  origin: string,
  context: GenerationJobContext,
  work: Omit<GenerationWork, 'jobId' | 'deadlineMs'>
): Promise<StartedGeneration | null> {
  const jobId = newJobId();
  const payload = JSON.stringify({ ...work, jobId, deadlineMs: WORKER_DEADLINE_MS });
  const ticket = issueWorkTicket(jobId, payload, config.reportTokenSecret());
  if (!ticket) return null;

  try {
    await markJobPending(jobId, context);
    // A background function answers 202 as soon as it has accepted the work, so
    // this await is the handoff, not the generation.
    const response = await fetch(`${origin}${WORKER_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Work-Ticket': ticket },
      body: payload,
    });
    if (!response.ok) {
      console.error(`[generate-image] worker refused the job: ${response.status}`);
      return null;
    }
  } catch (cause) {
    console.error(
      '[generate-image] could not hand off to the worker:',
      cause instanceof Error ? cause.message : cause
    );
    return null;
  }

  return { jobId, pollAfterMs: FIRST_POLL_DELAY_MS };
}
