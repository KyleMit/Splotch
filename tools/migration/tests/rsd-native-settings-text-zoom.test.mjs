import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { SettingsTextZoom } from '../../../experiments/native-architecture/src/platform/SettingsTextZoom.tsx';
import { html } from 'react-strict-dom';
const touches = (...points) => ({
  nativeEvent: {
    touches: points.map(([pageX, pageY], identifier) => ({ pageX, pageY, identifier })),
  },
});
const props = (id) => records.props.findLast((entry) => entry.testID === id);
const boundary = () => props('settings-text-zoom');
const content = () => props('settings-text-zoom-content');
const children = createElement(html.button, { type: 'button', onClick: vi.fn() }, 'Keep drawing');

it('claims two fingers, reflows enlarged content and releases only after every finger lifts', async () => {
  await mount(createElement(SettingsTextZoom, { enabled: true }, children));
  await act(async () => {
    boundary().onLayout({ nativeEvent: { layout: { width: 300 } } });
    content().onLayout({ nativeEvent: { layout: { height: 100 } } });
  });
  expect(boundary().onStartShouldSetResponderCapture(touches([0, 0]))).toBe(false);
  expect(boundary().onStartShouldSetResponderCapture(touches([0, 0], [100, 0]))).toBe(true);
  await act(async () => {
    boundary().onResponderGrant(touches([0, 0], [100, 0]));
    boundary().onResponderMove(touches([0, 0], [200, 0]));
  });
  expect(content().style).toMatchObject({
    width: 150,
    transform: [{ scale: 2 }],
    transformOrigin: 'top left',
  });
  expect(boundary().style.height).toBe(200);
  boundary().onResponderEnd(touches([0, 0]));
  expect(boundary().onMoveShouldSetResponderCapture(touches([0, 0]))).toBe(true);
  boundary().onResponderRelease(touches());
  expect(boundary().onMoveShouldSetResponderCapture(touches([0, 0]))).toBe(false);
  await act(async () => root.render(createElement(SettingsTextZoom, { enabled: false }, children)));
  expect(content().style.transform).toEqual([{ scale: 1 }]);
  expect(content().style.width).toBe(300);
  expect(host.textContent).toContain('Keep drawing');
});

it('pins the shared zoom range and clamps a large or reversed pinch', async () => {
  await mount(createElement(SettingsTextZoom, { enabled: true }, children));
  await act(async () => {
    boundary().onResponderGrant(touches([0, 0], [100, 0]));
    boundary().onResponderMove(touches([0, 0], [1000, 0]));
  });
  expect(content().style.transform).toEqual([{ scale: 3 }]);
  await act(async () => boundary().onResponderMove(touches([0, 0], [1, 0])));
  expect(content().style.transform).toEqual([{ scale: 1 }]);
});
