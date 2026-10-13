import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { getStore } from '@netlify/blobs';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { expect } from 'vitest';
import * as limits from '$lib/ai/limits';
import * as freeGenerations from '$lib/freeGenerations';
import * as installationId from '$lib/installationId';
import * as currentWriter from './freeGenerationGrants';
import * as logRedaction from './logRedaction';
import { createRecoveryLedgerTestFixture } from './freeGenerationRecoveryTestHarness';

const FROZEN_SOURCE_SHA256 = '8cabccbb0d98e995e5af8ee9434d99c035387d1a2e59725b6b7e2dbcc4d86454';
const FROZEN_EXECUTION_TIMEOUT_MS = 1000;
const LEGACY_METHODS = [
  'reserveDailyFreeGeneration',
  'reserveFreeGeneration',
  'completeFreeGeneration',
  'failFreeGeneration',
] as const;
type LegacyWriter = Pick<typeof currentWriter, (typeof LEGACY_METHODS)[number]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyWriter(value: unknown): value is LegacyWriter {
  return isRecord(value) && LEGACY_METHODS.every((method) => typeof value[method] === 'function');
}

function loadFrozenLegacyWriter(): LegacyWriter {
  const source = readFileSync(
    new URL('./fixtures/freeGenerationGrants.fe59955b.ts.txt', import.meta.url),
    'utf8'
  );
  if (createHash('sha256').update(source).digest('hex') !== FROZEN_SOURCE_SHA256) {
    throw new Error('Frozen ledger fixture is not the sealed historical source');
  }
  const dependencies = new Map<string, unknown>([
    ['@netlify/blobs', { getStore }],
    ['$app/environment', { dev: false }],
    ['$lib/ai/limits', limits],
    ['$lib/freeGenerations', freeGenerations],
    ['$lib/installationId', installationId],
    ['./logRedaction', logRedaction],
    ['./sleep', { sleep: async () => {} }],
  ]);
  const exports: unknown = {};
  const compiled = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  runInNewContext(
    compiled.outputText,
    {
      exports,
      Date,
      crypto: globalThis.crypto,
      console,
      require(specifier: string) {
        if (!dependencies.has(specifier))
          throw new Error(`Unapproved fixture import: ${specifier}`);
        return dependencies.get(specifier);
      },
    },
    { filename: 'freeGenerationGrants.fe59955b.ts.txt', timeout: FROZEN_EXECUTION_TIMEOUT_MS }
  );
  if (!isLegacyWriter(exports)) throw new Error('Frozen ledger fixture exports changed');
  return exports;
}

// This test-only seam runs the same preservation assertions against the incompatible writer.
export function preservationWriter(frozen: LegacyWriter): LegacyWriter {
  const control = process.env.SPLOTCH_ROLLOUT_PRESERVATION_WRITER;
  if (control === undefined) return currentWriter;
  if (control === 'frozen-old') return frozen;
  throw new Error('Unknown rollout preservation negative-control writer');
}

interface ReadAudit {
  key: string;
  etag: string | null;
}
interface WriteAudit {
  key: string;
  beforeEtag: string | null;
  condition: { onlyIfNew?: boolean; onlyIfMatch?: string };
  modified: boolean;
  afterEtag: string | null;
}

export function createRolloutFixture() {
  const fixture = createRecoveryLedgerTestFixture();
  const store = fixture.store();
  const reads: ReadAudit[] = [];
  const writes: WriteAudit[] = [];
  const read = store.getWithMetadata.getMockImplementation();
  const commit = store.setJSON.getMockImplementation();
  if (!read || !commit) throw new Error('Conditional-store fixture implementation is missing');
  store.getWithMetadata.mockImplementation(async (key) => {
    const snapshot = await read(key);
    reads.push({ key, etag: snapshot?.etag ?? null });
    return snapshot;
  });
  store.setJSON.mockImplementation(async (key, data, condition) => {
    const beforeEtag = fixture.entries.get(key)?.etag ?? null;
    const result = await commit(key, data, condition);
    writes.push({
      key,
      beforeEtag,
      condition: structuredClone(condition),
      modified: result.modified,
      afterEtag: fixture.entries.get(key)?.etag ?? null,
    });
    return result;
  });
  function raw(key: string): Record<string, unknown> {
    const data = fixture.entries.get(key)?.data;
    if (!isRecord(data)) throw new Error(`Missing ledger record: ${key}`);
    return structuredClone(data);
  }
  function checkpoint(key: string) {
    const etag = fixture.entries.get(key)?.etag;
    if (!etag) throw new Error(`Missing ledger ETag: ${key}`);
    return { reads: reads.length, writes: writes.length, etag };
  }
  return { ...fixture, store, reads, writes, raw, checkpoint, frozen: loadFrozenLegacyWriter() };
}

export function expectFreshLegacyMutation(
  fixture: ReturnType<typeof createRolloutFixture>,
  key: string,
  checkpoint: ReturnType<ReturnType<typeof createRolloutFixture>['checkpoint']>
): void {
  expect(fixture.reads.slice(checkpoint.reads)).toEqual([{ key, etag: checkpoint.etag }]);
  expect(fixture.writes.slice(checkpoint.writes)).toEqual([
    {
      key,
      beforeEtag: checkpoint.etag,
      condition: { onlyIfMatch: checkpoint.etag },
      modified: true,
      afterEtag: fixture.entries.get(key)?.etag,
    },
  ]);
  expect(fixture.entries.get(key)?.etag).not.toBe(checkpoint.etag);
}
