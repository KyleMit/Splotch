import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import {
  AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE,
  ORIENTATION_CHOICES,
  ORIENTATION_LABELS,
} from '../../experiments/native-architecture/src/settings/orientation.ts';
import { defaultOrientation as webDefaultOrientation } from '../../experiments/native-architecture/src/platform/orientationDefault.web.ts';

const repoRoot = join(import.meta.dirname, '../..');
const VERSION_7 = {
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
  soundLevel: 'loud',
  undoButtonEnabled: false,
  strokeWidthControlEnabled: true,
};
const VERSION_8 = { ...VERSION_7, version: 8, orientation: 'landscape' };
// Schema 12 reads the loud level as the volume that plays at its gain, with both sources on.
const { soundLevel: _soundLevel7, ...VERSION_7_CHOICES } = VERSION_7;
const MIGRATED_7 = {
  ...VERSION_7_CHOICES,
  soundVolume: 100,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
};
// Version 7 predates the external-links policy, which reads back at the native default.
const MIGRATED_POLICIES = { ...VERSION_7.parentPolicies, externalLinks: 'always' };

function fixture(snapshot) {
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

afterEach(() => vi.unstubAllGlobals());

describe('persisted orientation choice', () => {
  it('migrates a version 7 record to the shipping Portrait default without rewriting it', async () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_7))).toEqual({
      ...MIGRATED_7,
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
    });
    const f = fixture(JSON.stringify(VERSION_7));
    await f.owner.load();
    expect(f.changes.at(-1)).toMatchObject({ orientation: 'portrait', soundVolume: 100 });
    expect(f.storage.write).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 4, 5, 6])('defaults legacy schema %s to Portrait', (version) => {
    const old = { version, soundEnabled: true };
    if (version >= 2) Object.assign(old, { strokeWidth: 'thin', eraserWidth: 'thick' });
    if (version >= 3) Object.assign(old, { selectedColor: 'Blue', customColors: [] });
    if (version >= 4) Object.assign(old, { appearance: 'light' });
    if (version >= 5)
      Object.assign(old, {
        aiEnabled: false,
        parentPolicies: { ai: 'always', feedback: 'always', parentCenter: 'always' },
      });
    if (version >= 6) Object.assign(old, { coloringBookEnabled: true });
    expect(parseSoundSettings(JSON.stringify(old))).toMatchObject({
      version: 14,
      orientation: 'portrait',
    });
  });

  it.each(ORIENTATION_CHOICES)(
    'round trips %s exactly and restores it on relaunch',
    async (choice) => {
      const f = fixture(JSON.stringify(VERSION_7));
      await f.owner.load();
      await f.owner.setOrientation(choice);
      expect(JSON.parse(f.stored())).toEqual({
        ...MIGRATED_7,
        parentPolicies: MIGRATED_POLICIES,
        version: 14,
        orientation: choice,
        saveOnDeleteEnabled: false,
        buttonScale: 100,
        reduceMotion: 'system',
        whatsNewSeen: null,
        pencilEraserEnabled: true,
        applePencilSeen: false,
        toolbarStyle: 'buttons',
        toolDrawerEnabled: true,
        screenshotEnabled: true,
      });
      const reopened = fixture(f.stored());
      await reopened.owner.load();
      expect(reopened.changes.at(-1)).toMatchObject({ orientation: choice, saved: true });
      expect(reopened.storage.write).not.toHaveBeenCalled();
    }
  );

  it('retains a failed orientation choice for the session and retries its exact snapshot', async () => {
    const f = fixture(JSON.stringify(VERSION_8));
    await f.owner.load();
    f.storage.write.mockRejectedValueOnce(new Error('disk full'));
    await f.owner.setOrientation('auto');
    expect(f.changes.at(-1)).toMatchObject({ orientation: 'auto', saved: false });
    await f.owner.retrySave();
    expect(f.storage.write.mock.calls[1]).toEqual(f.storage.write.mock.calls[0]);
    expect(JSON.parse(f.stored()).orientation).toBe('auto');
  });

  it('rejects invalid, missing and out-of-version orientation records', async () => {
    for (const invalid of ['Portrait', 'any', '', null, 1, {}, ['auto']]) {
      expect(() =>
        parseSoundSettings(JSON.stringify({ ...VERSION_8, orientation: invalid }))
      ).toThrow('Orientation');
    }
    const { orientation: _orientation, ...missing } = VERSION_8;
    expect(() => parseSoundSettings(JSON.stringify(missing))).toThrow();
    const { soundLevel: _soundLevel, ...withoutLevel } = VERSION_8;
    expect(() => parseSoundSettings(JSON.stringify(withoutLevel))).toThrow();
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...VERSION_7, orientation: 'landscape' }))
    ).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...VERSION_8, version: 9 }))).toThrow();
    const f = fixture(JSON.stringify(VERSION_8));
    await f.owner.load();
    await expect(f.owner.setOrientation('sideways')).rejects.toThrow('Orientation');
    expect(f.storage.write).not.toHaveBeenCalled();
  });

  it.each([
    [390, 844, 'portrait'],
    [844, 390, 'portrait'],
    [599, 1000, 'portrait'],
    [600, 1000, 'landscape'],
    [1366, 1024, 'landscape'],
  ])('defaults a %sx%s browser the way the shipping web app does', (width, height, choice) => {
    vi.stubGlobal('window', { innerWidth: width, innerHeight: height });
    expect(webDefaultOrientation()).toBe(choice);
  });
});

describe('orientation copy shared with the shipping picker', () => {
  it('offers the shipping choices, order and labels', () => {
    const picker = readFileSync(
      join(repoRoot, 'web/src/lib/components/settings/OrientationPicker.svelte'),
      'utf8'
    );
    const options = [...picker.matchAll(/value: '(\w+)',\s*label: '([^']+)'/g)].map(
      ([, value, label]) => [value, label]
    );
    expect(options).toEqual(
      ORIENTATION_CHOICES.map((choice) => [choice, ORIENTATION_LABELS[choice]])
    );
    expect(picker).toContain('label="Orientation"');
  });

  it('captions Auto with the shipping rotation-setting note', () => {
    const section = readFileSync(
      join(repoRoot, 'web/src/lib/components/settings/AppearanceSection.svelte'),
      'utf8'
    );
    expect(section).toContain(
      `<p class="orientation-note">${AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE}</p>`
    );
  });
});
