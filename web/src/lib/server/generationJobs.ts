import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { GENERATION_JOB_STORE_NAME } from './generationJobStoreName';
import { settleWithRetentionConcurrency } from './retentionSweep';
// Relative, not `$lib`: the background worker imports this module and is built
// without SvelteKit's aliases.
import { GENERATION_JOB_TTL_MS } from '../ai/limits';

// Where a generation lives between the request that starts it and the request
// that collects it (ADR-0115). Alias-free and config-free on purpose: the
// background worker under netlify/ imports this, and that build has neither
// SvelteKit's `$lib`/`$env` nor a way to reach them — so the signing secret is
// passed in by whichever side has it.
//
// The child's drawing passes through here, and that is a platform constraint
// rather than a choice: a Netlify background function's invocation body is
// capped between 200 KB and 400 KB (measured against a deploy), which a drawing
// exceeds as soon as the client cannot encode WebP — which is every Safari, and
// so most of this app's iPads. Background functions are meant to be handed a
// reference, not data.
//
// So the input is written here and taken by the worker in one read-and-delete:
// it is at rest for the handoff and no longer. The finished picture is at rest
// until the poll that hands it over deletes it. That is a real change from the
// single-request flow, which kept nothing at all, and /privacy says so.

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
  claimId: string | null;
  expiresAt: number;
}

const statusKey = (jobId: string) => `${jobId}/status.json`;
const inputKey = (jobId: string) => `${jobId}/input`;
const imageKey = (jobId: string) => `${jobId}/image`;

type JobStore = ReturnType<typeof getStore>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

function isGenerationJobContext(value: unknown): value is GenerationJobContext {
  if (!isRecord(value) || !isStringOrNull(value.style)) return false;
  const { free } = value;
  return (
    free === null ||
    (isRecord(free) &&
      typeof free.installationId === 'string' &&
      typeof free.reservationId === 'string')
  );
}

function isGenerationJobOutcome(value: unknown): value is GenerationJobOutcome {
  if (!isRecord(value)) return false;
  switch (value.status) {
    case 'image':
      return typeof value.mimeType === 'string';
    case 'refusal':
    case 'error':
      return typeof value.reason === 'string';
    default:
      return false;
  }
}

function isStoredJob(value: unknown): value is StoredJob {
  return (
    isRecord(value) &&
    isGenerationJobContext(value.context) &&
    (value.outcome === null || isGenerationJobOutcome(value.outcome)) &&
    isStringOrNull(value.claimId) &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt)
  );
}

// The SDK types a JSON read as `any`, and a record left by a deploy with an
// older shape, or a partial write, would otherwise flow straight into typed
// code. Every caller treats a record that fails the guard exactly as a missing
// one: readJob answers `expired`, claimJob and completeJob decline to write, and
// the purge deletes it — a job whose record cannot be read is never finishing.
// The job id stays out of the warning: it is the capability to collect the picture.
function storedJobOrNull(value: unknown): StoredJob | null {
  if (value === null || value === undefined) return null;
  if (isStoredJob(value)) return value;
  console.warn('[generation-jobs] ignoring a malformed job record');
  return null;
}

async function readStoredJob(jobStore: JobStore, jobId: string): Promise<StoredJob | null> {
  const value: unknown = await jobStore.get(statusKey(jobId), { type: 'json' });
  return storedJobOrNull(value);
}

// The etag stays optional: the local Blobs server behind `netlify dev` answers a
// read without one, and the deployed store always sends it. Without it the
// conditional write that follows degrades to an unconditional one, which only
// the single-developer local server ever sees.
async function readStoredJobVersion(
  jobStore: JobStore,
  jobId: string
): Promise<{ data: StoredJob; etag: string | undefined } | null> {
  const entry = await jobStore.getWithMetadata(statusKey(jobId), { type: 'json' });
  const data = storedJobOrNull(entry?.data);
  return data && entry ? { data, etag: entry.etag } : null;
}

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
// The header that authorizes a background generation. Both sides of the handoff
// already import this module, so the name is declared once: spelling it twice
// fails closed and silently — the worker answers 403, the start logs a refusal,
// and every generation quietly falls back to the synchronous path.
export const WORK_TICKET_HEADER = 'X-Work-Ticket';

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
  const record: StoredJob = {
    context,
    outcome: null,
    claimId: null,
    expiresAt: now + GENERATION_JOB_TTL_MS,
  };
  await store().setJSON(statusKey(jobId), record);
}

export async function claimJob(jobId: string): Promise<string | null> {
  const jobStore = store();
  const existing = await readStoredJobVersion(jobStore, jobId);
  if (!existing || existing.data.outcome || existing.data.claimId) return null;

  const claimId = randomUUID();
  try {
    const write = await jobStore.setJSON(
      statusKey(jobId),
      { ...existing.data, claimId },
      { onlyIfMatch: existing.etag }
    );
    return write.modified ? claimId : null;
  } catch (cause) {
    // A conditional write may commit even when its reply is lost. Recovering
    // that ownership keeps the claimant from abandoning work only it can do.
    let recorded: StoredJob | null;
    try {
      recorded = await readStoredJob(jobStore, jobId);
    } catch {
      throw cause;
    }
    if (recorded?.claimId === claimId) return claimId;
    throw cause;
  }
}

/** The drawing the worker will render, written before the worker is invoked. */
export async function putJobInput(jobId: string, image: ArrayBuffer): Promise<void> {
  await store().set(inputKey(jobId), image);
}

/**
 * Read the drawing and delete it in the same step. The worker holds it in memory
 * from here on, so leaving a copy behind would keep a child's drawing at rest
 * for the whole generation to no purpose.
 */
export async function takeJobInput(jobId: string): Promise<Uint8Array | null> {
  // The SDK types a missing key's arrayBuffer read as ArrayBuffer, but it resolves null.
  const bytes: ArrayBuffer | null = await store().get(inputKey(jobId), { type: 'arrayBuffer' });
  await store().delete(inputKey(jobId));
  return bytes ? new Uint8Array(bytes) : null;
}

export async function completeJob(
  jobId: string,
  claimId: string,
  outcome: GenerationJobOutcome,
  image: ArrayBuffer | null
): Promise<void> {
  const jobStore = store();
  const existing = await readStoredJobVersion(jobStore, jobId);
  if (!existing || existing.data.outcome || existing.data.claimId !== claimId) return;

  // Bytes first: a poll that saw `image` but found nothing to send would be a
  // dead end, whereas one more `pending` is simply the next poll's problem.
  if (image) await jobStore.set(imageKey(jobId), image);
  const record: StoredJob = {
    context: existing.data.context,
    outcome,
    claimId,
    // Kept from the start, not restarted: the free reservation's lease runs from
    // the start too, and an outcome still collectable after that lease lapses
    // hands over a picture the ledger can no longer charge.
    expiresAt: existing.data.expiresAt,
  };
  await jobStore.setJSON(statusKey(jobId), record, { onlyIfMatch: existing.etag });
}

export async function readJob(jobId: string, now = Date.now()): Promise<GenerationJobState> {
  let record: StoredJob | null;
  try {
    record = await readStoredJob(store(), jobId);
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
  const bytes: ArrayBuffer | null = await store().get(imageKey(jobId), { type: 'arrayBuffer' });
  return bytes ? new Uint8Array(bytes) : null;
}

/** Collected means finished with: the picture has been handed over, so nothing is kept. */
export async function discardJob(jobId: string): Promise<void> {
  await Promise.allSettled([
    // The input is normally gone already — the worker takes it — but a job that
    // never reached a worker must not leave a drawing behind.
    store().delete(inputKey(jobId)),
    store().delete(imageKey(jobId)),
    store().delete(statusKey(jobId)),
  ]);
}

/**
 * The sweep that makes `expiresAt` mean something. On its own that timestamp
 * only changes what `readJob` answers; a site-wide Netlify Blobs store has no
 * TTL of its own, so every key survives until something deletes it. Collection
 * deletes the ones that get collected — but a child who closes the modal, an app
 * that is killed mid-wait, or a run nobody ever polls leaves a drawing and a
 * finished picture at rest indefinitely, which is neither what ADR-0115 says nor
 * what /privacy tells parents.
 *
 * A job with no status record is swept too. The status is written before the
 * input, so bytes without one are the remains of a job whose record has already
 * gone — never a job still being started.
 */
export async function purgeExpiredGenerationJobs(now = Date.now()): Promise<{
  attemptedJobs: number;
  purgedJobs: number;
  failedJobs: number;
  retainedJobs: number;
  deletedBlobs: number;
  failedBlobDeletes: number;
}> {
  const jobStore = store();
  let attemptedJobs = 0;
  let purgedJobs = 0;
  let failedJobs = 0;
  let retainedJobs = 0;
  let deletedBlobs = 0;
  let failedBlobDeletes = 0;
  const seenJobIds = new Set<string>();

  for await (const page of jobStore.list({ paginate: true, directories: true })) {
    const jobIds = page.directories.filter((jobId) => {
      if (seenJobIds.has(jobId)) return false;
      seenJobIds.add(jobId);
      return true;
    });
    attemptedJobs += jobIds.length;
    const outcomes = await settleWithRetentionConcurrency(jobIds, async (jobId) => {
      const record = await readStoredJob(jobStore, jobId);
      if (record && record.expiresAt >= now) return { status: 'retained' as const };

      let jobDeletedBlobs = 0;
      let jobFailedBlobDeletes = 0;
      for (const key of [inputKey(jobId), imageKey(jobId), statusKey(jobId)]) {
        try {
          await jobStore.delete(key);
          jobDeletedBlobs++;
        } catch (cause) {
          console.warn(
            '[purge-generation-jobs] failed to delete a job blob:',
            cause instanceof Error ? cause.message : cause
          );
          jobFailedBlobDeletes++;
        }
      }
      return {
        status: jobFailedBlobDeletes === 0 ? ('purged' as const) : ('failed' as const),
        deletedBlobs: jobDeletedBlobs,
        failedBlobDeletes: jobFailedBlobDeletes,
      };
    });

    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        console.warn(
          '[purge-generation-jobs] failed to process a job:',
          outcome.reason instanceof Error ? outcome.reason.message : outcome.reason
        );
        failedJobs++;
      } else if (outcome.value.status === 'retained') {
        retainedJobs++;
      } else {
        deletedBlobs += outcome.value.deletedBlobs;
        failedBlobDeletes += outcome.value.failedBlobDeletes;
        if (outcome.value.status === 'purged') purgedJobs++;
        else failedJobs++;
      }
    }
  }

  return {
    attemptedJobs,
    purgedJobs,
    failedJobs,
    retainedJobs,
    deletedBlobs,
    failedBlobDeletes,
  };
}
