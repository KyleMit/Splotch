import { describe, expect, it } from 'vitest';
import { arch, platform, release } from 'node:os';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import {
  CORPUS_VERSION,
  benchmarkCorpus,
  decoderOutcome,
  malformedCorpus,
} from './native-png-hot-path-corpus.mjs';

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
const BENCHMARK_MAX_ELAPSED_MS = 180_000;
const BENCHMARK_TEST_TIMEOUT_MS = 200_000;

function emit(value) {
  process.stdout.write('PNG_HOT_PATH_BENCHMARK_3649 ' + JSON.stringify(value) + '\n');
}

describe('UNRUN generated corpus actual-decoder timing observation', () => {
  it(
    'retains every result under the unchanged actual scheduler and decoder limits',
    async () => {
      const corpus = [...benchmarkCorpus(), ...malformedCorpus()];
      const started = performance.now();
      const records = [];
      let exhausted = false;
      for (const fixture of corpus) {
        for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
          if (performance.now() - started >= BENCHMARK_MAX_ELAPSED_MS) {
            exhausted = true;
            break;
          }
          const decoder = createPngAlphaDecoder();
          const at = performance.now();
          const outcome = await decoderOutcome(decoder, fixture);
          const elapsedMs = performance.now() - at;
          const record = {
            id: fixture.id,
            fixtureSHA256: fixture.fixtureSHA256,
            rawBytes: fixture.raw?.length ?? null,
            pngBytes: fixture.png.length,
            run,
            warmup: run < WARMUP_RUNS,
            elapsedMs,
            outcome,
            expected: fixture.expected,
          };
          records.push(record);
          emit({ schema: CORPUS_VERSION, kind: 'sample', ...record });
        }
        if (exhausted) break;
      }
      emit({
        schema: CORPUS_VERSION,
        kind: 'complete',
        runtime: process.versions,
        host: { platform: platform(), release: release(), arch: arch() },
        scheduling: 'production-native-pngTask-on-Node-no-scheduler-mock',
        warmupRuns: WARMUP_RUNS,
        measuredRuns: MEASURED_RUNS,
        fixtureCount: corpus.length,
        sampleCount: records.length,
        elapsedMs: performance.now() - started,
        exhausted,
        nativeOrHermesCauseQualified: false,
        campaignPerformanceQualified: false,
      });
      expect(exhausted).toBe(false);
      expect(records).toHaveLength(corpus.length * (WARMUP_RUNS + MEASURED_RUNS));
      for (const record of records) expect(record.outcome, record.id).toEqual(record.expected);
    },
    BENCHMARK_TEST_TIMEOUT_MS
  );
});
