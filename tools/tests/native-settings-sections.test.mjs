import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SCALE_STEP,
  BUTTON_SIZE_HELP,
  BUTTON_SIZE_LABEL,
  DEFAULT_BUTTON_SCALE,
  controlSize,
  isButtonScale,
  stepButtonScale,
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
} from '../../experiments/native-architecture/src/settings/settingsSections.ts';
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

function shippingConstant(name) {
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(SETTINGS_STATE);
  expect(match, name).not.toBeNull();
  return Number(match[1]);
}

function shippingSections() {
  const entries = [
    ...SECTIONS.matchAll(
      /\{\s*id: '(\w+)',\s*label: (['"])(.+?)\2,(?:\s*title: '([^']+)',)?\s*icon:/g
    ),
  ];
  return entries.map(([, id, , label, title]) => ({ id, label, ...(title ? { title } : {}) }));
}

const CURRENT = {
  version: 10,
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
  soundLevel: 'medium',
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 120,
  reduceMotion: 'reduce',
  whatsNewSeen: '1.5.0',
};

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

  it('steps through the default from either end and clamps at the range', () => {
    const fromMin = [];
    for (let scale = BUTTON_SCALE_MIN; scale < BUTTON_SCALE_MAX; scale = stepButtonScale(scale, 1))
      fromMin.push(scale);
    expect(fromMin).toContain(DEFAULT_BUTTON_SCALE);
    expect((DEFAULT_BUTTON_SCALE - BUTTON_SCALE_MIN) % BUTTON_SCALE_STEP).toBe(0);
    expect((BUTTON_SCALE_MAX - DEFAULT_BUTTON_SCALE) % BUTTON_SCALE_STEP).toBe(0);
    expect(stepButtonScale(BUTTON_SCALE_MAX, 1)).toBe(BUTTON_SCALE_MAX);
    expect(stepButtonScale(BUTTON_SCALE_MIN, -1)).toBe(BUTTON_SCALE_MIN);
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
  it('names, titles and orders its sections as the shipping list does', () => {
    const shipping = shippingSections();
    expect(shipping.map(({ id }) => id)).toContain('whatsnew');
    const native = NATIVE_SETTINGS_SECTIONS.map(({ id }) => id);
    expect(shipping.map(({ id }) => id).filter((id) => native.includes(id))).toEqual(native);
    for (const section of NATIVE_SETTINGS_SECTIONS)
      expect(section, section.id).toEqual(shipping.find(({ id }) => id === section.id));
    expect(sectionHeading('whatsnew')).toBe('Updates');
    expect(sectionHeading('accessibility')).toBe('Accessibility');
  });

  it('words its fixed status lines as the shipping hub does', () => {
    for (const [name, subtitle] of Object.entries(SECTION_SUBTITLES))
      expect(SECTIONS, name).toMatch(new RegExp(`['"]${subtitle.replace(/[&]/g, '\\$&')}['"]`));
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
      RELEASE_NOTES[0].sections.map(({ title, items }) => ({ title, paragraphs: items }))
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

describe('settings schema 10', () => {
  it('round trips the accessibility choices and the What’s New stamp exactly', () => {
    const snapshot = JSON.stringify(CURRENT);
    expect(parseSoundSettings(snapshot)).toEqual(CURRENT);
  });

  it.each([1, 9])('migrates version %i to the shipping defaults', (version) => {
    const old =
      version === 1
        ? { version: 1, soundEnabled: true }
        : (({ buttonScale: _b, reduceMotion: _r, whatsNewSeen: _w, ...rest }) => ({
            ...rest,
            version: 9,
          }))(CURRENT);
    expect(parseSoundSettings(JSON.stringify(old))).toMatchObject({
      version: 10,
      buttonScale: DEFAULT_BUTTON_SCALE,
      reduceMotion: 'system',
      whatsNewSeen: null,
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
    });
    await expect(owner.setButtonScale(BUTTON_SCALE_MAX + 1)).rejects.toThrow('Button Size');
    await expect(owner.setReduceMotion('sometimes')).rejects.toThrow('Reduce Motion');
    owner.dispose();
  });
});
