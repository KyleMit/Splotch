// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPngRecovery } from '../../experiments/native-architecture/src/export/pngRecovery.ts';
import { pngRecoveryPlatform } from '../../experiments/native-architecture/src/platform/pngRecovery.web.ts';
import {
  heldPngFilename,
  serializeHeldPngs,
} from '../../experiments/native-architecture/src/export/heldPng.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

const PNG = rgbaPng(2, 2).toString('base64');
const RECORD = { id: 'png-1-a', filename: heldPngFilename('png-1-a'), base64: PNG };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('actual browser PNG recovery adapter', () => {
  it('preserves bytes and stable download name and keeps the unconfirmed request through a restart', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      expect(this.download).toBe(RECORD.filename);
      expect(this.href).toBe(`data:image/png;base64,${PNG}`);
    });
    await pngRecoveryPlatform.storage.write(serializeHeldPngs([RECORD]));
    let state;
    const owner = createPngRecovery(
      pngRecoveryPlatform.storage,
      pngRecoveryPlatform.deliver,
      (next) => {
        state = next;
      }
    );
    await owner.restore();
    expect(click).not.toHaveBeenCalled();
    await owner.retry();
    expect(click).toHaveBeenCalledOnce();
    expect(state.pictures[0].attempt.status).toBe('download-requested');
    expect(JSON.parse(await pngRecoveryPlatform.storage.read()).pictures).toEqual([RECORD]);
    owner.dispose();
    const restarted = createPngRecovery(
      pngRecoveryPlatform.storage,
      pngRecoveryPlatform.deliver,
      (next) => {
        state = next;
      }
    );
    await restarted.restore();
    expect(click).toHaveBeenCalledOnce();
    expect(state.pictures).toHaveLength(1);
    await restarted.dismiss(RECORD.id);
    expect(JSON.parse(await pngRecoveryPlatform.storage.read()).pictures).toEqual([]);
  });

  it('checks ownership immediately before clicking a download', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await expect(pngRecoveryPlatform.deliver(RECORD, () => false)).rejects.toThrow('cancelled');
    expect(click).not.toHaveBeenCalled();
  });
});
