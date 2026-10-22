import { act } from 'react';
import { expect, it, vi } from 'vitest';

import {
  expandControls,
  host,
  root,
  records,
  caller,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { Animated } from '../../../experiments/native-architecture/src/platform/animated.ts';
import './rsd-native-settings-hub-mocks.mjs';
import { drawerStore } from './rsd-native-launch-stores.mjs';
import { mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';

const drawerTiles = () => host.querySelectorAll('[data-testid="rsd-drawer-tool"]');
const chevron = (label) => host.querySelector(`[aria-label="${label}"]`);

function cascadeTimings(timing) {
  const values = new Set(
    records.props
      .filter((props) => props.testID === 'rsd-drawer-cascade')
      .map((props) => props.style.opacity)
  );
  return timing.mock.calls.filter(([value]) => values.has(value)).map(([, config]) => config);
}

async function launch() {
  await mountToolbar(toolbarScreen());
}

// A cold start: the app's tree goes away entirely and mounts again over the same storage.
async function relaunch() {
  await act(async () => root.unmount());
  host.remove();
  await launch();
}

function expectDrawer(open) {
  expect(drawerTiles().length > 0).toBe(open);
  expect(chevron(open ? 'Collapse controls' : 'Expand controls')).not.toBeNull();
}

it('reopens on the next launch the drawer a child left open', async () => {
  await launch();
  await expandControls();
  expectDrawer(true);
  expect(drawerStore.value).toBe('true');
  await relaunch();
  expectDrawer(true);
});

it('starts the next launch closed after a child closes a remembered open drawer', async () => {
  drawerStore.value = 'true';
  await launch();
  expectDrawer(true);
  await act(async () => chevron('Collapse controls').click());
  expectDrawer(false);
  expect(drawerStore.value).toBe('false');
  await relaunch();
  expectDrawer(false);
});

it.each(['TRUE', '1', 'yes', ''])(
  'starts closed when the stored drawer state is %j rather than a spelling shipping writes',
  async (stored) => {
    drawerStore.value = stored;
    await launch();
    expectDrawer(false);
  }
);

it('starts closed and still turns the drawer when its storage refuses every read and write', async () => {
  drawerStore.value = new Error('Storage is unavailable.');
  await launch();
  expectDrawer(false);
  await expandControls();
  expectDrawer(true);
});

it.each(['reduce motion', 'live stroke'])(
  'keeps the drawer cascade still for %s',
  async (reason) => {
    records.reduceMotion = reason === 'reduce motion';
    await mountToolbar(toolbarScreen({ drawing: reason === 'live stroke' }));
    const timing = vi.spyOn(Animated, 'timing');
    timing.mockClear();
    await expandControls();
    expect([...drawerTiles()]).not.toHaveLength(0);
    expect(cascadeTimings(timing)).toEqual([]);
    timing.mockRestore();
  }
);

it('does not replay the cascade on a remembered-open cold launch', async () => {
  drawerStore.value = 'true';
  const timing = vi.spyOn(Animated, 'timing');
  await launch();
  expectDrawer(true);
  expect(cascadeTimings(timing)).toEqual([]);
  timing.mockRestore();
});

it('force-opens the drawer for Button Size without the user-toggle cascade', async () => {
  await mountToolbar(toolbarScreen({ settingsOpen: true, dialogOpen: true }));
  await openSettingsSection('Accessibility');
  const timing = vi.spyOn(Animated, 'timing');
  const slider = () =>
    records.props.findLast(
      (props) => props.accessibilityRole === 'adjustable' && props['aria-label'] === 'Button Size'
    );
  await act(async () => slider().onResponderGrant({ nativeEvent: { identifier: 1, pageX: 100 } }));
  expect(drawerTiles().length).toBeGreaterThan(0);
  expect(cascadeTimings(timing)).toEqual([]);
  await act(async () => slider().onResponderRelease());
  expectDrawer(false);
  timing.mockRestore();
});

it("starts a first launch on shipping's drawerOpen default", async () => {
  await launch();
  expectDrawer(false);
});
it("cascades the opened drawer on shipping's clock and stagger", async () => {
  const timing = vi.spyOn(Animated, 'timing');
  await launch();
  timing.mockClear();
  await expandControls();
  const delays = cascadeTimings(timing)
    .filter((config) => config.duration === 200)
    .map((config) => config.delay);
  expect(delays).toEqual([...drawerTiles()].map((_, index) => index * 30));
  timing.mockRestore();
});
it("keeps shipping's stagger slots when intervening drawer tools are hidden", async () => {
  await mountToolbar(toolbarScreen(), { coloringBookEnabled: false });
  await act(async () => caller.product.sound.owner.settings.setScreenshotEnabled(false));
  const timing = vi.spyOn(Animated, 'timing');
  timing.mockClear();
  await expandControls();
  expect(cascadeTimings(timing).map((config) => config.delay)).toEqual([0, 30, 120, 150]);
  timing.mockRestore();
});
