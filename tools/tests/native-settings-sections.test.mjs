import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SIZE_HELP,
  BUTTON_SIZE_LABEL,
  DEFAULT_BUTTON_SCALE,
  controlSize,
  isButtonScale,
} from '../../experiments/native-architecture/src/settings/buttonSize.ts';
import {
  REDUCE_MOTION_HELP,
  REDUCE_MOTION_LABEL,
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
import {
  RELEASE_NOTES,
  WHATS_NEW_STAMP,
  whatsNewUnseen,
} from '../../experiments/native-architecture/src/settings/whatsNew.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { TOUCH_TARGET } from '../../experiments/native-architecture/src/drawing/theme.ts';
import { INFORMATION_CONTENT } from '../../experiments/native-architecture/src/information/content.ts';
import {
  NATIVE_RELEASE_NOTES_PATH,
  readReleases,
  renderNativeReleaseNotes,
} from '../release/gen-release-notes.mjs';

// The shipping sources are Svelte components and rune modules React Native cannot import, so
// their copy, defaults and section list are read from source here.
const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SETTINGS_STATE = source('web/src/lib/state/settings.svelte.ts');
const BUTTON_SIZE_SETTING = source('web/src/lib/components/settings/ButtonSizeSetting.svelte');
const ACCESSIBILITY_SECTION = source('web/src/lib/components/settings/AccessibilitySection.svelte');
const APPEARANCE_STATE = source('web/src/lib/state/appearance.svelte.ts');
const SECTIONS = source('web/src/lib/components/settings/sections.ts');
const SESSION_COUNTERS = source('web/src/lib/state/sessionCounters.svelte.ts');
const HUB_LIST = source('web/src/lib/components/settings/HubList.svelte');

function shippingConstant(name) {
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(SETTINGS_STATE);
  expect(match, name).not.toBeNull();
  return Number(match[1]);
}

function shippingSections() {
  const entries = [
    ...SECTIONS.matchAll(
      /\{\s*id: '(\w+)',\s*label: (['"])(.+?)\2,(?:\s*title: '([^']+)',)?\s*icon: '([\w-]+)'/g
    ),
  ];
  return entries.map(([, id, , label, title, icon]) => ({
    id,
    label,
    ...(title ? { title } : {}),
    icon,
  }));
}

const CURRENT = {
  version: 12,
  soundEnabled: true,
  strokeWidth: 'medium',
  eraserWidth: 'medium',
  selectedColor: 'Purple',
  customColors: [],
  appearance: 'system',
  aiEnabled: false,
  parentPolicies: {
    ai: 'always',
    imageReport: 'always',
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
};

// CURRENT as schema 11 stored it: the medium level where the volume and sources sit, and no
// Button style.
const VERSION_11 = Object.fromEntries(
  Object.entries(CURRENT).flatMap(([key, value]) => {
    if (key === 'version') return [[key, 11]];
    if (key === 'soundVolume') return [['soundLevel', 'medium']];
    if (['drawingSoundEnabled', 'deleteSoundEnabled', 'toolbarStyle'].includes(key)) return [];
    return [[key, value]];
  })
);

describe('Button Size', () => {
  it('keeps the shipping range, default, label and help', () => {
    expect([BUTTON_SCALE_MIN, DEFAULT_BUTTON_SCALE, BUTTON_SCALE_MAX]).toEqual([
      shippingConstant('ACTION_BUTTON_SCALE_MIN'),
      shippingConstant('ACTION_BUTTON_SCALE_DEFAULT'),
      shippingConstant('ACTION_BUTTON_SCALE_MAX'),
    ]);
    expect(BUTTON_SIZE_SETTING).toContain(`label="${BUTTON_SIZE_LABEL}"`);
    expect(BUTTON_SIZE_SETTING).toContain(`help="${BUTTON_SIZE_HELP}"`);
  });

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
    expect(ACCESSIBILITY_SECTION).toContain(`label="${REDUCE_MOTION_LABEL}"`);
    expect(ACCESSIBILITY_SECTION).toContain(`help="${REDUCE_MOTION_HELP}"`);
    expect(APPEARANCE_STATE).toContain("const explicit = wanted ? 'reduce' : 'full';");
    expect(APPEARANCE_STATE).toContain(
      "appearance.systemReduceMotion === wanted ? 'system' : explicit"
    );
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
    const shipping = shippingSections();
    expect(shipping.map(({ id }) => id)).toContain('whatsnew');
    expect(NATIVE_SETTINGS_SECTIONS).toEqual(shipping);
    expect(sectionHeading('whatsnew')).toBe('Updates');
    expect(sectionHeading('accessibility')).toBe('Accessibility');
  });

  it('words its fixed status lines as the shipping hub does', () => {
    for (const [name, subtitle] of Object.entries(SECTION_SUBTITLES))
      expect(SECTIONS, name).toMatch(new RegExp(`['"]${subtitle.replace(/[&]/g, '\\$&')}['"]`));
  });

  it('builds its counted status lines from the shipping templates', () => {
    for (const template of [
      'parts.push(`${orientation} lock`)',
      "parts.join(' · ')",
      'const volume = `Volume ${settingsState.soundVolume}%`;',
      "return `${books} extra ${books === 1 ? 'book' : 'books'} ready`;",
      "`${grant.remaining} free ${grant.remaining === 1 ? 'creation' : 'creations'} left`",
      "return `${hidden} ${hidden === 1 ? 'tool' : 'tools'} hidden`;",
      'return `Version ${APP_VERSION}`;',
    ])
      expect(SECTIONS, template).toContain(template);
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
    for (const template of [
      "if (!settingsState.soundEnabled) return 'Muted';",
      "return 'No sources';",
      "return `${volume} · ${settingsState.drawingSoundEnabled ? 'drawing' : 'deleting'} only`;",
    ])
      expect(SECTIONS, template).toContain(template);
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

  it('puts only Night Mode and Sound switches on the hub, as HubList does', () => {
    expect(
      [...HUB_LIST.matchAll(/^ {4}(\w+): \{\n {6}id: '(\w+)',\n {6}label: '([^']+)'/gm)].map(
        ([, section, id, label]) => ({ section, id, label })
      )
    ).toEqual([
      { section: 'appearance', id: 'hubNightToggle', label: 'Night Mode' },
      { section: 'sound', id: 'hubSoundToggle', label: 'Sound' },
    ]);
  });
});

describe('Settings activity dots', () => {
  it("wait for shipping's sixth session", () => {
    expect(SESSION_COUNTERS).toContain(
      `export const SETTINGS_ACTIVITY_DOTS_START_SESSION = ${SETTINGS_ACTIVITY_DOTS_START_SESSION};`
    );
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
    expect(INFORMATION_CONTENT.whatsNew.sections).toEqual(
      RELEASE_NOTES[0].sections.map(({ title, blocks }) => ({
        title,
        paragraphs: blocks.map(({ text }) => text),
      }))
    );
  });

  it('stamps the dot with the app version, as the shipping section does', () => {
    expect(SECTIONS).toMatch(/id: 'whatsnew',[\s\S]*?contentStamp: APP_VERSION/);
    expect(WHATS_NEW_STAMP).toBe(JSON.parse(source('package.json')).version);
    expect(whatsNewUnseen(null)).toBe(true);
    expect(whatsNewUnseen('0.0.1')).toBe(true);
    expect(whatsNewUnseen(WHATS_NEW_STAMP)).toBe(false);
  });
});

describe('settings schema 11', () => {
  const PENCIL_SEEN = { ...CURRENT, pencilEraserEnabled: false, applePencilSeen: true };
  const VERSION_10 = (({ pencilEraserEnabled: _e, applePencilSeen: _s, ...rest }) => ({
    ...rest,
    version: 10,
  }))(VERSION_11);

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
          }))(VERSION_11);
    expect(parseSoundSettings(JSON.stringify(old))).toMatchObject({
      version: 12,
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
