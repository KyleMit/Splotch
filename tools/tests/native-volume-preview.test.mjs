import { describe, expect, it, vi } from 'vitest';

import {
  createVolumePreview,
  VOLUME_PREVIEW_SCRATCH_GAIN,
} from '../../experiments/native-architecture/src/audio/volumePreview.ts';

async function settle() {
  for (let tick = 0; tick < 3; tick++) await Promise.resolve();
}

function fixture() {
  const loop = { start: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
  const load = vi.fn(async () => loop);
  const preview = createVolumePreview(load);
  return { loop, load, preview };
}

const gainAt = (volume) => VOLUME_PREVIEW_SCRATCH_GAIN * (volume / 50);

describe('the Volume preview', () => {
  it('loads on the first begin, follows each value, stops on end and reuses the loop', async () => {
    const f = fixture();
    f.preview.setAllowed(true);
    f.preview.begin(50);
    await settle();
    expect(f.load).toHaveBeenCalledOnce();
    expect(f.loop.start).toHaveBeenCalledOnce();
    expect(f.loop.setVolume).toHaveBeenLastCalledWith(gainAt(50));
    f.preview.update(100);
    expect(f.loop.setVolume).toHaveBeenLastCalledWith(gainAt(100));
    f.preview.end();
    expect(f.loop.stop).toHaveBeenCalledOnce();
    f.preview.update(10);
    expect(f.loop.setVolume).toHaveBeenCalledTimes(2);
    f.preview.begin(20);
    expect(f.load).toHaveBeenCalledOnce();
    expect(f.loop.start).toHaveBeenCalledTimes(2);
    expect(f.loop.setVolume).toHaveBeenLastCalledWith(gainAt(20));
  });

  it('starts nothing while sound is off or the app is away, and releases the loop on either', async () => {
    const f = fixture();
    f.preview.begin(50);
    await settle();
    expect(f.load).not.toHaveBeenCalled();
    f.preview.setAllowed(true);
    f.preview.begin(50);
    await settle();
    f.preview.setForeground(false);
    expect(f.loop.dispose).toHaveBeenCalledOnce();
    f.preview.begin(50);
    await settle();
    expect(f.load).toHaveBeenCalledOnce();
    f.preview.setForeground(true);
    f.preview.begin(50);
    await settle();
    expect(f.load).toHaveBeenCalledTimes(2);
    f.preview.setAllowed(false);
    expect(f.loop.dispose).toHaveBeenCalledTimes(2);
  });

  it('drops a loop that arrives after the drag was released or the owner disposed', async () => {
    const f = fixture();
    f.preview.setAllowed(true);
    f.preview.begin(50);
    f.preview.end();
    await settle();
    expect(f.loop.start).not.toHaveBeenCalled();
    f.preview.dispose();
    expect(f.loop.dispose).toHaveBeenCalledOnce();
    f.preview.begin(50);
    await settle();
    expect(f.load).toHaveBeenCalledOnce();
  });
});
