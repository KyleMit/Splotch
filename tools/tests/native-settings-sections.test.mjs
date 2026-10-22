import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  DEFAULT_BUTTON_SCALE,
  controlSize,
  isButtonScale,
} from '../../experiments/native-architecture/src/settings/buttonSize.ts';
import {
  reduceMotionChoice,
  resolveReducedMotion,
} from '../../experiments/native-architecture/src/settings/reduceMotion.ts';
import {
  NATIVE_SETTINGS_SECTIONS,
  SECTION_SUBTITLES,
  sectionHeading,
  sectionSubtitle,
} from '../../experiments/native-architecture/src/settings/settingsSections.ts';
import {
  SETTINGS_ACTIVITY_DOTS_START_SESSION,
  activityDotsShown,
  createSettingsSessions,
} from '../../experiments/native-architecture/src/settings/settingsSessions.ts';
import { DEFAULT_BRUSH_AVAILABILITY } from '../../experiments/native-architecture/src/settings/brushPreferences.ts';
import { RELEASE_NOTES } from '../../experiments/native-architecture/src/settings/whatsNew.ts';
import { WHATS_NEW_STAMP } from '../../experiments/native-architecture/src/settings/whatsNewStamp.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { TOUCH_TARGET } from '../../experiments/native-architecture/src/drawing/theme.ts';
import {
  NATIVE_RELEASE_NOTES_PATH,
  readReleases,
  renderNativeReleaseNotes,
} from '../release/gen-release-notes.mjs';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const CURRENT = {
  version: 16,
  soundEnabled: true,
  strokeWidth: 'medium',
  eraserWidth: 'medium',
  appearance: 'system',
  aiEnabled: false,
  parentPolicies: {
    ai: 'always',
    imageReport: 'always',
    externalLinks: 'always',
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: true,
  soundVolume: 50,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 120,
  reduceMotion: 'reduce',
  whatsNewSeen: '1.5.0',
  pencilEraserEnabled: true,
  applePencilSeen: false,
  toolbarStyle: 'buttons',
  toolDrawerEnabled: true,
  screenshotEnabled: true,
  aiCustomizationEnabled: true,
  autoSaveAiEnabled: false,
};

// CURRENT as schema 12 stored it: the paint after the widths, the medium level where the volume
// and sources sit, and no Button style.
const STORED_PAINT = Object.entries({ selectedColor: 'Purple', customColors: [] });
const VERSION_12 = Object.fromEntries(
  Object.entries(CURRENT).flatMap(([key, value]) => {
    if (key === 'version') return [[key, 12]];
    if (key === 'eraserWidth') return [[key, value], ...STORED_PAINT];
    if (key === 'soundVolume') return [['soundLevel', 'medium']];
    // The sound sources, Button style, drawer and camera switches, and AI Art's came later.
    if (/SoundEnabled$|^toolbarStyle$|^toolDrawer|^screenshot|^ai[CS]|^autoSave/.test(key))
      return [];
    return [[key, value]];
  })
);

describe('Button Size', () => {
  it('sizes the default to the touch target and every choice to whole pixels', () => {
    expect(controlSize(DEFAULT_BUTTON_SCALE)).toBe(TOUCH_TARGET);
    expect(Number.isInteger(controlSize(BUTTON_SCALE_MAX))).toBe(true);
  });

  it('accepts only whole percentages inside the range', () => {
    for (const valid of [BUTTON_SCALE_MIN, 85, BUTTON_SCALE_MAX])
      expect(isButtonScale(valid)).toBe(true);
    for (const invalid of [69, 131, 100.5, '100', null, undefined])
      expect(isButtonScale(invalid), String(invalid)).toBe(false);
  });
});

describe('Reduce Motion', () => {
  it('keeps the shipping label, help and the rule that a choice matching the device follows it', () => {
    expect(
      [
        [true, false],
        [true, true],
        [false, true],
        [false, false],
      ].map(([wanted, device]) => reduceMotionChoice(wanted, device))
    ).toEqual(['reduce', 'system', 'full', 'system']);
    for (const device of [true, false])
      for (const wanted of [true, false])
        expect(resolveReducedMotion(reduceMotionChoice(wanted, device), device)).toBe(wanted);
  });
});

describe('sectioned Settings', () => {
  it('names, titles, icons and orders every section as the shipping list does', () => {
    expect(NATIVE_SETTINGS_SECTIONS.map(({ contentStamp: _stamp, ...section }) => section)).toEqual(
      [
        { id: 'appearance', label: 'Appearance', icon: 'appearance' },
        { id: 'sound', label: 'Sound', icon: 'sound' },
        { id: 'controls', label: 'Tool Drawer', icon: 'controls' },
        { id: 'accessibility', label: 'Accessibility', icon: 'accessibility' },
        { id: 'coloring', label: 'Coloring', icon: 'shapes' },
        { id: 'ai', label: 'AI Art', icon: 'wand-stars' },
        { id: 'saving', label: 'Saving', icon: 'save-picture' },
        { id: 'parentCenter', label: 'Parent Center', icon: 'parent-center' },
        { id: 'setup', label: 'Install', icon: 'setup' },
        { id: 'feedback', label: 'Feedback', icon: 'feedback' },
        { id: 'whatsnew', label: "What's New", title: 'Updates', icon: 'whats-new' },
        { id: 'about', label: 'About', icon: 'splotchy' },
      ]
    );
    expect(sectionHeading('whatsnew')).toBe('Updates');
    expect(sectionHeading('accessibility')).toBe('Accessibility');
  });

  it('builds its counted status lines from the shipping templates', () => {
    const settings = { ...CURRENT, status: 'ready', saved: true, message: '' };
    const context = (overrides, extra = {}) => ({
      settings: { ...settings, ...overrides },
      brushes: { status: 'ready', availability: DEFAULT_BRUSH_AVAILABILITY },
      downloadedBooks: 0,
      ai: null,
      ...extra,
    });
    expect(sectionSubtitle('appearance', context({ orientation: 'landscape' }))).toBe(
      'Night Mode · landscape lock'
    );
    expect(sectionSubtitle('appearance', context({ orientation: 'auto' }))).toBe('Night Mode');
    const sound = (overrides) => sectionSubtitle('sound', context(overrides));
    expect(sound({ soundVolume: 73 })).toBe('Volume 73%');
    expect(sound({ soundVolume: 73, soundEnabled: false })).toBe(SECTION_SUBTITLES.muted);
    expect(sound({ drawingSoundEnabled: false, deleteSoundEnabled: false })).toBe(
      SECTION_SUBTITLES.noSoundSources
    );
    expect(sound({ soundVolume: 20, deleteSoundEnabled: false })).toBe('Volume 20% · drawing only');
    expect(sound({ soundVolume: 20, drawingSoundEnabled: false })).toBe(
      'Volume 20% · deleting only'
    );
    expect(sectionSubtitle('coloring', context({}, { downloadedBooks: 1 }))).toBe(
      '1 extra book ready'
    );
    expect(sectionSubtitle('ai', context({ aiEnabled: true }))).toBe(
      SECTION_SUBTITLES.aiAllowanceUnavailable
    );
    expect(
      sectionSubtitle(
        'ai',
        context({ aiEnabled: true }, { ai: { credential: 'free', remaining: 1 } })
      )
    ).toBe('1 free creation left');
    expect(
      sectionSubtitle(
        'ai',
        context({ aiEnabled: true }, { ai: { credential: 'free', remaining: 3 } })
      )
    ).toBe('3 free creations left');
    expect(
      sectionSubtitle(
        'ai',
        context({ aiEnabled: true }, { ai: { credential: 'byok', remaining: null } })
      )
    ).toBe(SECTION_SUBTITLES.aiOwnKey);
    expect(
      sectionSubtitle(
        'ai',
        context({ aiEnabled: true }, { ai: { credential: 'managed', remaining: null } })
      )
    ).toBe(SECTION_SUBTITLES.aiAccessCode);
  });
});

describe('Settings activity dots', () => {
  it("wait for shipping's sixth session", () => {
    expect(activityDotsShown(undefined)).toBe(false);
    expect(activityDotsShown(SETTINGS_ACTIVITY_DOTS_START_SESSION - 1)).toBe(false);
    expect(activityDotsShown(SETTINGS_ACTIVITY_DOTS_START_SESSION)).toBe(true);
  });

  it('counts each launch once, saturates at the milestone, and treats bad storage as a first visit', async () => {
    const launch = async (stored, write = async () => {}) => {
      const storage = { read: async () => stored, write: vi.fn(write) };
      const sessions = createSettingsSessions(storage);
      const counts = [await sessions.load(), await sessions.load()];
      return { counts, writes: storage.write.mock.calls.map(([count]) => count) };
    };
    expect(await launch(null)).toEqual({ counts: [1, 1], writes: ['1'] });
    expect(await launch('5')).toEqual({ counts: [6, 6], writes: ['6'] });
    expect(await launch('6')).toEqual({ counts: [6, 6], writes: [] });
    expect(await launch('99')).toEqual({ counts: [6, 6], writes: [] });
    expect(await launch('-4')).toEqual({ counts: [1, 1], writes: ['1'] });
    expect(await launch('soon')).toEqual({ counts: [1, 1], writes: ['1'] });
    const failing = await launch('2', async () => {
      throw new Error('quota');
    });
    expect(failing).toEqual({ counts: [3, 3], writes: ['3'] });
    const unreadable = createSettingsSessions({
      read: async () => {
        throw new Error('blocked');
      },
      write: async () => {},
    });
    expect(await unreadable.load()).toBe(1);
  });
});

describe("What's New", () => {
  it('lists every shipping release with notes generated from its own document', () => {
    const releases = JSON.parse(source('web/src/lib/releases.json'));
    expect(RELEASE_NOTES.map(({ version, dateLabel }) => ({ version, dateLabel }))).toEqual(
      releases.map(({ version, dateLabel }) => ({ version, dateLabel }))
    );
    expect(source(NATIVE_RELEASE_NOTES_PATH)).toBe(renderNativeReleaseNotes(readReleases()));
  });

  it('stamps the dot with the app version, as the shipping section does', () => {
    expect(WHATS_NEW_STAMP).toBe(JSON.parse(source('package.json')).version);
  });
});

// A record from before version 12, which gave Viewing external links its own policy.
function withoutLinksPolicy(record) {
  const { externalLinks: _links, ...policies } = record.parentPolicies;
  return { ...record, parentPolicies: policies };
}

describe('settings schema 13', () => {
  it('migrates version 12 to the volume its level played at, both sources and Raised buttons', () => {
    for (const [soundLevel, soundVolume] of [
      ['quiet', 25],
      ['medium', 50],
      ['loud', 100],
    ])
      expect(parseSoundSettings(JSON.stringify({ ...VERSION_12, soundLevel }))).toEqual({
        ...CURRENT,
        soundVolume,
      });
  });
  it('rejects a version 13 record still holding a level or missing a sound choice, and a version 12 record carrying one', () => {
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...CURRENT, soundLevel: 'medium' }))
    ).toThrow();
    for (const key of ['soundVolume', 'drawingSoundEnabled', 'deleteSoundEnabled', 'toolbarStyle'])
      expect(
        () => parseSoundSettings(JSON.stringify({ ...CURRENT, [key]: undefined })),
        key
      ).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...VERSION_12, soundVolume: 50 }))).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...CURRENT, version: 12 }))).toThrow();
  });
});

describe('settings schema 12', () => {
  const VERSION_11 = { ...withoutLinksPolicy(VERSION_12), version: 11 };

  it('migrates version 11 through both steps to the links default and the shipping sound', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_11))).toEqual(CURRENT);
  });
  it('rejects a version 12 record without the external-links policy, and a version 11 record carrying one', () => {
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...withoutLinksPolicy(VERSION_12), version: 12 }))
    ).toThrow('Parent Center');
    expect(() => parseSoundSettings(JSON.stringify({ ...VERSION_12, version: 11 }))).toThrow(
      'Parent Center'
    );
  });
  it('writes the policies in the shipping order whatever order they were set in', async () => {
    let stored = JSON.stringify(CURRENT);
    const settings = createSoundSettings(
      {
        read: async () => stored,
        write: async (next) => {
          stored = next;
        },
      },
      () => {}
    );
    await settings.load();
    const { parentCenter, ai: _ai, ...rest } = CURRENT.parentPolicies;
    await settings.setParentPreferences({
      aiEnabled: true,
      parentPolicies: { parentCenter, ...rest, ai: 'session' },
    });
    const order = ['ai', 'imageReport', 'externalLinks', 'feedback', 'parentCenter'];
    expect(Object.keys(JSON.parse(stored).parentPolicies)).toEqual(order);
    expect(parseSoundSettings(stored).parentPolicies.ai).toBe('session');
  });
});

describe('settings schema 11', () => {
  const PENCIL_SEEN = { ...CURRENT, pencilEraserEnabled: false, applePencilSeen: true };
  const VERSION_10 = (({ pencilEraserEnabled: _e, applePencilSeen: _s, ...rest }) => ({
    ...rest,
    version: 10,
  }))(withoutLinksPolicy(VERSION_12));

  it('round trips the Apple Pencil choices exactly', () => {
    expect(parseSoundSettings(JSON.stringify(PENCIL_SEEN))).toEqual(PENCIL_SEEN);
  });
  it('migrates version 10 to the shipping Apple Pencil defaults', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_10))).toEqual(CURRENT);
  });
  it('rejects a version 11 record with a missing or invalid Apple Pencil choice, and a version 10 record carrying one', () => {
    for (const [key, invalid] of [
      ['pencilEraserEnabled', 'yes'],
      ['pencilEraserEnabled', undefined],
      ['applePencilSeen', 1],
      ['applePencilSeen', undefined],
    ])
      expect(
        () => parseSoundSettings(JSON.stringify({ ...CURRENT, [key]: invalid })),
        `${key} ${invalid}`
      ).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...CURRENT, version: 10 }))).toThrow();
  });
});

describe('settings schema 10', () => {
  it('round trips the accessibility choices and the What’s New stamp exactly', () => {
    const snapshot = JSON.stringify(CURRENT);
    expect(parseSoundSettings(snapshot)).toEqual(CURRENT);
  });

  it.each([1, 9])('migrates version %i to the shipping defaults', (version) => {
    const old =
      version === 1
        ? { version: 1, soundEnabled: true }
        : (({
            buttonScale: _b,
            reduceMotion: _r,
            whatsNewSeen: _w,
            pencilEraserEnabled: _e,
            applePencilSeen: _s,
            ...rest
          }) => ({
            ...rest,
            version: 9,
          }))(withoutLinksPolicy(VERSION_12));
    expect(parseSoundSettings(JSON.stringify(old))).toMatchObject({
      version: 16,
      buttonScale: DEFAULT_BUTTON_SCALE,
      reduceMotion: 'system',
      whatsNewSeen: null,
      pencilEraserEnabled: true,
      applePencilSeen: false,
      toolbarStyle: 'buttons',
    });
  });

  it('rejects a version 10 record with a missing or invalid choice, and a version 9 record carrying one', () => {
    for (const [key, invalid] of [
      ['buttonScale', 131],
      ['buttonScale', '100'],
      ['buttonScale', undefined],
      ['reduceMotion', 'off'],
      ['reduceMotion', undefined],
      ['whatsNewSeen', 'latest'],
      ['whatsNewSeen', undefined],
    ])
      expect(
        () => parseSoundSettings(JSON.stringify({ ...CURRENT, [key]: invalid })),
        `${key} ${invalid}`
      ).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...CURRENT, version: 9 }))).toThrow();
  });

  it('recovers an earlier failed ordinary save once the What\u2019s New stamp writes it', async () => {
    let stored = null;
    const write = vi
      .fn(async (next) => {
        stored = next;
      })
      .mockRejectedValueOnce(new Error('disk full'));
    const states = [];
    const owner = createSoundSettings({ read: async () => null, write }, (state) =>
      states.push(state)
    );
    await owner.load();
    await owner.setEnabled(false);
    expect(states.at(-1)).toMatchObject({ soundEnabled: false, saved: false });
    expect(states.at(-1).message).toContain('could not be saved');
    expect(stored).toBeNull();
    await owner.markWhatsNewSeen();
    expect(JSON.parse(stored)).toMatchObject({
      soundEnabled: false,
      whatsNewSeen: WHATS_NEW_STAMP,
      pencilEraserEnabled: true,
      applePencilSeen: false,
    });
    expect(states.at(-1)).toMatchObject({
      status: 'ready',
      soundEnabled: false,
      whatsNewSeen: WHATS_NEW_STAMP,
      pencilEraserEnabled: true,
      applePencilSeen: false,
      saved: true,
      message: '',
    });
    owner.dispose();
  });

  it('persists Button Size, Reduce Motion and the seen stamp through the one settings owner', async () => {
    const write = vi.fn(async () => {});
    const owner = createSoundSettings({ read: async () => null, write }, () => {});
    await owner.load();
    await owner.setButtonScale(BUTTON_SCALE_MAX);
    await owner.setReduceMotion('full');
    await owner.markWhatsNewSeen();
    await owner.markWhatsNewSeen();
    expect(write).toHaveBeenCalledTimes(3);
    expect(parseSoundSettings(write.mock.calls.at(-1)[0])).toMatchObject({
      buttonScale: BUTTON_SCALE_MAX,
      reduceMotion: 'full',
      whatsNewSeen: WHATS_NEW_STAMP,
      pencilEraserEnabled: true,
      applePencilSeen: false,
    });
    await expect(owner.setButtonScale(BUTTON_SCALE_MAX + 1)).rejects.toThrow('Button Size');
    await expect(owner.setReduceMotion('sometimes')).rejects.toThrow('Reduce Motion');
    owner.dispose();
  });
});
