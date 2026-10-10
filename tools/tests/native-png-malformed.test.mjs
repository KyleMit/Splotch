import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { createPngAlphaDecoder } from '../../experiments/native-architecture/src/drawing/pngAlpha.ts';
import {
  bitWriter,
  fixedSymbol,
  legalDynamicFence,
  pngFromZlib,
  rgbaPng,
  zlibEnvelope,
} from './native-png-fixtures.mjs';

const grid = { width: 2, height: 2 };
const decode = (input) => createPngAlphaDecoder().decode(input, grid, () => true);
function fixed(payload) {
  const w = bitWriter();
  w.bits(1, 1);
  w.bits(1, 2);
  payload(w);
  return zlibEnvelope(w.bytes());
}
describe('additional bounded PNG malformed controls', () => {
  it('rejects an incomplete code-length tree', async () => {
    const w = bitWriter();
    w.bits(1, 1);
    w.bits(2, 2);
    w.bits(0, 5);
    w.bits(0, 5);
    w.bits(0, 4);
    w.bits(0, 3);
    w.bits(0, 3);
    w.bits(0, 3);
    w.bits(1, 3);
    await expect(decode(pngFromZlib(zlibEnvelope(w.bytes())).toString('base64'))).rejects.toThrow();
  });
  it.each([286, 287])('rejects reserved literal/length symbol %i', async (symbol) => {
    const zlib = fixed((w) => fixedSymbol(w, symbol));
    await expect(decode(pngFromZlib(zlib).toString('base64'))).rejects.toThrow();
  });
  it.each([30, 31])('rejects reserved distance symbol %i', async (symbol) => {
    const zlib = fixed((w) => {
      fixedSymbol(w, 257);
      w.code(symbol, 5);
    });
    await expect(decode(pngFromZlib(zlib).toString('base64'))).rejects.toThrow();
  });
  it('rejects an LZ distance before any history has been produced', async () => {
    const zlib = fixed((w) => {
      fixedSymbol(w, 268);
      w.bits(1, 1);
      w.code(0, 5);
      fixedSymbol(w, 256);
    });
    expect(() => inflateSync(zlib)).toThrow();
    await expect(decode(pngFromZlib(zlib).toString('base64'))).rejects.toThrow();
  });
  it.each([8, 9, 12, 16, 20, 25, 29, 32, 33, 34])(
    'rejects a PNG truncated at chunk/header boundary %i',
    async (position) => {
      await expect(
        decode(rgbaPng(2, 2).subarray(0, position).toString('base64'))
      ).rejects.toThrow();
    }
  );
  it('rejects encoded input above the existing cap before reading PNG bytes', async () => {
    const input = 'A'.repeat(64 * 1024 * 1024 + 1);
    await expect(decode(input)).rejects.toThrow('This picture is too large to check.');
  });
  it('retains the specified 32-distance-code fixture and its independent Node oracle refusal', () => {
    const f = legalDynamicFence();
    expect(() => inflateSync(f.compressed)).toThrow('too many length or distance symbols');
  });
  it('measures an independently decoded legal dynamic-header/tiny-IDAT/CRLF work-fence vector', async () => {
    const f = legalDynamicFence(29);
    expect(inflateSync(f.compressed)).toEqual(Buffer.alloc(18));
    const started = performance.now();
    const outcome = await decode(f.base64).then(
      (empty) => ({ status: 'accepted', empty }),
      (error) => ({ status: 'resource-policy-refused', message: error.message })
    );
    process.stdout.write(
      'LEGAL_DYNAMIC_WORK_FENCE ' +
        JSON.stringify({
          ...outcome,
          independentOracle: 'Node inflateSync accepted 30-distance-code variant',
          header: { HLIT: 29, HDIST: 29, HCLEN: 15, explicitLengths: 316 },
          elapsedMs: performance.now() - started,
          encodedCharacters: f.base64.length,
          pngBytes: f.png.length,
        }) +
        '\n'
    );
    expect([
      { status: 'accepted', empty: true },
      {
        status: 'resource-policy-refused',
        message: 'Picture observation exceeded its synchronous work limit.',
      },
    ]).toContainEqual(outcome);
  });
});
