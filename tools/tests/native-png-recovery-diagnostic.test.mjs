import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPngRecovery } from '../../experiments/native-architecture/src/export/pngRecovery.ts';
import {
  awaitPngReadStage,
  inPngReadStage,
  pngReadFailureDiagnostic,
  reportPngReadFailure,
} from '../../experiments/native-architecture/src/export/pngReadDiagnostic.ts';
import { serializeHeldPngs } from '../../experiments/native-architecture/src/export/heldPng.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { pngChunk, rgbaPng } from './native-png-fixtures.mjs';

const PREFIX = 'SPLOTCH_PNG_READ_DIAGNOSTIC_3629 ';
const PRIVATE_MATERIAL = 'private://archive/path?credential=do-not-print-png-base64';
const PNG = rgbaPng(2, 2, 255);
const archive = (png = PNG) =>
  serializeHeldPngs([
    { id: 'png-1-a', filename: 'splotch-png-1-a.png', base64: png.toString('base64') },
  ]);

function fixture(snapshot) {
  let state;
  const read = vi.fn(async () => snapshot);
  const write = vi.fn();
  const deliver = vi.fn();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const owner = createPngRecovery({ read, write }, deliver, (next) => {
    state = next;
  });
  return {
    owner,
    read,
    write,
    deliver,
    log,
    state: () => state,
    diagnostic: () => {
      const records = log.mock.calls.filter(([message]) => message.startsWith(PREFIX));
      expect(records).toHaveLength(1);
      const [message] = records[0];
      expect(message.startsWith(PREFIX)).toBe(true);
      return JSON.parse(message.slice(PREFIX.length));
    },
  };
}

function assertPreserved(held) {
  expect(held.state().status).toBe('unreadable');
  expect(held.state().notice).toBe(
    'Held PNGs could not be read. Existing recovery data has not been replaced.'
  );
  expect(held.read).toHaveBeenCalledOnce();
  expect(held.write).not.toHaveBeenCalled();
  expect(held.deliver).not.toHaveBeenCalled();
}

afterEach(() => vi.restoreAllMocks());

describe('temporary original-read diagnostic overlay', () => {
  it('labels malformed JSON through the real restore while retaining the failure and data', async () => {
    const held = fixture('not JSON ' + PRIVATE_MATERIAL);
    await held.owner.restore();
    assertPreserved(held);
    expect(held.diagnostic()).toEqual({ stage: 'archive-json', reason: 'syntax' });
    expect(JSON.stringify(held.log.mock.calls)).not.toContain(PRIVATE_MATERIAL);
  });

  it('labels the unchanged production decoder deadline without another read or decode', async () => {
    const held = fixture(archive());
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(PNG_TIMEOUT_MS);
    await held.owner.restore();
    assertPreserved(held);
    expect(held.diagnostic()).toEqual({ stage: 'png-validation', reason: 'decode-deadline' });
  });

  it('distinguishes an actual IEND CRC failure after valid pixels', async () => {
    const corrupted = Buffer.from(PNG);
    corrupted[corrupted.length - 1] ^= 1;
    const held = fixture(archive(corrupted));
    await held.owner.restore();
    assertPreserved(held);
    expect(held.diagnostic()).toEqual({ stage: 'png-crc', reason: 'png-integrity-crc' });
  });

  it('distinguishes actual Adler failure with a valid enclosing IDAT CRC', async () => {
    const corrupted = Buffer.from(PNG);
    const compressed = Buffer.from(PNG.subarray(41, 41 + PNG.readUInt32BE(33)));
    compressed[compressed.length - 1] ^= 1;
    pngChunk('IDAT', compressed).copy(corrupted, 33);
    const held = fixture(archive(corrupted));
    await held.owner.restore();
    assertPreserved(held);
    expect(held.diagnostic()).toEqual({ stage: 'png-adler', reason: 'png-integrity-adler' });
  });

  it('preserves the innermost tagged storage stage without exposing unknown exceptions', async () => {
    let error;
    try {
      await awaitPngReadStage('archive-text', async () =>
        inPngReadStage('directory-list', () => {
          throw new Error(PRIVATE_MATERIAL);
        })
      );
    } catch (caught) {
      error = caught;
    }
    const held = fixture(null);
    held.read.mockRejectedValueOnce(error);
    await held.owner.restore();
    assertPreserved(held);
    expect(held.diagnostic()).toEqual({ stage: 'directory-list', reason: 'other' });
    expect(JSON.stringify(held.log.mock.calls)).not.toContain(PRIVATE_MATERIAL);
  });

  it('maps arbitrary thrown material to fixed output and contains diagnostic transport failure', () => {
    expect(pngReadFailureDiagnostic({ secret: PRIVATE_MATERIAL }, 'owner-merge')).toEqual({
      stage: 'owner-merge',
      reason: 'other',
    });
    vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error(PRIVATE_MATERIAL);
    });
    expect(() => reportPngReadFailure(new Error(PRIVATE_MATERIAL), 'archive-text')).not.toThrow();
  });

  it('retains a valid archive without writing, sharing, or emitting a failure diagnostic', async () => {
    const held = fixture(archive());
    await held.owner.restore();
    expect(held.state().status).toBe('ready');
    expect(held.state().pictures).toHaveLength(1);
    expect(held.write).not.toHaveBeenCalled();
    expect(held.deliver).not.toHaveBeenCalled();
    expect(held.log).not.toHaveBeenCalled();
  });
});
