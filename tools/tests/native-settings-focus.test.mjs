// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativeSoundSettingsDialog } from '../../experiments/native-architecture/src/rsdDrawing/RsdSettingsDialog.tsx';
import { createSoundSettings } from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { DEFAULT_BRUSH_AVAILABILITY } from '../../experiments/native-architecture/src/settings/brushPreferences.ts';

// React Native Web's own Modal, focus trap, View and responder system decide where focus lands;
// only React Strict DOM is reduced to the plain elements its web build emits. Each platform split
// the web build resolves to its .web file resolves to it here too.
vi.mock('react-native', async () => import('react-native-web'));
vi.mock(
  '../../experiments/native-architecture/src/platform/sectionsSeen.ts',
  () => import('../../experiments/native-architecture/src/platform/sectionsSeen.web.ts')
);

// The web build resolves ModalScrim to its web file; Vitest resolves the native one.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/ModalScrim.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/ModalScrim.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdPressable.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdPressable.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/landFocus.ts',
  () => import('../../experiments/native-architecture/src/rsdDrawing/landFocus.web.ts')
);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/segmentThumb.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/segmentThumb.web.tsx')
);
vi.mock('../../experiments/native-architecture/src/platform/settingsSessions.ts', () => ({
  settingsSessions: { current: () => 0, subscribe: () => () => {}, load: async () => 0 },
}));
vi.mock('expo-screen-orientation', () => import('../migration/tests/rsd-orientation-port.mjs'));
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }) => createElement('svg', { 'aria-hidden': true }, children),
  Path: ({ d }) => createElement('path', { d }),
  SvgXml: () => null,
}));
vi.mock('react-strict-dom', () => {
  const element = (tag) =>
    forwardRef(({ style: _style, 'data-testid': testId, ...props }, ref) =>
      createElement(tag, { ...props, ref, 'data-testid': testId })
    );
  const tags = [
    'div',
    'span',
    'button',
    'header',
    'section',
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'ul',
    'ol',
    'li',
    'nav',
    'label',
  ];
  return {
    html: Object.fromEntries(tags.map((tag) => [tag, element(tag)])),
    css: {
      create: (styles) =>
        Object.fromEntries(
          Object.entries(styles).map(([key, value]) => [
            key,
            typeof value === 'function' ? () => null : null,
          ])
        ),
      defineVars: (values) => values,
      createTheme: () => null,
    },
  };
});

// happy-dom lets focus() land on any element; a browser only moves focus to a focusable area.
const NATIVELY_FOCUSABLE = 'button, input, select, textarea, a[href]';
const domFocus = HTMLElement.prototype.focus;
function focusLikeABrowser(options) {
  const focusable =
    this.hasAttribute('tabindex') || (this.matches(NATIVELY_FOCUSABLE) && !this.disabled);
  if (focusable) domFocus.call(this, options);
}

let root;
let host;
let owner;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.focus = focusLikeABrowser;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  owner?.dispose();
  document.body.replaceChildren();
  HTMLElement.prototype.focus = domFocus;
});

async function openSettings() {
  let settings;
  owner = createSoundSettings({ read: async () => null, write: async () => {} }, (next) => {
    settings = next;
  });
  await owner.load();
  const props = {
    settings,
    brushState: {
      status: 'ready',
      availability: DEFAULT_BRUSH_AVAILABILITY,
      saved: true,
      message: '',
    },
    notice: '',
    downloadedBooks: 0,
    ai: {
      owner: null,
      state: null,
      onToggle: vi.fn(),
      saveFailed: false,
      onRetrySave: vi.fn(),
      onOpenKeysPage: vi.fn(),
    },
    visible: true,
    scaleCeiling: 130,
    buttonScale: { value: 100, active: false, onInput: () => {}, onActiveChange: () => {} },
    soundVolume: { value: 50, active: false, onInput: () => {}, onActiveChange: () => {} },
    gate: null,
  };
  const noop = () => {};
  props.parentCenter = {
    unlocked: false,
    checkDue: true,
    onUnlock: noop,
    onLeave: noop,
    section: null,
  };
  const handlers = new Proxy({}, { get: () => noop });
  await act(async () =>
    root.render(createElement(NativeSoundSettingsDialog, { ...handlers, ...props }))
  );
}

const row = (title) =>
  [...document.querySelectorAll('[role="dialog"] button[aria-label]')].find((node) =>
    node.getAttribute('aria-label').startsWith(`${title}, `)
  );

async function press(node) {
  await act(async () => node.click());
}

it('lands focus on the section heading when the hub drills in, as shipping does', async () => {
  await openSettings();
  const sound = row('Sound');
  sound.focus();
  await press(sound);
  const heading = document.activeElement;
  expect(heading.tagName).toBe('H2');
  expect(heading.textContent).toBe('Sound');
  expect(heading.getAttribute('tabindex')).toBe('-1');
});

it('returns focus to the row Back came from, not the page body', async () => {
  await openSettings();
  await press(row('Accessibility'));
  await press(document.querySelector('[aria-label="Back"]'));
  expect(document.activeElement).toBe(row('Accessibility'));
});

it('leaves the hub title out of the tab order and initial focus on Close', async () => {
  await openSettings();
  expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
  expect(document.querySelector('[role="dialog"] h2').hasAttribute('tabindex')).toBe(false);
});
