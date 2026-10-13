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
// Version 7 predates the external-links policy, which reads back at the native default.
const MIGRATED_POLICIES = { ...CURRENT.parentPolicies, externalLinks: 'always' };
const CONTROLS = [
  ['undoButtonEnabled', 'setUndoButtonEnabled'],
  ['strokeWidthControlEnabled', 'setStrokeWidthControlEnabled'],
  ['toolDrawerEnabled', 'setToolDrawerEnabled'],
  ['screenshotEnabled', 'setScreenshotEnabled'],
];
// A record from before the Tool Drawer switch and the Camera button were stored, with the three-step
// sound level version 13 replaced.
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
const DRAWER_FIELDS = ['toolDrawerEnabled', 'screenshotEnabled'];
// The version 13 record the current owner would have written, in its saved key order.
async function version13Record() {
  const f = fixture();
  await f.owner.load();
  await f.owner.setUndoButtonEnabled(false);
  const current = JSON.parse(f.stored());
  for (const field of DRAWER_FIELDS) delete current[field];
  return { ...current, version: 13 };
}
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
  it('migrates a version 13 record to a shown drawer and camera, keeping its choices', async () => {
    const version13 = await version13Record();
    expect(parseSoundSettings(JSON.stringify(version13))).toEqual({
      ...version13,
      version: 14,
      toolDrawerEnabled: true,
      screenshotEnabled: true,
    });
  });
  it('carries a version 11 record through every step to version 14', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_11))).toMatchObject({
      version: 14,
      undoButtonEnabled: false,
      toolDrawerEnabled: true,
      screenshotEnabled: true,
      toolbarStyle: 'buttons',
      parentPolicies: MIGRATED_POLICIES,
    });
  });
  it.each(DRAWER_FIELDS)(
    'rejects %s in a version 13 record and its absence from a version 14 one',
    async (field) => {
      const version13 = await version13Record();
      expect(() => parseSoundSettings(JSON.stringify({ ...version13, [field]: false }))).toThrow(
        'not in the saved format'
      );
      const current = {
        ...version13,
        version: 14,
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
        parentPolicies: MIGRATED_POLICIES,
        soundVolume: mask & 1 ? 100 : 50,
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
        parentPolicies: MIGRATED_POLICIES,
        version: 14,
        saveOnDeleteEnabled: false,
        buttonScale: 100,
        reduceMotion: 'system',
        whatsNewSeen: null,
        pencilEraserEnabled: true,
        applePencilSeen: false,
        toolbarStyle: 'buttons',
        toolDrawerEnabled: true,
        screenshotEnabled: true,
        orientation: 'portrait',
        soundVolume: 50,
        drawingSoundEnabled: true,
        deleteSoundEnabled: true,
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
        parentPolicies: MIGRATED_POLICIES,
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
      await f.owner.setSoundVolume(25);
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
        parentPolicies: MIGRATED_POLICIES,
      });
    }
  );
});
