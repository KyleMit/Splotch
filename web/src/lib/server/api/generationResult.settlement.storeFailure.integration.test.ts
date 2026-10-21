// @vitest-environment node
import {
  dailyProviderStarts,
  grantOf,
  PICTURE,
  settlementTestState,
  setWorkerAnswer,
  startFreeGeneration,
} from './settlementTestHarness';
import { describe, expect, it, vi } from 'vitest';
import { SAFETY_REFUSAL_STATUS } from '$lib/ai/generationResult';
import { GENERATION_JOB_STORE_NAME } from '$lib/server/generationJobs';

// A start whose job store fails before the worker is called. The worker never
// saw the job and the job id never left the start request, so that request is
// the only thing that can run the generation or settle its reservation. Driven
// through the real start route, job store module, and grant ledger, as
// settlement.integration.test.ts is.

const { blobs, provider } = settlementTestState;

type JobStoreOperation = 'get' | 'set' | 'setJSON';

function failJobStore(...operations: JobStoreOperation[]) {
  for (const operation of operations) {
    blobs.faults.add(`${GENERATION_JOB_STORE_NAME}:${operation}`);
  }
}

function watchForDispatch() {
  const dispatch = vi.fn(() => new Response(null, { status: 202 }));
  setWorkerAnswer(dispatch);
  return dispatch;
}

describe('a free generation whose job store fails before the worker is called', () => {
  it.each<[string, JobStoreOperation[]]>([
    ['the job record cannot be written', ['setJSON']],
    ['the drawing cannot be stored and the record cannot be read back', ['set', 'get']],
  ])('answers in-line and charges one slot when %s', async (_label, operations) => {
    const dispatch = watchForDispatch();
    failJobStore(...operations);

    const response = await startFreeGeneration();

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PICTURE);
    expect(dispatch).not.toHaveBeenCalled();
    expect(provider.generateImage).toHaveBeenCalledOnce();
    expect(grantOf()).toMatchObject({ successful: 1, failures: 0, reservations: {} });
    expect(dailyProviderStarts()).toBe(1);
    expect(blobs.stores.get(GENERATION_JOB_STORE_NAME)?.size ?? 0).toBe(0);
  });

  it('refunds the slot exactly once when the in-line answer is a refusal', async () => {
    const dispatch = watchForDispatch();
    failJobStore('setJSON');
    provider.generateImage.mockResolvedValue({ kind: 'refusal', reason: 'IMAGE_SAFETY' });

    const response = await startFreeGeneration();

    expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
    expect(dispatch).not.toHaveBeenCalled();
    expect(provider.generateImage).toHaveBeenCalledOnce();
    expect(grantOf()).toMatchObject({
      successful: 0,
      failures: 1,
      lastFailureKind: 'safety',
      reservations: {},
    });
  });
});
