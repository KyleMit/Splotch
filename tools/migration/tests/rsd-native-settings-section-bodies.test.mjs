import {
  caller,
  records,
  host,
  mount,
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

import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { PALETTE_FLOWS } from '../../../src/rsdDrawing/paletteGeometry.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../src/rsdDrawing/RsdIconButton.tsx';

import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SIZE_HELP,
} from '../../../src/settings/buttonSize.ts';
import { SECTION_SUBTITLES } from '../../../src/settings/settingsSections.ts';

// The Appearance, Sound and Accessibility section bodies (AppearanceSection.svelte,
// SoundSection.svelte, AccessibilitySection.svelte) mounted through the real Settings caller.
const SLIDER_WIDTH_PX = 400;

function sliderProps(label) {
  const props = records.props.findLast(
    (entry) => entry.accessibilityRole === 'adjustable' && entry['aria-label'] === label
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
