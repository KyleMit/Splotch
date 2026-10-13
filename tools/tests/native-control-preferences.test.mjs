import { describe, expect, it, vi } from 'vitest';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';

const CURRENT = {
  version: 7,
  soundEnabled: false,
  strokeWidth: 'thin',
  eraserWidth: 'thick',
  selectedColor: 'Blue',
  customColors: [],
  appearance: 'dark',
  aiEnabled: true,
  parentPolicies: {
    ai: 'never',
    imageReport: 'session',
    feedback: 'always',
    parentCenter: 'session',
  },
  coloringBookEnabled: false,
};
const CONTROLS = [
  ['undoButtonEnabled', 'setUndoButtonEnabled'],
  ['strokeWidthControlEnabled', 'setStrokeWidthControlEnabled'],
  ['toolDrawerEnabled', 'setToolDrawerEnabled'],
  ['screenshotEnabled', 'setScreenshotEnabled'],
];
// The last schema before the Tool Drawer switch and the Camera button were stored.
const VERSION_11 = {
  ...CURRENT,
  version: 11,
  soundLevel: 'medium',
  undoButtonEnabled: false,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: null,
  pencilEraserEnabled: true,
  applePencilSeen: false,
};
function fixture(snapshot = JSON.stringify(CURRENT)) {
  let stored = snapshot;
  const changes = [];
  const storage = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  const owner = createSoundSettings(storage, (next) => changes.push(next));
  return { owner, storage, changes, stored: () => stored };
}

describe('parent drawing control preferences', () => {
  it('migrates a version 11 snapshot to a shown drawer and camera, keeping its choices', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_11))).toEqual({
      ...VERSION_11,
      version: 12,
      toolDrawerEnabled: true,
      screenshotEnabled: true,
    });
  });
  it.each(['toolDrawerEnabled', 'screenshotEnabled'])(
    'rejects %s in a version 11 snapshot and its absence from a version 12 one',
    (field) => {
      expect(() => parseSoundSettings(JSON.stringify({ ...VERSION_11, [field]: false }))).toThrow(
        'not in the saved format'
      );
      const current = {
        ...VERSION_11,
        version: 12,
        toolDrawerEnabled: true,
        screenshotEnabled: true,
      };
      expect(parseSoundSettings(JSON.stringify({ ...current, [field]: false }))).toMatchObject({
        [field]: false,
      });
      const { [field]: _dropped, ...missing } = current;
      expect(() => parseSoundSettings(JSON.stringify(missing))).toThrow('not in the saved format');
    }
  );
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    'reads finite optional current extension set %s without rewriting it',
    async (mask) => {
      const extensions = {
        ...(mask & 1 ? { soundLevel: 'loud' } : {}),
        ...(mask & 2 ? { undoButtonEnabled: false } : {}),
        ...(mask & 4 ? { strokeWidthControlEnabled: false } : {}),
      };
      const f = fixture(JSON.stringify({ ...CURRENT, ...extensions }));
      await f.owner.load();
      const { version: _version, ...choices } = CURRENT;
      expect(f.changes.at(-1)).toMatchObject({
        ...choices,
        soundLevel: mask & 1 ? 'loud' : 'medium',
        undoButtonEnabled: !(mask & 2),
        strokeWidthControlEnabled: !(mask & 4),
        saved: true,
      });
      expect(f.storage.write).not.toHaveBeenCalled();
    }
  );
  it.each(CONTROLS)('rejects invalid %s values and noncanonical extensions', (field) => {
    for (const invalid of [null, 0, 'false', [], {}]) {
      expect(() => parseSoundSettings(JSON.stringify({ ...CURRENT, [field]: invalid }))).toThrow(
        'Drawing control'
      );
    }
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...CURRENT, [field]: false, unknown: true }))
    ).toThrow();
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...CURRENT, [field]: false, soundLevel: 'quiet' }))
    ).toThrow();
    const stored = JSON.stringify({ ...CURRENT, [field]: false });
    expect(() => parseSoundSettings(stored.slice(0, -1) + `,"${field}":true}`)).toThrow();
  });
  it.each(CONTROLS)(
    'persists and retries %s without changing ink preferences or parent protection',
    async (field, method) => {
      const f = fixture();
      await f.owner.load();
      f.storage.write.mockRejectedValueOnce(new Error('disk full'));
      await f.owner[method](false);
      expect(f.changes.at(-1)).toMatchObject({ [field]: false, saved: false });
      await f.owner.retrySave();
      expect(f.storage.write.mock.calls[1]).toEqual(f.storage.write.mock.calls[0]);
      expect(parseSoundSettings(f.stored())).toEqual({
        ...CURRENT,
        version: 12,
        saveOnDeleteEnabled: false,
        buttonScale: 100,
        reduceMotion: 'system',
        whatsNewSeen: null,
        pencilEraserEnabled: true,
        applePencilSeen: false,
        toolDrawerEnabled: true,
        screenshotEnabled: true,
        orientation: 'portrait',
        soundLevel: 'medium',
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        [field]: false,
      });
      const reopened = fixture(f.stored());
      await reopened.owner.load();
      expect(reopened.changes.at(-1)).toMatchObject({
        [field]: false,
        saved: true,
        strokeWidth: 'thin',
        eraserWidth: 'thick',
        parentPolicies: CURRENT.parentPolicies,
      });
      await reopened.owner[method](true);
      expect(parseSoundSettings(reopened.stored())).toMatchObject({
        [field]: true,
        strokeWidth: 'thin',
        eraserWidth: 'thick',
      });
    }
  );
  it.each(CONTROLS)(
    'blocks %s before hydration, during save, and after disposal',
    async (field, method) => {
      const f = fixture();
      await f.owner[method](false);
      expect(f.storage.write).not.toHaveBeenCalled();
      await f.owner.load();
      let finish;
      f.storage.write.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const saving = f.owner[method](false);
      expect(f.changes.at(-1)).toMatchObject({ status: 'saving', [field]: false });
      await f.owner[method](true);
      await f.owner.setSoundLevel('quiet');
      expect(f.storage.write).toHaveBeenCalledOnce();
      f.owner.dispose();
      finish();
      await saving;
      expect(f.changes.at(-1)).toMatchObject({ status: 'saving', [field]: false });
      await f.owner[method](true);
      expect(f.storage.write).toHaveBeenCalledOnce();
    }
  );
  it.each(CONTROLS)(
    'keeps %s session-only after a failed read until an explicit successful reread',
    async (field, method) => {
      const f = fixture();
      f.storage.read.mockRejectedValueOnce(new Error('denied'));
      await f.owner.load();
      await f.owner[method](false);
      await f.owner.retrySave();
      expect(f.storage.write).not.toHaveBeenCalled();
      expect(f.changes.at(-1)).toMatchObject({ [field]: false, saved: false, aiEnabled: false });
      await f.owner.retryRead();
      expect(f.changes.at(-1)).toMatchObject({ [field]: true, saved: true });
      await expect(f.owner[method]('false')).rejects.toThrow('Drawing control');
      await f.owner[method](false);
      expect(f.storage.write).toHaveBeenCalledOnce();
      expect(parseSoundSettings(f.stored())).toMatchObject({
        [field]: false,
        parentPolicies: CURRENT.parentPolicies,
      });
    }
  );
});
