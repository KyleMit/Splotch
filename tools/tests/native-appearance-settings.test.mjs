import { describe, expect, it, vi } from 'vitest';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { resolveAppearance } from '../../experiments/native-architecture/src/settings/appearance.ts';

const parentDefaults = {
  aiEnabled: false,
  parentPolicies: {
    ai: 'always',
    imageReport: 'always',
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: true,
  soundLevel: 'medium',
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
};
const choices = {
  soundEnabled: false,
  strokeWidth: 'thin',
  eraserWidth: 'thick',
  selectedColor: '#123ABC',
  customColors: ['#123ABC'],
};
function fixture(snapshot = null) {
  const changes = [];
  const storage = { read: vi.fn(async () => snapshot), write: vi.fn(async () => {}) };
  return { changes, storage, owner: createSoundSettings(storage, (state) => changes.push(state)) };
}
function pending() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('persisted candidate drawing appearance', () => {
  it.each([
    { version: 1, soundEnabled: false },
    { version: 2, soundEnabled: false, strokeWidth: 'thin', eraserWidth: 'thick' },
    { version: 3, ...choices },
    { version: 4, ...choices, appearance: 'system' },
  ])('defaults an older candidate record to System without losing its choices: $version', (old) => {
    const parsed = parseSoundSettings(JSON.stringify(old));
    const { version: _version, ...retained } = old;
    expect(parsed).toMatchObject({
      version: 9,
      appearance: 'system',
      ...retained,
      ...parentDefaults,
    });
  });
  it.each(['light', 'dark', 'system'])(
    'round trips the exact %s preference and other settings',
    async (appearance) => {
      const snapshot = JSON.stringify({ version: 9, ...choices, appearance, ...parentDefaults });
      expect(parseSoundSettings(snapshot)).toEqual({
        version: 9,
        saveOnDeleteEnabled: false,
        ...choices,
        appearance,
        ...parentDefaults,
      });
      const f = fixture(snapshot);
      await f.owner.load();
      expect(f.changes.at(-1)).toMatchObject({ ...choices, appearance, saved: true });
      expect(f.storage.write).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, null, 'automatic', 1, {}, []])(
    'rejects an invalid current appearance %s',
    (appearance) => {
      expect(() =>
        parseSoundSettings(JSON.stringify({ version: 4, ...choices, appearance }))
      ).toThrow('Appearance');
    }
  );
  it('retains a failed preference immediately and retries its exact complete snapshot', async () => {
    const f = fixture(JSON.stringify({ version: 3, ...choices }));
    await f.owner.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const writing = f.owner.setAppearance('dark');
    expect(f.changes.at(-1)).toMatchObject({ status: 'saving', ...choices, appearance: 'dark' });
    await f.owner.setAppearance('light');
    expect(f.storage.write).toHaveBeenCalledTimes(1);
    save.reject(new Error('disk full'));
    await writing;
    expect(f.changes.at(-1)).toMatchObject({ status: 'ready', appearance: 'dark', saved: false });
    expect(f.changes.at(-1).message).toContain('could not be saved');
    await f.owner.retrySave();
    const exact = JSON.stringify({ version: 9, ...choices, appearance: 'dark', ...parentDefaults });
    expect(f.storage.write.mock.calls).toEqual([[exact], [exact]]);
    expect(f.changes.at(-1)).toMatchObject({ appearance: 'dark', saved: true });
  });
  it('keeps a preference session-only after a failed read until explicit retry', async () => {
    const f = fixture();
    f.storage.read.mockRejectedValue(new Error('permission denied'));
    await f.owner.load();
    await f.owner.setAppearance('dark');
    expect(f.storage.write).not.toHaveBeenCalled();
    expect(f.changes.at(-1)).toMatchObject({
      soundEnabled: false,
      appearance: 'dark',
      saved: false,
    });
    expect(f.changes.at(-1).message).toContain('could not be read');
    await f.owner.retrySave();
    expect(f.storage.write).not.toHaveBeenCalled();
    await f.owner.retryRead();
    expect(f.storage.write).not.toHaveBeenCalled();
    f.storage.read.mockResolvedValueOnce(
      JSON.stringify({ version: 4, ...choices, appearance: 'light' })
    );
    await f.owner.retryRead();
    expect(f.changes.at(-1)).toMatchObject({ appearance: 'light', saved: true, ...parentDefaults });
    expect(f.storage.write).not.toHaveBeenCalled();
    await f.owner.setAppearance('dark');
    expect(JSON.parse(f.storage.write.mock.calls[0][0])).toEqual({
      version: 9,
      saveOnDeleteEnabled: false,
      ...choices,
      appearance: 'dark',
      ...parentDefaults,
    });
    expect(f.storage.read).toHaveBeenCalledTimes(3);
  });
  it('ignores selection before hydration and rejects unknown preference input after hydration', async () => {
    const f = fixture();
    await f.owner.setAppearance('dark');
    expect(f.storage.write).not.toHaveBeenCalled();
    await f.owner.load();
    await expect(f.owner.setAppearance('automatic')).rejects.toThrow('Appearance');
    expect(f.storage.write).not.toHaveBeenCalled();
  });
  it('does not publish a late appearance save after disposal', async () => {
    const f = fixture();
    await f.owner.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const writing = f.owner.setAppearance('dark');
    f.owner.dispose();
    save.resolve();
    await writing;
    expect(f.changes.at(-1)).toMatchObject({ status: 'saving', appearance: 'dark' });
  });
  it.each([
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
  ])('resolves preference %s and OS %s to %s', (preference, system, expected) => {
    expect(resolveAppearance(preference, system)).toBe(expected);
  });
});
