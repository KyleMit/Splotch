import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { native, resetHost } from './rsd-native-control-host.mjs';
import { RsdSegmentedPicker } from '../../../src/rsdDrawing/RsdSegmentedPicker.tsx';

const WEB_PLATFORM = '../../../src/rsdDrawing/pickerPlatform.ts';
vi.mock(
  '../../../src/rsdDrawing/pickerPlatform.ts',
  () => import('../../../src/rsdDrawing/pickerPlatform.native.ts')
);

// Android's View performs a click for Enter, Space or D-pad centre only while it is clickable, and
// React Native's ReactViewManager makes a view clickable only for focusable={true}: its click
// listener sends the click Pressability turns into onPress. A focusable={false} view stays
// focusable for TalkBack and focus search, so a keyboard can still land on it and do nothing.
const VIEW_MANAGER = join(
  import.meta.dirname,
  '../../../node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/view/ReactViewManager.kt'
);
const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System', disabled: true },
];

let root, container, selections;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  selections = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function Picker({ initial }) {
  const [selected, setSelected] = useState(initial);
  return h(RsdSegmentedPicker, {
    label: 'Theme',
    options: THEME_OPTIONS,
    selected,
    onSelect: (value) => {
      selections.push(value);
      setSelected(value);
    },
  });
}

const option = (label) => container.querySelector(`button[aria-label="${label}"]`);

async function androidActivationKey(label) {
  const props = native(option(label)).props;
  if (props.focusable !== false && props.disabled !== true)
    await act(async () => option(label).click());
}

it('holds the React Native premise: a focusable={false} view loses its click', () => {
  const manager = readFileSync(VIEW_MANAGER, 'utf8');
  const setFocusable = manager.slice(manager.indexOf('fun setFocusable('));
  expect(setFocusable.slice(0, setFocusable.indexOf('\n  }\n'))).toMatch(
    /if \(focusable\) \{\s+view\.setOnClickListener \{[\s\S]*\} else \{\s+view\.setOnClickListener\(null\)\s+view\.isClickable = false/
  );
});

it('selects a keyboard-focused unselected option with an Android activation key', async () => {
  await act(async () => root.render(h(Picker, { initial: 'light' })));
  await androidActivationKey('Dark');
  expect(selections).toEqual(['dark']);
  expect(option('Dark').getAttribute('aria-checked')).toBe('true');
  await androidActivationKey('System');
  expect(selections).toEqual(['dark']);
});

it('keeps the shipping single roving tab stop for the web build', async () => {
  const web = await vi.importActual(WEB_PLATFORM);
  const stops = (selectedIndex) =>
    THEME_OPTIONS.map((choice, index) =>
      web.optionTabIndex({
        rovingStop: index === selectedIndex,
        disabled: choice.disabled === true,
      })
    );
  expect(stops(1)).toEqual([-1, 0, -1]);
  expect(stops(0)).toEqual([0, -1, -1]);
});
