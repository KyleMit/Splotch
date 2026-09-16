// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The free-generation allowance is settled across three requests that never
// share memory: the start reserves a slot and hands it to a job, the background
// worker records what the model did, and the poll charges or refunds the slot.
// Each is unit-tested against mocks of the other two, which is exactly where a
// double charge or a lost refund would hide. So this drives the real routes,
// the real worker, the real job store module, and the real grant ledger over one
// in-memory Blobs fake, and mocks only the model call and the rate limiter.

interface StoredBlob {
  value: unknown;
  etag: string;
}

type BlobOperation = 'get' | 'set' | 'setJSON' | 'delete';

const blobs = vi.hoisted(() => {
  const stores = new Map<string, Map<string, StoredBlob>>();
  const faults = new Set<string>();
  let version = 0;
  // Real store calls take time, and the gap between the ledger's clock and the
  // job's clock is where a picture slips out uncharged.
  const latency = { ms: 0 };
  return { stores, faults, latency, nextEtag: () => `v${++version}` };
});

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const provider = vi.hoisted(() => ({ generateImage: vi.fn() }));

vi.mock('@netlify/blobs', () => {
  const yieldToOtherRequests = () => new Promise<void>((resolve) => setImmediate(resolve));
  const copy = (value: unknown) =>
    value instanceof ArrayBuffer ? value.slice(0) : structuredClone(value);
  const toStored = (value: unknown) =>
    ArrayBuffer.isView(value)
      ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      : copy(value);

  return {
    getStore: ({ name }: { name: string }) => {
      const entries = blobs.stores.get(name) ?? new Map<string, StoredBlob>();
      blobs.stores.set(name, entries);
      const guard = async (operation: BlobOperation) => {
        await yieldToOtherRequests();
        if (blobs.latency.ms) vi.setSystemTime(Date.now() + blobs.latency.ms);
        if (blobs.faults.has(`${name}:${operation}`))
          throw new Error(`${name} ${operation} failed`);
      };
      return {
        async get(key: string) {
          await guard('get');
          const entry = entries.get(key);
          return entry ? copy(entry.value) : null;
        },
        async getWithMetadata(key: string) {
          await guard('get');
          const entry = entries.get(key);
          return entry ? { data: copy(entry.value), etag: entry.etag, metadata: {} } : null;
        },
        async set(key: string, value: unknown) {
          await guard('set');
          entries.set(key, { value: toStored(value), etag: blobs.nextEtag() });
          return { modified: true };
        },
        async setJSON(
          key: string,
          value: unknown,
          condition: { onlyIfNew?: boolean; onlyIfMatch?: string } = {}
        ) {
          await guard('setJSON');
          const existing = entries.get(key);
          if (condition.onlyIfNew && existing) return { modified: false };
          if (condition.onlyIfMatch && existing?.etag !== condition.onlyIfMatch) {
            return { modified: false };
          }
          entries.set(key, { value: structuredClone(value), etag: blobs.nextEtag() });
          return { modified: true };
        },
        async delete(key: string) {
          await guard('delete');
          entries.delete(key);
        },
      };
    },
  };
});
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/server/ai/provider', () => ({ aiProvider: provider }));
vi.mock('$lib/server/rateLimit', () => ({
  rateLimit: () => ({ limited: false, retryAfter: 0 }),
  peekRateLimit: () => ({ limited: false, retryAfter: 0 }),
}));

import {
  ASYNC_GENERATION_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
} from '$lib/apiHeaders';
import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';
import { SAFETY_REFUSAL_STATUS } from '$lib/drawing/aiImageResponse';
import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
import { GENERATION_JOB_STORE_NAME } from '$lib/server/generationJobStoreName';
import { WORK_TICKET_HEADER } from '$lib/server/generationJobs';
import worker from '../../../../../netlify/functions/generate-image-background';
import { POST as startGeneration } from '../generate-image/+server';
import { GET as collectGeneration } from './+server';

const GRANT_STORE_NAME = 'free-generation-grants';
const REPORT_TOKEN_SECRET = 'integration-report-secret';
const INSTALLATION = 'c'.repeat(64);
const OTHER_INSTALLATION = 'd'.repeat(64);
const DRAWING = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PICTURE = Buffer.from('a finished picture');
const START_TIME = new Date('2026-09-12T10:00:00Z');
// Netlify re-invokes a failed background function a minute after it fails; the
// work ticket the start signed is meant to be dead by then.
const PLATFORM_RETRY_DELAY_MS = 60_000;
// Inside the worker's own deadline, so a job that finishes this late is one the
// platform considers healthy.
const SLOW_GENERATION_MS = 4 * 60 * 1000;
// How far either side of the reservation lease's end a poll lands.
const LATE_COLLECTION_MARGIN_MS = 60_000;
// A plausible round trip to Netlify Blobs, applied to every fake store call.
const STORE_CALL_LATENCY_MS = 40;

interface StoredGrant {
  successful: number;
  attempts: number;
  failures: number;
  lastFailureKind: string | null;
  reservations: Record<string, string>;
}

let dispatched: Request[] = [];
let workerAnswer: () => Response | Promise<Response>;

function event(request: Request) {
  return {
    request,
    url: new URL(request.url),
    getClientAddress: () => '198.51.100.3',
    platform: undefined,
  };
}

async function startFreeGeneration(installationId = INSTALLATION): Promise<Response> {
  const request = new Request('https://splotch.test/api/generate-image?style=Crayon', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      [INSTALLATION_ID_HEADER]: installationId,
      [ASYNC_GENERATION_HEADER]: '1',
    },
    body: DRAWING,
  });
  return startGeneration(event(request) as unknown as Parameters<typeof startGeneration>[0]);
}

async function startHandedOffGeneration(): Promise<{ jobId: string; dispatch: Request }> {
  const response = await startFreeGeneration();
  expect(response.status).toBe(202);
  const { jobId } = (await response.json()) as { jobId: string };
  const dispatch = dispatched.at(-1);
  if (!dispatch) throw new Error('the start did not dispatch the worker');
  return { jobId, dispatch };
}

function runWorker(dispatch: Request): Promise<Response> {
  return worker(dispatch.clone());
}

async function collect(jobId: string, headers: Record<string, string> = {}): Promise<Response> {
  const request = new Request(`https://splotch.test/api/generation-result?job=${jobId}`, {
    headers: { [INSTALLATION_ID_HEADER]: INSTALLATION, ...headers },
  });
  return collectGeneration(event(request) as unknown as Parameters<typeof collectGeneration>[0]);
}

function grantOf(installationId = INSTALLATION): StoredGrant | undefined {
  return blobs.stores.get(GRANT_STORE_NAME)?.get(installationId)?.value as StoredGrant | undefined;
}

function dailyProviderStarts(): number {
  const [daily] = [...(blobs.stores.get(GRANT_STORE_NAME)?.entries() ?? [])]
    .filter(([key]) => key.startsWith('daily-provider-starts/'))
    .map(([, entry]) => entry.value as { starts: number });
  return daily?.starts ?? 0;
}

function jobBlobKeys(jobId: string): string[] {
  return [...(blobs.stores.get(GENERATION_JOB_STORE_NAME)?.keys() ?? [])].filter((key) =>
    key.startsWith(jobId)
  );
}

function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

function answerWithPicture() {
  provider.generateImage.mockResolvedValue({
    kind: 'image',
    data: PICTURE.toString('base64'),
    mimeType: 'image/png',
  });
}

beforeEach(() => {
  blobs.stores.clear();
  blobs.faults.clear();
  blobs.latency.ms = 0;
  dispatched = [];
  workerAnswer = () => new Response(null, { status: 202 });
  env.OPENAI_API_KEY = 'project-key';
  env.REPORT_TOKEN_SECRET = REPORT_TOKEN_SECRET;
  vi.stubEnv('REPORT_TOKEN_SECRET', REPORT_TOKEN_SECRET);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START_TIME);
  provider.generateImage.mockReset();
  answerWithPicture();
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    dispatched.push(new Request(input, init));
    return workerAnswer();
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('free generation settlement across the background handoff', () => {
  it('holds the slot for the job rather than releasing it on the way out of the start', async () => {
    await startHandedOffGeneration();

    expect(provider.generateImage).not.toHaveBeenCalled();
    expect(grantOf()).toMatchObject({ successful: 0, attempts: 1, failures: 0 });
    expect(Object.keys(grantOf()?.reservations ?? {})).toHaveLength(1);
    expect(dailyProviderStarts()).toBe(1);
  });

  it('settles nothing while the job is still pending, however often it is polled', async () => {
    const { jobId } = await startHandedOffGeneration();
    const before = structuredClone(grantOf());

    for (let poll = 0; poll < 3; poll++) {
      expect((await collect(jobId)).status).toBe(202);
    }

    expect(grantOf()).toEqual(before);
  });

  it('charges exactly one slot when the picture is collected', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    expect((await runWorker(dispatch)).status).toBe(200);

    const response = await collect(jobId);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PICTURE);
    expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBe(
      String(FREE_GENERATION_LIMIT - 1)
    );
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
    expect(jobBlobKeys(jobId)).toEqual([]);
  });

  it('charges nothing more for a repeat collection after delivery', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);
    await collect(jobId);

    const repeat = await collect(jobId);

    expect(repeat.status).toBe(404);
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
  });

  it('charges one slot when two polls collect the same picture at once', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    const responses = await Promise.all([collect(jobId), collect(jobId)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(grantOf()).toMatchObject({ successful: 1, reservations: {} });
    expect(
      responses.filter((response) => response.headers.has(FREE_GENERATIONS_REMAINING_HEADER))
    ).toHaveLength(1);
  });

  it.each([
    [
      'a safety refusal',
      { kind: 'refusal', reason: 'IMAGE_SAFETY' },
      SAFETY_REFUSAL_STATUS,
      'safety',
    ],
    ['an upstream error', { kind: 'error', reason: 'no image came back' }, 502, 'upstream'],
  ])('refunds the slot exactly once after %s', async (_label, result, status, failureKind) => {
    provider.generateImage.mockResolvedValue(result);
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    expect((await collect(jobId)).status).toBe(status);
    expect((await collect(jobId)).status).toBe(404);

    expect(grantOf()).toMatchObject({
      successful: 0,
      failures: 1,
      lastFailureKind: failureKind,
      reservations: {},
    });
  });

  it('never refunds the daily provider-start ceiling after the model was called', async () => {
    provider.generateImage.mockResolvedValue({ kind: 'refusal', reason: 'IMAGE_SAFETY' });
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    await collect(jobId);

    expect(dailyProviderStarts()).toBe(1);
  });

  // Both polls read the refusal before either discards it, so both release the
  // slot; the ledger has to treat the second release as the same one.
  it('records one failure when two polls collect the same refusal at once', async () => {
    provider.generateImage.mockResolvedValue({ kind: 'refusal', reason: 'IMAGE_SAFETY' });
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    await Promise.all([collect(jobId), collect(jobId)]);

    expect(grantOf()).toMatchObject({ successful: 0, reservations: {}, failures: 1 });
  });

  it('cannot be redirected to settle against the installation a poll claims to be', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    const response = await collect(jobId, { [INSTALLATION_ID_HEADER]: OTHER_INSTALLATION });

    expect(response.status).toBe(200);
    expect(grantOf()).toMatchObject({ successful: 1, reservations: {} });
    expect(grantOf(OTHER_INSTALLATION)).toBeUndefined();
  });

  it('settles nothing for a well-formed job id nobody was given', async () => {
    const { dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);
    const before = structuredClone(grantOf());

    expect((await collect('f'.repeat(64))).status).toBe(404);

    expect(grantOf()).toEqual(before);
  });

  it('answers retryably and settles nothing while the job store is unreachable', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);
    const before = structuredClone(grantOf());

    blobs.faults.add(`${GENERATION_JOB_STORE_NAME}:get`);
    expect((await collect(jobId)).status).toBe(503);
    expect(grantOf()).toEqual(before);

    blobs.faults.clear();
    expect((await collect(jobId)).status).toBe(200);
    expect(grantOf()).toMatchObject({ successful: 1, reservations: {} });
  });

  it('returns the slot of a job nobody collects once its lease lapses, without charging it', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    advance(2 * GENERATION_JOB_TTL_MS);
    expect((await collect(jobId)).status).toBe(404);
    expect(jobBlobKeys(jobId)).toEqual([]);

    const followUp = await startFreeGeneration();
    expect(followUp.status).toBe(202);
    expect(grantOf()).toMatchObject({ successful: 0, failures: 1, lastFailureKind: 'abandoned' });
    expect(Object.keys(grantOf()?.reservations ?? {})).toHaveLength(1);
  });

  // An outcome stays collectable for `GENERATION_JOB_TTL_MS` from the start
  // request, however long the model took, and its reservation is held past
  // that, so a picture still on offer can always be charged.
  it('charges a slow picture collected before its lease lapses', async () => {
    provider.generateImage.mockImplementation(async () => {
      advance(SLOW_GENERATION_MS);
      return { kind: 'image', data: PICTURE.toString('base64'), mimeType: 'image/png' };
    });
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    advance(GENERATION_JOB_TTL_MS - SLOW_GENERATION_MS - LATE_COLLECTION_MARGIN_MS);
    const response = await collect(jobId);

    expect(response.status).toBe(200);
    expect(grantOf()).toMatchObject({ successful: 1, reservations: {} });
  });

  it('stops offering a slow picture once its lifetime from the start has passed', async () => {
    provider.generateImage.mockImplementation(async () => {
      advance(SLOW_GENERATION_MS);
      return { kind: 'image', data: PICTURE.toString('base64'), mimeType: 'image/png' };
    });
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    advance(GENERATION_JOB_TTL_MS - SLOW_GENERATION_MS + LATE_COLLECTION_MARGIN_MS);
    const response = await collect(jobId);

    expect(response.status).toBe(404);
    expect(jobBlobKeys(jobId)).toEqual([]);
    expect(grantOf()).toMatchObject({ successful: 0 });
  });

  it('charges a picture collected at the last moment its job is on offer, even over a slow store', async () => {
    blobs.latency.ms = STORE_CALL_LATENCY_MS;
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);
    const job = blobs.stores.get(GENERATION_JOB_STORE_NAME)?.get(`${jobId}/status.json`)?.value as {
      expiresAt: number;
    };

    vi.setSystemTime(job.expiresAt);
    const response = await collect(jobId);

    expect(response.status).toBe(200);
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
  });

  it('settles a failed handoff in the start request itself, exactly once', async () => {
    workerAnswer = () => new Response('nope', { status: 500 });

    const response = await startFreeGeneration();

    expect(response.status).toBe(200);
    expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBe(
      String(FREE_GENERATION_LIMIT - 1)
    );
    expect(provider.generateImage).toHaveBeenCalledOnce();
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
    expect(blobs.stores.get(GENERATION_JOB_STORE_NAME)?.size ?? 0).toBe(0);
  });

  it('refunds a handoff that could not reach the worker when the in-line fallback is refused', async () => {
    workerAnswer = () => Promise.reject(new Error('connection reset'));
    provider.generateImage.mockResolvedValue({ kind: 'refusal', reason: 'IMAGE_SAFETY' });

    const response = await startFreeGeneration();

    expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
    expect(grantOf()).toMatchObject({
      successful: 0,
      failures: 1,
      lastFailureKind: 'safety',
      reservations: {},
    });
  });
});

describe('the background worker', () => {
  it('refuses a dispatch with a forged ticket without touching the job or calling the model', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    const headers = new Headers(dispatch.headers);
    headers.set(WORK_TICKET_HEADER, `${Date.now() + PLATFORM_RETRY_DELAY_MS}.${'0'.repeat(64)}`);
    const forged = new Request(dispatch.url, {
      method: 'POST',
      headers,
      body: await dispatch.clone().text(),
    });

    expect((await worker(forged)).status).toBe(403);

    expect(provider.generateImage).not.toHaveBeenCalled();
    expect(jobBlobKeys(jobId)).toContain(`${jobId}/input`);
    expect((await collect(jobId)).status).toBe(202);
  });

  it('refuses a genuine ticket replayed onto different work', async () => {
    const { dispatch } = await startHandedOffGeneration();
    const payload = JSON.parse(await dispatch.clone().text()) as Record<string, unknown>;
    const tampered = new Request(dispatch.url, {
      method: 'POST',
      headers: dispatch.headers,
      body: JSON.stringify({ ...payload, apiKey: 'someone-elses-key' }),
    });

    expect((await worker(tampered)).status).toBe(403);
    expect(provider.generateImage).not.toHaveBeenCalled();
  });

  it('answers 400 to a body that is not JSON', async () => {
    const response = await worker(
      new Request('https://splotch.test/.netlify/functions/generate-image-background', {
        method: 'POST',
        body: 'not json',
      })
    );

    expect(response.status).toBe(400);
  });

  it('takes the drawing out of the store before calling the model', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    provider.generateImage.mockImplementation(async () => {
      expect(jobBlobKeys(jobId)).not.toContain(`${jobId}/input`);
      return { kind: 'image', data: PICTURE.toString('base64'), mimeType: 'image/png' };
    });

    await runWorker(dispatch);

    expect(provider.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'project-key',
        image: { bytes: new Uint8Array(DRAWING), mimeType: 'image/png' },
      })
    );
  });

  it('answers 200 when the model throws, so the platform never re-bills the drawing', async () => {
    provider.generateImage.mockRejectedValue(new Error('socket hang up'));
    const { jobId, dispatch } = await startHandedOffGeneration();

    expect((await runWorker(dispatch)).status).toBe(200);

    const response = await collect(jobId);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'socket hang up' });
    expect(grantOf()).toMatchObject({ successful: 0, failures: 1, reservations: {} });
  });

  it('answers 200 even when it cannot record the failure, leaving the slot to lapse', async () => {
    provider.generateImage.mockRejectedValue(new Error('socket hang up'));
    const { jobId, dispatch } = await startHandedOffGeneration();
    blobs.faults.add(`${GENERATION_JOB_STORE_NAME}:setJSON`);

    expect((await runWorker(dispatch)).status).toBe(200);

    blobs.faults.clear();
    expect((await collect(jobId)).status).toBe(202);
    expect(Object.keys(grantOf()?.reservations ?? {})).toHaveLength(1);
  });

  it('records a missing drawing as an error the poll refunds, without calling the model', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    blobs.stores.get(GENERATION_JOB_STORE_NAME)?.delete(`${jobId}/input`);

    expect((await runWorker(dispatch)).status).toBe(200);

    expect(provider.generateImage).not.toHaveBeenCalled();
    expect((await collect(jobId)).status).toBe(502);
    expect(grantOf()).toMatchObject({ successful: 0, failures: 1, reservations: {} });
  });

  it('keeps the first picture when the same valid dispatch reaches the worker twice', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();

    expect((await runWorker(dispatch)).status).toBe(200);
    expect((await runWorker(dispatch)).status).toBe(200);

    expect(provider.generateImage).toHaveBeenCalledOnce();
    const response = await collect(jobId);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PICTURE);
    expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBe(
      String(FREE_GENERATION_LIMIT - 1)
    );
    expect(grantOf()).toMatchObject({
      successful: 1,
      failures: 0,
      reservations: {},
    });
  });

  it('keeps an in-flight picture when a duplicate dispatch arrives before it finishes', async () => {
    const generation = Promise.withResolvers();
    provider.generateImage.mockReturnValue(generation.promise);
    const { jobId, dispatch } = await startHandedOffGeneration();

    const firstRun = runWorker(dispatch);
    await vi.waitFor(() => expect(provider.generateImage).toHaveBeenCalledOnce());
    expect((await runWorker(dispatch)).status).toBe(200);
    generation.resolve({
      kind: 'image',
      data: PICTURE.toString('base64'),
      mimeType: 'image/png',
    });
    expect((await firstRun).status).toBe(200);

    expect(provider.generateImage).toHaveBeenCalledOnce();
    const response = await collect(jobId);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PICTURE);
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
  });

  it('refuses a platform retry once the ticket has lapsed, leaving the recorded picture intact', async () => {
    const { jobId, dispatch } = await startHandedOffGeneration();
    await runWorker(dispatch);

    advance(PLATFORM_RETRY_DELAY_MS + 1);
    expect((await runWorker(dispatch)).status).toBe(403);

    expect(provider.generateImage).toHaveBeenCalledOnce();
    const response = await collect(jobId);
    expect(response.status).toBe(200);
    expect(grantOf()).toMatchObject({ successful: 1, reservations: {} });
  });
});
