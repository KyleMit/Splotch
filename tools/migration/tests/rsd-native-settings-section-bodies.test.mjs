import {
  caller,
  records,
  host,
  mount,
  root,
  checkedRadio,
  checkedSwitch,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import './rsd-native-settings-hub-mocks.mjs';
import {
  button,
  click,
  drawingScreen,
  flat,
  hubRow,
  outerSize,
  rerender,
  storedSettings,
} from './rsd-native-settings-fixture.mjs';
import { drawerTileSize as tileSize } from './rsd-native-toolbar-fixture.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { Animated } from 'react-native';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { PALETTE_FLOWS } from '../../../experiments/native-architecture/src/rsdDrawing/paletteGeometry.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import {
  APPEARANCE_ICONS,
  APPEARANCE_LABEL_GAP_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdAppearanceSection.tsx';
import { RsdSectionReveal } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSectionReveal.tsx';
import { ReduceMotionPreferenceProvider } from '../../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import { CALM_FADE_MS, SECTION_SLIDE_MS } from '../../../web/src/lib/motionDurations.ts';
import { SOUND_SECTION_SPACING } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSoundSection.tsx';
import { SEE_THROUGH_CARD_SHADOW } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingCard.tsx';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SIZE_HELP,
} from '../../../experiments/native-architecture/src/settings/buttonSize.ts';
import { SECTION_SUBTITLES } from '../../../experiments/native-architecture/src/settings/settingsSections.ts';

// The Appearance, Sound and Accessibility section bodies (AppearanceSection.svelte,
// SoundSection.svelte, AccessibilitySection.svelte) mounted through the real Settings caller.
const SLIDER_WIDTH_PX = 400;

function sliderProps(label) {
  const props = records.props.findLast(
    (entry) => entry.role === 'slider' && entry['aria-label'] === label
  );
  expect(props, label).toBeDefined();
  return props;
}

const touch = (identifier, pageX) => ({
  nativeEvent: { identifier, pageX, touches: [{ identifier, pageX }], changedTouches: [] },
});

// Holds a drag on the slider at `to` px from where it began; release() lets it go.
async function holdDrag(label, to) {
  await act(async () =>
    sliderProps(label).onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: SLIDER_WIDTH_PX, height: 36 } },
    })
  );
  await act(async () => sliderProps(label).onResponderGrant(touch(1, 0)));
  await act(async () => sliderProps(label).onResponderMove(touch(1, to)));
  return () => act(async () => sliderProps(label).onResponderRelease(touch(1, to)));
}

const lastStyle = (testID) =>
  flat(records.props.findLast((props) => props.testID === testID).style);

function settingCards() {
  const cards = records.props.filter((props) => props.testID === 'setting-card');
  return cards.slice(-2).map((props) => flat(props.style));
}

it('drags Button Size through a see-through Settings, resizing the edge controls live, and writes it once on release', async () => {
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  expect(host.textContent).toContain(BUTTON_SIZE_HELP);
  expect(sliderProps('Button Size')['aria-valuenow']).toBe(100);
  expect(lastStyle('modal-surface').backgroundColor).not.toBe('transparent');
  expect(host.querySelector('[aria-label="Save screenshot"]')).toBeNull();
  const release = await holdDrag('Button Size', SLIDER_WIDTH_PX);
  expect(sliderProps('Button Size')['aria-valuenow']).toBe(BUTTON_SCALE_MAX);
  expect(settings.storage.write).not.toHaveBeenCalled();
  // See-through: the card surface clears, Reduce Motion hides, and Button Size stays lifted.
  expect(lastStyle('modal-surface').backgroundColor).toBe('transparent');
  const [sizeCard, motionCard] = settingCards();
  expect(sizeCard.opacity).toBeUndefined();
  expect(sizeCard.boxShadow).toBeDefined();
  expect(motionCard.opacity).toBe(0);
  // The drawer opens and its controls take the dragged size before anything is written.
  const size = tileSize(BUTTON_SCALE_MAX);
  expect(size).toBeGreaterThan(tileSize(100));
  expect(outerSize('Save screenshot')).toBe(size);
  await release();
  expect(settings.storage.write).toHaveBeenCalledOnce();
  expect(settings.stored()).toMatchObject({ version: 16, buttonScale: BUTTON_SCALE_MAX });
  expect(lastStyle('modal-surface').backgroundColor).not.toBe('transparent');
  expect(settingCards()[1].opacity).toBeUndefined();
  await rerender({ settingsOpen: false });
  await click('Expand controls');
  expect(outerSize('Save screenshot')).toBe(size);
  expect(outerSize('Collapse controls')).toBe(CORNER_BUTTON_SIZE_PX);
  // Shipping sizes its swatches and the corner Settings Button apart from Button Size.
  for (const label of ['Purple', 'Custom Color'])
    expect(outerSize(label), label).toBe(PALETTE_FLOWS.row.swatchPx);
  expect(outerSize('Settings')).toBe(CORNER_BUTTON_SIZE_PX);
  await rerender({ settingsOpen: true });
  await openSettingsSection('Accessibility');
  const shrink = await holdDrag('Button Size', -SLIDER_WIDTH_PX);
  await shrink();
  expect(settings.stored().buttonScale).toBe(BUTTON_SCALE_MIN);
  expect(settings.storage.write).toHaveBeenCalledTimes(2);
  await rerender({ settingsOpen: false });
  expect(outerSize('Save screenshot')).toBe(tileSize(BUTTON_SCALE_MIN));
  expect(tileSize(BUTTON_SCALE_MIN)).toBeLessThan(tileSize(100));
  expect(outerSize('Purple')).toBe(PALETTE_FLOWS.row.swatchPx);
});

it('writes the Drawing and Deleting sound sources and words the hub from them', async () => {
  const settings = storedSettings({ soundEnabled: true, soundVolume: 40 });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  expect(hubRow('Sound').getAttribute('aria-label')).toBe('Sound, Volume 40%');
  await openSettingsSection('Sound');
  expect(host.textContent).toContain('What makes sound');
  checkedSwitch(button('Drawing'), true);
  checkedSwitch(button('Deleting'), true);
  await click('Deleting');
  checkedSwitch(button('Deleting'), false);
  expect(settings.stored()).toMatchObject({ drawingSoundEnabled: true, deleteSoundEnabled: false });
  expect(caller.product.sound.settings).toMatchObject({ deleteSoundEnabled: false });
  await click('Drawing');
  expect(settings.stored()).toMatchObject({
    drawingSoundEnabled: false,
    deleteSoundEnabled: false,
  });
  await click('Back');
  expect(hubRow('Sound').getAttribute('aria-label')).toBe(
    `Sound, ${SECTION_SUBTITLES.noSoundSources}`
  );
  await openSettingsSection('Sound');
  await click('Drawing');
  await click('Back');
  expect(hubRow('Sound').getAttribute('aria-label')).toBe('Sound, Volume 40% · drawing only');
  await openSettingsSection('Sound');
  await act(async () => host.querySelector('[role="switch"][aria-label="Sound"]').click());
  expect(settings.stored().soundEnabled).toBe(false);
  expect(host.textContent).not.toContain('What makes sound');
  expect(host.querySelector('[aria-label="Drawing"]')).toBeNull();
});

it('chooses Flat buttons from the Appearance section and keeps the choice on reopen', async () => {
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Appearance');
  const option = (label) =>
    host.querySelector(`[role="radiogroup"][aria-label="Button style"] [aria-label="${label}"]`);
  checkedRadio(option('Raised'));
  await act(async () => option('Flat').click());
  checkedRadio(option('Flat'));
  expect(settings.stored()).toMatchObject({ version: 16, toolbarStyle: 'bare' });
  expect(host.textContent).not.toContain('System follows');
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Appearance');
  checkedRadio(option('Flat'));
});

const shippingSource = (path) =>
  readFileSync(join(import.meta.dirname, '../../../web/src/lib/components', path), 'utf8');

it('takes the section bodies’ spacing, glyphs and see-through lift from the shipping sources', () => {
  const sound = shippingSource('settings/SoundSection.svelte');
  const { sliderTop, sliderBottom, sourcesTop, sourcesHeadingBottom } = SOUND_SECTION_SPACING;
  expect(sound).toContain(`.slider-setting {\n    margin: ${sliderTop}px 0 ${sliderBottom}px;`);
  expect(sound).toContain(`.sound-sources {\n    margin-top: ${sourcesTop}px;`);
  expect(sound).toContain(`h4.sources-heading) {\n    margin-bottom: ${sourcesHeadingBottom}px;`);
  const appearance = shippingSource('settings/AppearanceSection.svelte');
  for (const [theme, icon] of Object.entries(APPEARANCE_ICONS))
    expect(appearance).toMatch(new RegExp(`value: '${theme}', label: '\\w+', icon: '${icon}'`));
  expect(appearance).toContain(`margin-bottom: ${APPEARANCE_LABEL_GAP_PX}px;`);
  const modal = shippingSource('SettingsModal.svelte');
  expect(modal).toContain(
    `box-shadow: ${SEE_THROUGH_CARD_SHADOW.replace('rgba(0, 0, 0, 0.16)', 'rgb(0 0 0 / 16%)')};`
  );
});

function revealProps() {
  return records.props.findLast((props) => props.testID === 'settings-section-reveal');
}

function revealBody() {
  return records.props.findLast((props) => props.testID === 'settings-section-reveal-body');
}

async function showReveal(visible, preference = 'full') {
  const element = createElement(
    ReduceMotionPreferenceProvider,
    { preference },
    createElement(RsdSectionReveal, { visible, marginTop: 20, marginBottom: 2 }, 'Revealed setting')
  );
  if (root) await act(async () => root.render(element));
  else await mount(element);
}

async function measureReveal(height = 100) {
  await act(async () => revealBody().onLayout({ nativeEvent: { layout: { height } } }));
}

function holdReveals() {
  const pending = [];
  const nativeDriven = new WeakSet();
  const timing = vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (nativeDriven.has(value) && !config.useNativeDriver)
      throw new Error('Animated cannot run a JS animation after moving this value to native.');
    if (config.useNativeDriver) nativeDriven.add(value);
    const transition = { value, config, finish: null, stop: vi.fn() };
    pending.push(transition);
    return {
      start: (finish) => {
        transition.finish = finish;
      },
      stop: transition.stop,
    };
  });
  return { pending, timing };
}

it.each([
  ['Sound', 'SoundSection.svelte', { soundEnabled: true }],
  ['Tool Drawer', 'ControlsSection.svelte', { applePencilSeen: true }],
])(
  'mounts both %s conditional blocks through the shipping section reveal',
  async (name, file, settings) => {
    storedSettings(settings);
    drawingScreen();
    await mount(createElement(RsdDrawingScreen));
    await openSettingsSection(name);
    const shipping = shippingSource(`settings/${file}`);
    expect(host.querySelectorAll('[data-testid="settings-section-reveal"]')).toHaveLength(
      [...shipping.matchAll(/transition:sectionReveal/g)].length
    );
    expect(shippingSource('settings/sectionReveal.ts')).toContain('calm(slide, SECTION_SLIDE)');
    expect(shippingSource('settings/sections.ts')).toContain('duration: SECTION_SLIDE_MS');
  }
);

it('mounts each AI Art alternative through its own shipping reveal', async () => {
  storedSettings({
    parentPolicies: {
      ai: 'never',
      imageReport: 'never',
      externalLinks: 'never',
      feedback: 'never',
      parentCenter: 'never',
    },
  });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('AI Art');
  const count = () => host.querySelectorAll('[data-testid="settings-section-reveal"]').length;
  const off = count();
  expect(off).toBe(1);
  await click('Create AI Images');
  const on = count();
  expect(on).toBe(1);
  expect(off + on).toBe(
    [...shippingSource('settings/AiKeyManager.svelte').matchAll(/transition:sectionReveal/g)].length
  );
});

it.each([
  ['full', SECTION_SLIDE_MS, false],
  ['reduce', CALM_FADE_MS, false],
])(
  'retains an exiting section for its shipping %s transition',
  async (preference, duration, driver) => {
    const { pending, timing } = holdReveals();
    try {
      await showReveal(true, preference);
      await measureReveal();
      expect(pending).toHaveLength(0);
      await showReveal(false, preference);
      expect(host.textContent).toContain('Revealed setting');
      expect(revealProps()).toMatchObject({
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
      });
      expect(pending.map(({ config }) => config)).toEqual([
        expect.objectContaining({ toValue: 0, duration, useNativeDriver: driver }),
      ]);
      const style = flat(revealProps().style);
      expect(style.height !== undefined).toBe(preference === 'full');
      expect(style.overflow).toBe(preference === 'full' ? 'hidden' : 'visible');
      await act(async () => pending[0].finish({ finished: true }));
      expect(host.textContent).not.toContain('Revealed setting');
    } finally {
      timing.mockRestore();
    }
  }
);

it('measures new content before its full reveal and releases the fixed height after landing', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(false);
    expect(host.textContent).not.toContain('Revealed setting');
    await showReveal(true);
    expect(pending).toHaveLength(0);
    expect(flat(revealProps().style).height).toBe(0);
    await measureReveal();
    expect(pending).toHaveLength(1);
    expect(pending[0].config).toMatchObject({
      toValue: 1,
      duration: SECTION_SLIDE_MS,
      useNativeDriver: false,
    });
    await act(async () => pending[0].finish({ finished: true }));
    expect(flat(revealProps().style).height).toBeUndefined();
    await measureReveal(240);
    expect(pending).toHaveLength(1);
    expect(flat(revealProps().style).height).toBeUndefined();
  } finally {
    timing.mockRestore();
  }
});

it('keeps the transition preference until the next reveal', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(true);
    await measureReveal();
    await showReveal(false);
    await showReveal(false, 'reduce');
    expect(pending).toHaveLength(1);
    expect(pending[0].config).toMatchObject({ duration: SECTION_SLIDE_MS, useNativeDriver: false });
    await showReveal(true, 'reduce');
    expect(pending[0].stop).toHaveBeenCalledOnce();
    expect(pending[1].config).toMatchObject({
      toValue: 1,
      duration: CALM_FADE_MS,
      useNativeDriver: false,
    });
    await act(async () => pending[0].finish({ finished: true }));
    expect(host.textContent).toContain('Revealed setting');
    await act(async () => pending[1].finish({ finished: true }));
    expect(host.textContent).toContain('Revealed setting');
  } finally {
    timing.mockRestore();
  }
});

it('keeps content after a canceled exit and ignores completion after unmount', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(true);
    await measureReveal();
    await showReveal(false);
    await act(async () => pending[0].finish({ finished: false }));
    expect(host.textContent).toContain('Revealed setting');
    await act(async () => root.unmount());
    expect(pending[0].stop).toHaveBeenCalledOnce();
    await act(async () => pending[0].finish({ finished: true }));
    expect(host.textContent).not.toContain('Revealed setting');
  } finally {
    timing.mockRestore();
  }
});

it('can reveal with full motion after a completed calm exit on the same Animated value', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(true, 'reduce');
    await measureReveal();
    await showReveal(false, 'reduce');
    await act(async () => pending[0].finish({ finished: true }));
    expect(host.textContent).not.toContain('Revealed setting');
    await showReveal(true, 'full');
    await measureReveal();
    expect(pending.map(({ config }) => config.duration)).toEqual([CALM_FADE_MS, SECTION_SLIDE_MS]);
    expect(pending[0].value).toBe(pending[1].value);
    await act(async () => pending[1].finish({ finished: true }));
    expect(host.textContent).toContain('Revealed setting');
  } finally {
    timing.mockRestore();
  }
});
