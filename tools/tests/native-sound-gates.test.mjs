import { describe, expect, it, vi } from 'vitest';
import { createDrawingAudio } from '../../experiments/native-architecture/src/audio/drawingAudio.ts';
import { createContactSound } from '../../experiments/native-architecture/src/audio/contactSound.ts';
import { createClearSound } from '../../experiments/native-architecture/src/audio/pageTurnSound.ts';
import { applySoundChoices } from '../../experiments/native-architecture/src/audio/soundGates.ts';

const ORIGIN = { x: 10, y: 20 };

async function settle() {
  for (let tick = 0; tick < 3; tick++) await Promise.resolve();
}

function owners() {
  const loop = { start: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
  const turn = { play: vi.fn(), dispose: vi.fn() };
  const audio = createDrawingAudio(
    vi.fn(async () => loop),
    () => {},
    () => {}
  );
  const contacts = createContactSound(audio);
  const clear = createClearSound(vi.fn(async () => turn));
  return { audio, contacts, clear, loop, turn };
}

const choices = (overrides) => ({
  soundEnabled: true,
  soundVolume: 50,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
  ...overrides,
});

async function drawingLoads(settings) {
  const f = owners();
  applySoundChoices(f, settings);
  f.audio.begin(ORIGIN, 100);
  await settle();
  return f.loop.start.mock.calls.length > 0;
}

async function clearPlays(settings) {
  const f = owners();
  applySoundChoices(f, settings);
  f.clear.start();
  await settle();
  f.clear.commit();
  return f.turn.play.mock.calls.flat();
}

describe('the Settings sound choices gate the two sound sources', () => {
  it('plays drawing sound only while Sound and Drawing are both on', async () => {
    expect(await drawingLoads(choices({}))).toBe(true);
    expect(await drawingLoads(choices({ drawingSoundEnabled: false }))).toBe(false);
    expect(await drawingLoads(choices({ soundEnabled: false }))).toBe(false);
    expect(await drawingLoads(choices({ deleteSoundEnabled: false }))).toBe(true);
  });

  it('plays the clear page turn only while Sound and Deleting are both on, at the volume', async () => {
    expect(await clearPlays(choices({}))).toEqual([1]);
    expect(await clearPlays(choices({ soundVolume: 100 }))).toEqual([2]);
    expect(await clearPlays(choices({ deleteSoundEnabled: false }))).toEqual([]);
    expect(await clearPlays(choices({ soundEnabled: false }))).toEqual([]);
    expect(await clearPlays(choices({ drawingSoundEnabled: false }))).toEqual([1]);
  });

  it('ends a stroke that is sounding when Drawing stops making sound', async () => {
    const f = owners();
    applySoundChoices(f, choices({}));
    const contact = f.contacts.begin(ORIGIN, 100);
    f.audio.begin(ORIGIN, 100);
    await settle();
    f.loop.setVolume.mockClear();
    applySoundChoices(f, choices({ drawingSoundEnabled: false }));
    contact.sample({ x: 200, y: 20 }, 200);
    expect(f.loop.dispose).toHaveBeenCalledOnce();
    expect(f.loop.setVolume).not.toHaveBeenCalled();
  });
});
