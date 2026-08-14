import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { GENERATION_JOB_STORE_NAME } from './generationJobStoreName';

// Where a generation lives between the request that starts it and the request
// that collects it (ADR-0115). Alias-free and config-free on purpose: the
// background worker under netlify/ imports this, and that build has neither
// SvelteKit's `$lib`/`$env` nor a way to reach them — so the signing secret is
// passed in by whichever side has it.
//
// What is deliberately NOT here is the child's drawing. It rides in the worker
// invocation body and never leaves the worker's memory, so the promise on
// /privacy — that an ordinary request keeps nothing — survives the split into
// two requests. Only the finished picture is stored, and only until the poll
// that hands it over deletes it.

// A job id is a capability: whoever holds it collects that picture. It is 256
// bits of randomness, handed only to the caller that started the job, deleted on
// collection, and expired within minutes — so it is not worth binding to a
// credential the poll would then have to re-authorize (and re-rate-limit).
const JOB_ID_BYTES = 32;

// The worker is a publicly reachable Netlify function URL, so "it is only called
// by us" has to be enforced rather than assumed: without this anyone could drive
// paid model calls by POSTing to it. The ticket is an HMAC over the job id and a
// digest of the payload, so a valid ticket cannot be replayed onto different work.
const TICKET_LABEL = 'ai-generation-ticket-v1';
const HMAC_ALG = 'sha256';
// Long enough for the platform to hand the invocation to the worker, short
// enough that a captured ticket is useless by the time anyone could use it.
const TICKET_TTL_MS = 60_000;

// The generation itself is bounded well below this; the ceiling exists so a job
// whose worker died can never be polled forever.
const JOB_TTL_MS = 20 * 60 * 1000;

// What the worker decided. Nothing here needs a credential or the free-grant
// ledger: settling the reservation and minting the report token both stay with
// the poll request, which is a SvelteKit route and can reach them. The worker
// cannot — it is built without those aliases — and that constraint is what keeps
// this record free of anything secret.
export type GenerationJobOutcome =
  | { status: 'image'; mimeType: string }
  | { status: 'refusal'; reason: string }
  | { status: 'error'; reason: string };

/**
 * Written when the job starts, by the request that still has the authorization
 * in hand. Only non-secret facts: the reservation to settle, and the style for
 * a report. The credential itself is never stored — the poll carries it again.
 */
export interface GenerationJobContext {
  free: { installationId: string; reservationId: string } | null;
  style: string | null;
}

export type GenerationJobState =
  | { status: 'pending'; context: GenerationJobContext }
  /** No such job, or it aged out. Definitive: the picture is not coming. */
  | { status: 'expired' }
  /** The store could not be read. Says nothing about the job — worth retrying. */
  | { status: 'unavailable' }
  | (GenerationJobOutcome & { context: GenerationJobContext });

interface StoredJob {
  context: GenerationJobContext;
  outcome: GenerationJobOutcome | null;
  expiresAt: number;
}

const statusKey = (jobId: string) => `${jobId}/status.json`;
const imageKey = (jobId: string) => `${jobId}/image`;

function store() {
  return getStore({ name: GENERATION_JOB_STORE_NAME, consistency: 'strong' });
}

export function newJobId(): string {
  return randomBytes(JOB_ID_BYTES).toString('hex');
}

function sign(jobId: string, payloadDigest: string, expiresAt: number, secret: string): string {
  return createHmac(HMAC_ALG, secret)
    .update(JSON.stringify([TICKET_LABEL, jobId, payloadDigest, expiresAt]))
    .digest('hex');
}

const digestOf = (payload: string) =>
  createHmac(HMAC_ALG, TICKET_LABEL).update(payload).digest('hex');

/** A ticket authorizing exactly this job with exactly this payload, or null if unconfigured. */
export function issueWorkTicket(
  jobId: string,
  payload: string,
  secret: string | undefined,
  now = Date.now()
): string | null {
  if (!secret) return null;
  const expiresAt = now + TICKET_TTL_MS;
  return `${expiresAt}.${sign(jobId, digestOf(payload), expiresAt, secret)}`;
}

export function verifyWorkTicket(
  ticket: string | null,
  jobId: string,
  payload: string,
  secret: string | undefined,
  now = Date.now()
): boolean {
  if (!secret || !ticket) return false;
  const [expiresRaw, signature] = ticket.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !signature) return false;
  const expected = sign(jobId, digestOf(payload), expiresAt, secret);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Mark the job started. Written before the worker is invoked so a poll can tell
 * "not finished yet" from "no such job" — without it a mistyped id would be
 * reported as pending forever.
 */
export async function markJobPending(
  jobId: string,
  context: GenerationJobContext,
  now = Date.now()
): Promise<void> {
  const record: StoredJob = { context, outcome: null, expiresAt: now + JOB_TTL_MS };
  await store().setJSON(statusKey(jobId), record);
}

export async function completeJob(
  jobId: string,
  outcome: GenerationJobOutcome,
  image: ArrayBuffer | null,
  now = Date.now()
): Promise<void> {
  // Bytes first: a poll that saw `image` but found nothing to send would be a
  // dead end, whereas one more `pending` is simply the next poll's problem.
  if (image) await store().set(imageKey(jobId), image);
  const existing = (await store().get(statusKey(jobId), { type: 'json' })) as StoredJob | null;
  const record: StoredJob = {
    // A worker that outlived its own start record has nothing to settle, which
    // is the same shape as a job that never had a reservation.
    context: existing?.context ?? { free: null, style: null },
    outcome,
    expiresAt: now + JOB_TTL_MS,
  };
  await store().setJSON(statusKey(jobId), record);
}

export async function readJob(jobId: string, now = Date.now()): Promise<GenerationJobState> {
  let record: StoredJob | null;
  try {
    record = (await store().get(statusKey(jobId), { type: 'json' })) as StoredJob | null;
  } catch (cause) {
    // An unreachable store is not evidence the job is gone, and answering
    // "expired" would tell a child their picture is lost when it may be sitting
    // there finished. Distinguishing the two is the difference between "try
    // again" and a dead end.
    console.warn(
      '[generation-jobs] could not read the job store:',
      cause instanceof Error ? cause.message : cause
    );
    return { status: 'unavailable' };
  }
  if (!record || record.expiresAt < now) return { status: 'expired' };
  return { ...(record.outcome ?? { status: 'pending' as const }), context: record.context };
}

export async function takeJobImage(jobId: string): Promise<Uint8Array | null> {
  const bytes = (await store().get(imageKey(jobId), { type: 'arrayBuffer' })) as ArrayBuffer | null;
  return bytes ? new Uint8Array(bytes) : null;
}

/** Collected means finished with: the picture has been handed over, so nothing is kept. */
export async function discardJob(jobId: string): Promise<void> {
  await Promise.allSettled([store().delete(imageKey(jobId)), store().delete(statusKey(jobId))]);
}
