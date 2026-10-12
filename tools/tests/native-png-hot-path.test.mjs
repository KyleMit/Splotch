import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync, constants } from 'node:zlib';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import { inflatePng } from '../../experiments/native-architecture/src/drawing/pngInflate.ts';
import { createPngWork } from '../../experiments/native-architecture/src/drawing/pngWork.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { pngReadFailureDiagnostic } from '../../experiments/native-architecture/src/export/pngReadDiagnostic.ts';
import {
  CORPUS_VERSION,
  WINDOW_BYTES,
  compressedFixture,
  correctnessCorpus,
  decoderOutcome,
  malformedCorpus,
  sha256,
} from './native-png-hot-path-corpus.mjs';

const CONTROL_TIMEOUT_MS = 60_000;
const SLICE_UNITS = 4096;
const SYNCHRONOUS_UNITS = 8192;
const RING_WRAP_EXTRA_BYTES = 257;
const BYTE_VARIATION_INTERVAL = 17;
const CANCEL_AT_CHECK = 3;
const DEADLINE_AT_CHECK = 2;
const ADLER_MODULUS = 65521;
const MAX_BYTE_VALUE = 255;
const ADLER_A_PREFIX_BYTES = Math.floor((ADLER_MODULUS - 1) / MAX_BYTE_VALUE);
const ADLER_A_FINAL_BYTE = (ADLER_MODULUS - 1) % MAX_BYTE_VALUE;
const trace = vi.hoisted(() => ({ active: false, entries: [] }));

vi.mock('../../experiments/native-architecture/src/drawing/pngTask.ts', () => ({
  async resumePngTask(check) {
    if (trace.active) trace.entries.push(['resume', 'idle']);
    check('idle');
  },
}));
vi.mock('../../experiments/native-architecture/src/drawing/pngWork.ts', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    createPngWork(isCurrent) {
      const work = original.createPngWork(() => {
        const current = isCurrent();
        if (trace.active) trace.entries.push(['current', current]);
        return current;
      });
      return {
        phase(value) {
          if (trace.active) trace.entries.push(['phase', value]);
          work.phase(value);
        },
        charge(units = 1) {
          if (trace.active) trace.entries.push(['charge', units]);
          work.charge(units);
        },
        due() {
          const result = work.due();
          if (trace.active) trace.entries.push(['due', result]);
          return result;
        },
        check(...args) {
          if (trace.active) trace.entries.push(['check', ...args]);
          work.check(...args);
        },
        async pause() {
          if (trace.active) trace.entries.push(['pause']);
          await work.pause();
          if (trace.active) trace.entries.push(['continued']);
        },
      };
    },
  };
});

afterEach(() => {
  trace.active = false;
  trace.entries = [];
  vi.restoreAllMocks();
});

async function traced(fixture) {
  trace.entries = [];
  trace.active = true;
  const outcome = await decoderOutcome(createPngAlphaDecoder(), fixture);
  trace.active = false;
  const chargeEvents = trace.entries.filter(([kind]) => kind === 'charge');
  return {
    id: fixture.id,
    fixtureSHA256: fixture.fixtureSHA256,
    outcome,
    traceSHA256: sha256(JSON.stringify(trace.entries)),
    chargeCalls: chargeEvents.length,
    totalUnits: chargeEvents.reduce((total, [, units]) => total + units, 0),
    pauseRequests: trace.entries.filter(([kind]) => kind === 'pause').length,
    currentChecks: trace.entries.filter(([kind]) => kind === 'current').length,
  };
}

describe('UNRUN actual PNG hot path correctness and differential controls', () => {
  it(
    'matches the independent generated corpus and emits exact charge/yield witnesses',
    async () => {
      vi.spyOn(performance, 'now').mockReturnValue(0);
      const records = [];
      for (const fixture of [...correctnessCorpus(), ...malformedCorpus()]) {
        const record = await traced(fixture);
        process.stdout.write('PNG_HOT_PATH_CASE_3649 ' + JSON.stringify(record) + '\n');
        expect(record.outcome, fixture.id).toEqual(fixture.expected);
        records.push(record);
      }
      process.stdout.write(
        'PNG_HOT_PATH_DIFFERENTIAL_3649 ' +
          JSON.stringify({
            schema: CORPUS_VERSION,
            scheduler: 'deterministic-immediate-idle-control',
            clock: 'constant-zero-control',
            runtime: process.versions,
            records,
          }) +
          '\n'
      );
    },
    CONTROL_TIMEOUT_MS
  );

  it(
    'emits every byte across repeated Adler reductions and ring wrap in all block types',
    async () => {
      vi.spyOn(performance, 'now').mockReturnValue(0);
      const raw = Buffer.from(
        Array.from({ length: WINDOW_BYTES * 2 + RING_WRAP_EXTRA_BYTES }, (_, index) =>
          index % BYTE_VARIATION_INTERVAL === 0
            ? Math.floor(index / BYTE_VARIATION_INTERVAL) % 256
            : 255
        )
      );
      for (const compression of ['stored', 'fixed', 'dynamic']) {
        const compressed = compressedFixture(raw, compression);
        let readAt = 0;
        const emitted = [];
        await inflatePng(
          () => compressed[readAt++] ?? null,
          raw.length,
          (byte) => emitted.push(byte),
          createPngWork(() => true)
        );
        expect(Buffer.from(emitted)).toEqual(raw);
      }
      const overlapping = Buffer.alloc(WINDOW_BYTES * 2 + RING_WRAP_EXTRA_BYTES, 255);
      const compressed = deflateSync(overlapping, { strategy: constants.Z_FIXED });
      let readAt = 0;
      const emitted = [];
      await inflatePng(
        () => compressed[readAt++] ?? null,
        overlapping.length,
        (byte) => emitted.push(byte),
        createPngWork(() => true)
      );
      expect(Buffer.from(emitted)).toEqual(overlapping);
    },
    CONTROL_TIMEOUT_MS
  );

  it('continues into every scanline after opaque ink and refuses a later invalid filter', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const fixture = malformedCorpus().find(({ id }) => id === 'invalid-scanline-filter');
    expect(fixture).toBeDefined();
    const outcome = await decoderOutcome(createPngAlphaDecoder(), fixture);
    expect(outcome).toEqual(fixture.expected);
  });

  it(
    'checks exact equality at both Adler reduction boundaries through actual inflate',
    async () => {
      vi.spyOn(performance, 'now').mockReturnValue(0);
      const boundaryA = Buffer.concat([
        Buffer.alloc(ADLER_A_PREFIX_BYTES, MAX_BYTE_VALUE),
        Buffer.from([ADLER_A_FINAL_BYTE]),
      ]);
      const boundaryB = Buffer.alloc(ADLER_MODULUS);
      for (const raw of [boundaryA, boundaryB]) {
        for (const compression of ['stored', 'fixed', 'dynamic']) {
          const compressed = compressedFixture(raw, compression);
          let readAt = 0;
          const emitted = [];
          await inflatePng(
            () => compressed[readAt++] ?? null,
            raw.length,
            (byte) => emitted.push(byte),
            createPngWork(() => true)
          );
          expect(Buffer.from(emitted)).toEqual(raw);
        }
      }
    },
    CONTROL_TIMEOUT_MS
  );

  it('retains the real CRC and Adler diagnostic stages after early opaque pixels', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const cases = malformedCorpus();
    for (const [id, stage, reason] of [
      ['bad-adler-after-opaque-ink', 'png-adler', 'png-integrity-adler'],
      ['bad-iend-crc-after-opaque-ink', 'png-crc', 'png-integrity-crc'],
    ]) {
      const fixture = cases.find((candidate) => candidate.id === id);
      let caught;
      try {
        await createPngAlphaDecoder().decode(fixture.base64, fixture.grid, () => true);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(pngReadFailureDiagnostic(caught, 'png-validation')).toEqual({ stage, reason });
    }
  });

  it('keeps exact 4096 due/check and 8192 synchronous boundaries', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const current = vi.fn(() => true);
    const work = createPngWork(current);
    work.charge(SLICE_UNITS - 1);
    expect(work.due()).toBe(false);
    expect(current).not.toHaveBeenCalled();
    work.charge();
    expect(work.due()).toBe(true);
    expect(current).toHaveBeenCalledTimes(1);
    await work.pause();
    expect(work.due()).toBe(false);
    work.charge(SYNCHRONOUS_UNITS);
    expect(() => work.charge()).toThrow('synchronous work limit');
    const deadlineWork = createPngWork(() => true);
    now = PNG_TIMEOUT_MS;
    expect(() => deadlineWork.charge(SLICE_UNITS)).toThrow('did not finish');
  });

  it('rejects cancellation at a cooperative boundary and releases the active owner', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const fixture = correctnessCorpus().find(({ compression }) => compression === 'stored');
    const decoder = createPngAlphaDecoder();
    let checks = 0;
    const cancelled = await decoderOutcome(decoder, fixture, () => ++checks < CANCEL_AT_CHECK);
    expect(cancelled).toEqual({
      status: 'rejected',
      message: 'Picture observation was cancelled. Your drawing is still here.',
    });
    await expect(decoder.decode(fixture.base64, fixture.grid, () => true)).resolves.toBe(
      fixture.expected.empty
    );
  });

  it('rejects a real monotonic deadline without relaxing production limits', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const fixture = correctnessCorpus().find(({ compression }) => compression === 'stored');
    const decoder = createPngAlphaDecoder();
    let checks = 0;
    const outcome = await decoderOutcome(decoder, fixture, () => {
      if (++checks === DEADLINE_AT_CHECK) now = PNG_TIMEOUT_MS;
      return true;
    });
    expect(outcome).toEqual({
      status: 'rejected',
      message: 'Picture observation did not finish. Your drawing is still here.',
    });
  });
});
