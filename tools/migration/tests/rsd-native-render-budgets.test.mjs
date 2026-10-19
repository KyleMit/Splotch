// The census must load before anything that loads react-dom, so React reports its commits to it.
import { takeRenders } from './rsd-render-census.mjs';
import { act, createElement } from 'react';
import { beforeEach, expect, it } from 'vitest';
import {
  caller,
  records,
  host,
  mount,
  expandControls,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { DrawingSessionProvider } from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';

// Which components each chrome interaction renders, counted per component by the census
// (rsd-render-census.mjs) and, for the paper, by the selection host's NativePaper port, which
// stands where the native surface mounts: whatever renders the paper slot renders the surface.
// Every budget pairs a component that must render, so a census gone blind fails here rather than
// reading each zero as met.

const LANDSCAPE_PHONE = { width: 740, height: 360, scale: 1, fontScale: 1 };
const SLIDER_WIDTH_PX = 400;
const SLIDER_HEIGHT_PX = 36;
const GRAB_PX = 100;
const DRAG_PX = 140;
// The screen has settled once a pass this long commits nothing; the mount's settings read, owner
// attach and first paint each land within a few.
const SETTLE_PASS_MS = 20;
const MAX_SETTLE_PASSES = 50;

beforeEach(() => {
  caller.realScreen = true;
  storedSettings({ soundEnabled: true });
});

async function mountInked(dimensions) {
  if (dimensions) records.dimensions = dimensions;
  await mount(createElement(DrawingSessionProvider, null, createElement(RsdDrawingScreen)));
  await act(async () => host.querySelector('[aria-label="Draw RSD fixture stroke"]').click());
  await settle();
}

async function settle() {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    takeRenders();
    await act(async () => new Promise((resolve) => setTimeout(resolve, SETTLE_PASS_MS)));
    if (takeRenders().commits === 0) return;
  }
  throw new Error('The drawing screen kept committing.');
}

// What one interaction rendered: each component's render count, the commits they came in, and
// how many times the paper slot rendered.
async function rendered(interaction) {
  takeRenders();
  caller.paperRender.mockClear();
  await act(interaction);
  const { commits, renders } = takeRenders();
  return { commits, renders, paper: caller.paperRender.mock.calls.length };
}

const press = (label) => () => {
  const control = host.querySelector(`[aria-label="${label}"]`);
  expect(control, label).not.toBeNull();
  control.click();
};

function sliderProps(label) {
  const props = records.props.findLast(
    (entry) => entry.accessibilityRole === 'adjustable' && entry['aria-label'] === label
  );
  expect(props, label).toBeDefined();
  return props;
}

const touch = (pageX) => ({
  nativeEvent: { identifier: 1, pageX, touches: [{ identifier: 1, pageX }], changedTouches: [] },
});

async function grab(label) {
  await act(async () =>
    sliderProps(label).onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: SLIDER_WIDTH_PX, height: SLIDER_HEIGHT_PX } },
    })
  );
  await act(async () => sliderProps(label).onResponderGrant(touch(GRAB_PX)));
}

// Negative control: computing NativeDrawingLayout's paperNode without its useMemo renders the
// paper on every one of these.
it('opens and closes the Tool Drawer and its menus without rendering the paper', async () => {
  await mountInked();
  for (const step of [
    expandControls,
    press('Brushes'),
    press('Brushes'),
    press('Stroke width'),
    press('Stroke width'),
    press('Collapse controls'),
  ]) {
    const { renders, paper } = await rendered(step);
    expect(renders.RsdActionsPanel).toBeGreaterThan(0);
    expect(paper).toBe(0);
  }
});

it('opens and closes the landscape Color Menu without the paper, and a pick reaches it', async () => {
  await mountInked(LANDSCAPE_PHONE);
  const opened = await rendered(press('Colors'));
  expect(opened.renders.RsdColorMenu).toBe(1);
  expect(opened.paper).toBe(0);
  const closed = await rendered(press('Colors'));
  expect(closed.renders.RsdActionsPanel).toBeGreaterThan(0);
  expect(closed.paper).toBe(0);
  await act(press('Colors'));
  const picked = await rendered(press('Blue'));
  expect(caller.product.sound.settings.selectedColor).toBe('Blue');
  expect(picked.paper).toBeGreaterThan(0);
});

// A paint pick changes what the paper draws with, so it reaches the paper slot; how often the
// native surface under it renders is native-paper-surface-renders-mounted.test.mjs's budget.
it('repaints the swatches a paint pick moves between and reaches the paper', async () => {
  await mountInked();
  const { renders, paper } = await rendered(press('Blue'));
  expect(caller.product.sound.settings.selectedColor).toBe('Blue');
  expect(renders.RsdPaintAction).toBeGreaterThan(0);
  expect(paper).toBeGreaterThan(0);
});

// Button Size resizes the controls live, never the paper they float over. Negative control:
// handing RsdEdgeLayout a fresh paper function each render (inlining useChromeParts' paper)
// renders the paper at the grab and at every tick.
it('drags Button Size through the chrome it resizes, never the paper', async () => {
  await mountInked();
  await act(press('Settings'));
  await openSettingsSection('Accessibility');
  takeRenders();
  caller.paperRender.mockClear();
  await grab('Button Size');
  expect(caller.paperRender).not.toHaveBeenCalled();
  const tick = await rendered(() => sliderProps('Button Size').onResponderMove(touch(DRAG_PX)));
  expect(sliderProps('Button Size')['aria-valuenow']).toBeGreaterThan(100);
  expect(tick.renders.RsdActionsPanel).toBeGreaterThan(0);
  expect(tick.paper).toBe(0);
});

// Volume changes only its own slider and the pencil it previews. Negative control: an unmemoized
// RsdEdgeLayout renders the whole chrome, every swatch and the Actions Panel, at every tick.
it('drags Volume through its own slider, never the chrome or the paper', async () => {
  await mountInked();
  await act(press('Settings'));
  await openSettingsSection('Sound');
  await grab('Volume');
  const tick = await rendered(() => sliderProps('Volume').onResponderMove(touch(DRAG_PX)));
  expect(sliderProps('Volume')['aria-valuenow']).toBeGreaterThan(50);
  expect(tick.renders.RsdSlider).toBeGreaterThan(0);
  expect(tick.renders.RsdEdgeLayout).toBeUndefined();
  expect(tick.renders.RsdPaintAction).toBeUndefined();
  expect(tick.paper).toBe(0);
});
