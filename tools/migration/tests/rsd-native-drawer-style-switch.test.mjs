import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import {
  caller,
  checkedRadio,
  expandControls,
  host,
  openSettingsSection,
  root,
} from './rsd-native-selection-host.mjs';
import { mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { ACTION_TILE_DISABLED_OPACITY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';

const STYLE_LABELS = { buttons: 'Raised', bare: 'Flat' };

const drawerTiles = () => [...host.querySelectorAll('[data-testid="rsd-drawer-tool"] button')];
// What each tile shows, read through the host's model of a native-driven opacity.
const shownOpacities = () => drawerTiles().map((tile) => Number(tile.dataset.shownOpacity));

async function rerender(overrides) {
  Object.assign(caller.screen, overrides);
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}

async function chooseButtonStyle(style) {
  await openSettingsSection('Appearance');
  const option = host.querySelector(
    `[role="radiogroup"][aria-label="Button style"] [aria-label="${STYLE_LABELS[style]}"]`
  );
  await act(async () => option.click());
  checkedRadio(option);
}

// A parked screen fades a Raised tile to its disabled opacity on the native driver, and that fade
// must not survive a Button style switch. Settings leaves the chrome at full strength and cannot
// open over a parked screen, so the screen is parked here directly while Settings switches.
it.each([
  ['buttons', 'bare'],
  ['bare', 'buttons'],
])(
  'rests the open drawer tiles at full strength after Settings switches Button style from %s to %s',
  async (from, to) => {
    await mountToolbar(toolbarScreen());
    await act(async () => caller.product.sound.owner.settings.setToolbarStyle(from));
    await expandControls();
    expect(drawerTiles().length).toBeGreaterThan(0);
    expect(shownOpacities().every((opacity) => opacity === 1)).toBe(true);
    await rerender({ settingsOpen: true, dialogOpen: true, disabled: true });
    const parked = from === 'buttons' ? ACTION_TILE_DISABLED_OPACITY : 1;
    expect(shownOpacities().every((opacity) => opacity === parked)).toBe(true);
    await chooseButtonStyle(to);
    await rerender({ settingsOpen: false, dialogOpen: false, disabled: false });
    expect(caller.sound.settings.toolbarStyle).toBe(to);
    expect(shownOpacities()).toEqual(drawerTiles().map(() => 1));
  }
);
