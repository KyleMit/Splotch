import { afterEach, beforeEach, expect, vi } from 'vitest';

interface StoredBlob {
  value: unknown;
  etag: string;
}

type BlobOperation = 'get' | 'set' | 'setJSON' | 'delete';

const blobs = vi.hoisted(() => {
  const stores = new Map<string, Map<string, StoredBlob>>();
  const faults = new Set<string>();
  let version = 0;
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
        if (blobs.faults.has(`${name}:${operation}`)) {
          throw new Error(`${name} ${operation} failed`);
        }
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

import { ASYNC_GENERATION_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { GENERATION_JOB_STORE_NAME } from '$lib/server/generationJobStoreName';
import worker from '../../../../../netlify/functions/generate-image-background';
import { POST as startGeneration } from '../generate-image/+server';
import { GET as collectGeneration } from './+server';

export const settlementTestState = { blobs, provider };

const GRANT_STORE_NAME = 'free-generation-grants';
const REPORT_TOKEN_SECRET = 'integration-report-secret';
const INSTALLATION = 'c'.repeat(64);
export const OTHER_INSTALLATION = 'd'.repeat(64);
export const DRAWING = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const PICTURE = Buffer.from('a finished picture');
const START_TIME = new Date('2026-09-12T10:00:00Z');
export const PLATFORM_RETRY_DELAY_MS = 60_000;
export const SLOW_GENERATION_MS = 4 * 60 * 1000;
export const LATE_COLLECTION_MARGIN_MS = 60_000;
export const STORE_CALL_LATENCY_MS = 40;

interface StoredGrant {
  successful: number;
  attempts: number;
  failures: number;
  lastFailureKind: string | null;
  reservations: Record<string, string>;
}

type WorkerAnswer = (dispatch: Request) => Response | Promise<Response>;

let dispatched: Request[] = [];
let workerAnswer: WorkerAnswer;

function event(request: Request) {
  return {
    request,
    url: new URL(request.url),
    getClientAddress: () => '198.51.100.3',
    platform: undefined,
  };
}

export async function startFreeGeneration(installationId = INSTALLATION): Promise<Response> {
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

export async function startHandedOffGeneration(): Promise<{ jobId: string; dispatch: Request }> {
  const response = await startFreeGeneration();
  expect(response.status).toBe(202);
  const { jobId } = (await response.json()) as { jobId: string };
  const dispatch = dispatched.at(-1);
  if (!dispatch) throw new Error('the start did not dispatch the worker');
  return { jobId, dispatch };
}

export function runWorker(dispatch: Request): Promise<Response> {
  return worker(dispatch.clone());
}

export async function collect(
  jobId: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const request = new Request(`https://splotch.test/api/generation-result?job=${jobId}`, {
    headers: { [INSTALLATION_ID_HEADER]: INSTALLATION, ...headers },
  });
  return collectGeneration(event(request) as unknown as Parameters<typeof collectGeneration>[0]);
}

export function grantOf(installationId = INSTALLATION): StoredGrant | undefined {
  return blobs.stores.get(GRANT_STORE_NAME)?.get(installationId)?.value as StoredGrant | undefined;
}

export function dailyProviderStarts(): number {
  const [daily] = [...(blobs.stores.get(GRANT_STORE_NAME)?.entries() ?? [])]
    .filter(([key]) => key.startsWith('daily-provider-starts/'))
    .map(([, entry]) => entry.value as { starts: number });
  return daily?.starts ?? 0;
}

export function jobBlobKeys(jobId: string): string[] {
  return [...(blobs.stores.get(GENERATION_JOB_STORE_NAME)?.keys() ?? [])].filter((key) =>
    key.startsWith(jobId)
  );
}

export function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

export function setWorkerAnswer(answer: WorkerAnswer) {
  workerAnswer = answer;
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
    const dispatch = new Request(input, init);
    dispatched.push(dispatch);
    return workerAnswer(dispatch);
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
