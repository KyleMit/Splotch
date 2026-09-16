// @vitest-environment node
import {
  advance,
  collect,
  dailyProviderStarts,
  DRAWING,
  grantOf,
  jobBlobKeys,
  LATE_COLLECTION_MARGIN_MS,
  OTHER_INSTALLATION,
  PICTURE,
  PLATFORM_RETRY_DELAY_MS,
  runWorker,
  settlementTestState,
  setWorkerAnswer,
  SLOW_GENERATION_MS,
  startFreeGeneration,
  startHandedOffGeneration,
  STORE_CALL_LATENCY_MS,
} from './settlementTestHarness';
import { describe, expect, it, vi } from 'vitest';
import { FREE_GENERATIONS_REMAINING_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';
import { SAFETY_REFUSAL_STATUS } from '$lib/drawing/aiImageResponse';
import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
import { GENERATION_JOB_STORE_NAME } from '$lib/server/generationJobStoreName';
import { WORK_TICKET_HEADER } from '$lib/server/generationJobs';
import worker from '../../../../../netlify/functions/generate-image-background';

// The free-generation allowance is settled across three requests that never
// share memory: the start reserves a slot and hands it to a job, the background
// worker records what the model did, and the poll charges or refunds the slot.
// Each is unit-tested against mocks of the other two, which is exactly where a
// double charge or a lost refund would hide. So this drives the real routes,
// the real worker, the real job store module, and the real grant ledger over one
// in-memory Blobs fake, and mocks only the model call and the rate limiter.

const { blobs, provider } = settlementTestState;

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
    setWorkerAnswer(() => new Response('nope', { status: 500 }));

    const response = await startFreeGeneration();

    expect(response.status).toBe(200);
    expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBe(
      String(FREE_GENERATION_LIMIT - 1)
    );
    expect(provider.generateImage).toHaveBeenCalledOnce();
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
    expect(blobs.stores.get(GENERATION_JOB_STORE_NAME)?.size ?? 0).toBe(0);
  });

  it('keeps polling after the worker accepts a handoff whose reply is lost', async () => {
    const generation = Promise.withResolvers<{
      kind: 'image';
      data: string;
      mimeType: string;
    }>();
    provider.generateImage.mockImplementationOnce(() => generation.promise);
    let workerRun: Promise<Response> | undefined;
    setWorkerAnswer(async (dispatch) => {
      workerRun = runWorker(dispatch);
      await vi.waitFor(() => expect(provider.generateImage).toHaveBeenCalledOnce());
      throw new Error('connection reset after acceptance');
    });

    const start = await startFreeGeneration();
    generation.resolve({
      kind: 'image',
      data: PICTURE.toString('base64'),
      mimeType: 'image/png',
    });
    await workerRun;

    expect(start.status).toBe(202);
    const { jobId } = (await start.json()) as { jobId: string };
    const response = await collect(jobId);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PICTURE);
    expect(provider.generateImage).toHaveBeenCalledOnce();
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
  });

  it('refunds a handoff that could not reach the worker when the in-line fallback is refused', async () => {
    setWorkerAnswer(() => Promise.reject(new Error('connection reset')));
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
