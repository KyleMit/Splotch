import { act, createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { host, native, resetHost } from './rsd-native-control-host.mjs';
import { html } from 'react-strict-dom';
import { brand, themes } from '../../../web/src/lib/design/tokens.ts';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import {
  KEY_STEP,
  PAGE_STEP,
  SNAP_BAND_FRACTION,
} from '../../../experiments/native-architecture/src/rsdDrawing/sliderModel.ts';
import {
  RsdSliderRow,
  SLIDER_METRICS,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdSlider.tsx';
const TRACK_WIDTH_PX = 400;
const MIN = 40;
const MAX = 100;
const SNAP = 70;

// Each painted part's colour token, held both to the colour the port resolves and to the token the
// shipping selector assigns it.
const PAINT = {
  track: { selector: '.slider-track', property: 'background', token: 'controlTrack' },
  fill: { selector: '.slider-fill', property: 'background', token: 'brand' },
  notch: { selector: '.slider-notch', property: 'background', token: 'sliderNotch' },
};
const paint = (part, theme) => ({ ...themes[theme], ...brand })[PAINT[part].token];

const rgba = (value) =>
  value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );

let root, container, inputs, activity;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  host.layoutOf = () => ({ x: 0, y: 0, width: TRACK_WIDTH_PX, height: 28 });
  inputs = [];
  activity = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function Row({ initial, ...props }) {
  const [value, setValue] = useState(initial);
  return h(RsdSliderRow, {
    id: 'size',
    label: 'Button size',
    value,
    min: MIN,
    max: MAX,
    onInput: (next) => {
      inputs.push(next);
      setValue(next);
    },
    onActiveChange: (active) => activity.push(active),
    ...props,
  });
}

async function mount(props, theme = 'light') {
  await act(async () =>
    root.render(
      h(
        DrawingAppearanceProvider,
        { preference: theme },
        h(html.div, { style: theme === 'dark' ? darkTheme : null }, h(Row, props))
      )
    )
  );
}

const slider = () => container.querySelector('[role="slider"]');
const props = () => native(slider()).props;
const parts = () => {
  const [track, thumb] = slider().children;
  const [fill, notch] = track.children;
  return { track, thumb, fill, notch };
};
const style = (node) => native(node).style;
const touch = (identifier, pageX) => ({
  nativeEvent: { identifier, pageX, touches: [{ identifier, pageX }], changedTouches: [] },
});
const respond = (handler, event) => act(async () => props()[handler](event));
const key = (name) =>
  act(async () =>
    slider().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
  );

describe('semantics', () => {
  it('is a slider named by its label row and carrying its value as percent text', async () => {
    await mount({ initial: 60, help: 'Bigger buttons are easier to tap' });
    const label = container.querySelector('#size');
    expect(label.textContent).toBe('Button size60%');
    expect(slider().getAttribute('aria-labelledby')).toBe('size');
    expect(slider().getAttribute('aria-label')).toBe('Button size');
    expect(slider().getAttribute('aria-valuemin')).toBe(String(MIN));
    expect(slider().getAttribute('aria-valuemax')).toBe(String(MAX));
    expect(slider().getAttribute('aria-valuenow')).toBe('60');
    expect(slider().getAttribute('aria-valuetext')).toBe('60%');
    expect(props().tabIndex).toBe(0);
    expect(props().accessible).toBe(true);
    expect(props()['aria-describedby']).toBe('size-help');
    expect(container.querySelector('#size-help').textContent).toBe(
      'Bigger buttons are easier to tap'
    );
    expect(props().role).toBeUndefined();
    expect(props().accessibilityRole).toBe('adjustable');
    expect(props().accessibilityActions).toBeUndefined();
  });

  it('adjusts by one step for each assistive increment and decrement', async () => {
    await mount({ initial: 60 });
    const action = (actionName) =>
      act(async () => props().onAccessibilityAction({ nativeEvent: { actionName } }));
    await action('increment');
    await action('increment');
    await action('decrement');
    await action('activate');
    expect(inputs).toEqual([60 + KEY_STEP, 60 + 2 * KEY_STEP, 60 + KEY_STEP]);
    expect(slider().getAttribute('aria-valuetext')).toBe(`${60 + KEY_STEP}%`);
  });

  it.each(['ios', 'android', 'web'])(
    'keeps adjustable semantics and bounded actions on %s',
    async (platform) => {
      host.platform = platform;
      await mount({ initial: MAX });
      expect(slider().getAttribute('role')).toBe('slider');
      expect(props().accessibilityRole).toBe('adjustable');
      expect(props().role).toBeUndefined();
      expect(props().accessibilityActions).toEqual(
        platform === 'android' ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
      );
      const action = (actionName) =>
        act(async () => props().onAccessibilityAction({ nativeEvent: { actionName } }));
      await action('increment');
      expect(inputs).toEqual([]);
      await action('decrement');
      expect(inputs).toEqual([MAX - KEY_STEP]);
      expect(slider().getAttribute('aria-valuetext')).toBe(`${MAX - KEY_STEP}%`);
      await mount({ initial: MIN, key: 'lower-end' });
      inputs.length = 0;
      await action('decrement');
      expect(inputs).toEqual([]);
      await action('increment');
      expect(inputs).toEqual([MIN + KEY_STEP]);
      expect(slider().getAttribute('aria-valuetext')).toBe(`${MIN + KEY_STEP}%`);
    }
  );

  it('indents an icon-less row under its toggle and leads an icon row with the icon', async () => {
    await mount({ initial: 60 });
    expect(style(slider().parentElement).marginLeft).toBe(30);
    await mount({ initial: 60, icon: 'photo-size-select-small' });
    expect(style(slider().parentElement).marginLeft).toBeUndefined();
    expect(container.querySelector('#size svg').getAttribute('width')).toBe(
      String(SLIDER_METRICS.SETTING_ICON_PX)
    );
  });
});

describe('dragging', () => {
  it('moves the value by the distance travelled rather than jumping to the finger', async () => {
    await mount({ initial: 50 });
    await respond('onResponderGrant', touch(1, 300));
    await respond('onResponderMove', touch(1, 300 + TRACK_WIDTH_PX / 4));
    expect(inputs).toEqual([50 + (MAX - MIN) / 4]);
    await respond('onResponderMove', touch(1, 300 - TRACK_WIDTH_PX));
    expect(inputs.at(-1)).toBe(MIN);
    await respond('onResponderRelease', touch(1, 0));
    expect(activity).toEqual([true, false]);
  });

  it('sticks to the snap detent inside its band and lets go outside it', async () => {
    await mount({ initial: 50, snap: SNAP });
    const band = (MAX - MIN) * SNAP_BAND_FRACTION;
    const pxFor = (delta) => (delta / (MAX - MIN)) * TRACK_WIDTH_PX;
    await respond('onResponderGrant', touch(1, 100));
    await respond('onResponderMove', touch(1, 100 + pxFor(SNAP - 50 + band * 0.9)));
    expect(inputs).toEqual([SNAP]);
    await respond('onResponderMove', touch(1, 100 + pxFor(SNAP - 50 + band + 1)));
    expect(inputs.at(-1)).toBe(Math.round(SNAP + band + 1));
  });

  it('ignores a second finger and settles the preview when unmounted mid-drag', async () => {
    await mount({ initial: 50 });
    await respond('onResponderGrant', touch(1, 100));
    await respond('onResponderMove', touch(2, 400));
    expect(inputs).toEqual([]);
    await act(async () => root.render(null));
    expect(activity).toEqual([true, false]);
  });

  it('keeps the drag when another responder asks for it', async () => {
    await mount({ initial: 50 });
    expect(props().onResponderTerminationRequest()).toBe(false);
    expect(props().onStartShouldSetResponder()).toBe(true);
    let granted;
    await act(async () => {
      granted = props().onResponderGrant(touch(1, 100));
    });
    expect(granted).toBe(true);
  });
});

describe('keys', () => {
  it('steps, pages and jumps to the ends, never sticking at the detent', async () => {
    await mount({ initial: SNAP - 1, snap: SNAP });
    await key('ArrowRight');
    await key('ArrowUp');
    expect(inputs).toEqual([SNAP, SNAP + KEY_STEP]);
    await key('PageDown');
    expect(inputs.at(-1)).toBe(SNAP + KEY_STEP - PAGE_STEP);
    await key('End');
    await key('Home');
    await key('Tab');
    expect(inputs.slice(-2)).toEqual([MAX, MIN]);
    await key('ArrowLeft');
    expect(inputs.at(-1)).toBe(MIN);
    await act(async () => slider().dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })));
    expect(activity).toEqual([true, false]);
  });
});

describe('painting', () => {
  it('fills to the value, rides the disc inside the track and marks the detent', async () => {
    await mount({ initial: 85, snap: SNAP });
    const { track, thumb, fill, notch } = parts();
    const percent = ((85 - MIN) / (MAX - MIN)) * 100;
    expect(style(fill).width).toBe(`${percent}%`);
    expect(style(thumb).left).toBe(`${percent}%`);
    expect(style(thumb).marginLeft).toBe((-percent / 100) * SLIDER_METRICS.THUMB_PX);
    expect(style(notch).left).toBe(`${((SNAP - MIN) / (MAX - MIN)) * 100}%`);
    expect(style(track).height).toBe(SLIDER_METRICS.TRACK_PX);
    expect([style(thumb).width, style(thumb).height]).toEqual([36, 36]);
    expect(style(thumb).top).toBe((SLIDER_METRICS.TRACK_PX - SLIDER_METRICS.THUMB_PX) / 2);
  });

  it('draws no detent without a snap and an empty fill on a degenerate range', async () => {
    await mount({ initial: MIN, max: MIN });
    expect(parts().notch).toBeUndefined();
    expect(style(parts().fill).width).toBe('0%');
  });

  it('paints the track, fill, disc and notch from the theme on both papers', async () => {
    for (const theme of ['light', 'dark']) {
      await mount({ initial: 60, snap: SNAP }, theme);
      const { track, thumb, fill, notch } = parts();
      expect(style(track).backgroundColor, theme).toBe(paint('track', theme));
      expect(style(track).boxShadow, theme).toBe(SLIDER_METRICS.TRACK_SHADOW);
      expect(style(fill).backgroundColor, theme).toBe(paint('fill', theme));
      expect(style(thumb).backgroundColor, theme).toBe(SLIDER_METRICS.THUMB_FILL);
      expect(style(thumb).borderColor, theme).toBe(themes[theme].borderWarm);
      expect(style(notch).backgroundColor, theme).toBe(rgba(paint('notch', theme)));
    }
  });
});
