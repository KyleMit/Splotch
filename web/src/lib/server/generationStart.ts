import { env } from '$env/dynamic/private';
import { ASYNC_GENERATION_HEADER } from '$lib/apiHeaders';
import { config } from './config';
import { GENERATE_DEADLINE_MS } from '$lib/ai/limits';
import {
  discardJob,
  issueWorkTicket,
  markJobPending,
  newJobId,
  putJobInput,
} from './generationJobs';
import type { GenerationJobContext } from './generationJobs';
import type { GenerationAuthorization } from './generationAuthorization';

// Handing a generation to the background worker (ADR-0115).
//
// The worker is a Netlify background function, so it exists only where Netlify
// is serving the site — under a plain `vite dev` there is nothing at that path.
// Availability is therefore established by *attempting the handoff*, not by
// reading an environment variable. The first version probed `process.env.NETLIFY`
// and silently never engaged on a real deploy: NETLIFY is a build-time variable,
// so it is set while the site is being built and absent while it is running.
// A guess that fails closed looks exactly like a platform that has no worker,
// which is the one failure this path cannot afford to be quiet about.

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

/**
 * What the worker is told. Small on purpose: a background function's invocation
 * body is capped in the low hundreds of KB, so the drawing goes to the job store
 * and only its job id travels here.
 */
export interface GenerationWork {
  jobId: string;
  apiKey: string;
  prompt: string;
  mimeType: string;
  deadlineMs: number;
}

/**
 * Whether the caller is willing to collect the picture in a later request. The
 * server decides separately whether there is a worker to hand it to — by trying,
 * not by guessing (see startBackgroundGeneration).
 */
export function clientAcceptsBackgroundGeneration(request: Request): boolean {
  return Boolean(request.headers.get(ASYNC_GENERATION_HEADER));
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
 * A handoff that definitively failed leaves a job nobody will ever collect, and
 * therefore a drawing nobody will ever delete: the caller answers in-line from
 * here, so no poll is coming to run the collection path. The scheduled purge
 * would get to it eventually; a child's drawing should not wait for that when
 * the failure is already known here.
 */
async function abandon(jobId: string): Promise<void> {
  try {
    await discardJob(jobId);
  } catch (cause) {
    // The fallback matters more than the cleanup — the purge is the backstop.
    console.warn(
      '[generate-image] could not clean up the abandoned job:',
      cause instanceof Error ? cause.message : cause
    );
  }
}

/**
 * Register the job and hand it to the worker. Returns null when the handoff
 * could not be made, so the caller falls back to answering in-line rather than
 * leaving a child watching a job nobody is working on.
 */
export async function startBackgroundGeneration(
  origin: string,
  context: GenerationJobContext,
  image: { bytes: ArrayBuffer; mimeType: string },
  work: Omit<GenerationWork, 'jobId' | 'deadlineMs' | 'mimeType'>
): Promise<StartedGeneration | null> {
  const jobId = newJobId();
  const payload = JSON.stringify({
    ...work,
    jobId,
    mimeType: image.mimeType,
    deadlineMs: WORKER_DEADLINE_MS,
  });
  const ticket = issueWorkTicket(jobId, payload, config.reportTokenSecret());
  if (!ticket) {
    // Not "no worker here" — the worker cannot be invoked safely without a
    // signing secret, and on a platform that does have one this is a
    // misconfiguration that would otherwise present as every generation timing
    // out for no visible reason.
    console.error('[generate-image] REPORT_TOKEN_SECRET is unset; cannot dispatch to the worker');
    return null;
  }

  try {
    await markJobPending(jobId, context);
    await putJobInput(jobId, image.bytes);
    // A background function answers 202 as soon as it has accepted the work, so
    // this await is the handoff, not the generation.
    const response = await fetch(`${origin}${WORKER_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Work-Ticket': ticket },
      body: payload,
    });
    if (!response.ok) {
      console.error(`[generate-image] worker refused the job: ${response.status}`);
      await abandon(jobId);
      return null;
    }
  } catch (cause) {
    console.error(
      '[generate-image] could not hand off to the worker:',
      cause instanceof Error ? cause.message : cause
    );
    await abandon(jobId);
    return null;
  }

  return { jobId, pollAfterMs: FIRST_POLL_DELAY_MS };
}
