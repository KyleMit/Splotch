// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement as h, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { brand, scale } from '../../src/lib/design/tokens.ts';
import { Animated } from '../../src/platform/animated.ts';
import { RsdButton } from '../../src/rsdDrawing/RsdButton.tsx';
import { RsdIconButton } from '../../src/rsdDrawing/RsdIconButton.tsx';
import { RsdSegmentedPicker } from '../../src/rsdDrawing/RsdSegmentedPicker.tsx';
import { RsdHubRow } from '../../src/rsdDrawing/RsdHubRow.tsx';
import { RsdToggleSwitch } from '../../src/rsdDrawing/RsdToggleSwitch.tsx';
import { RsdSliderRow } from '../../src/rsdDrawing/RsdSlider.tsx';
import { RsdDisclosure } from '../../src/rsdDrawing/RsdDisclosure.tsx';
import { DialogHeader } from '../../src/rsdDrawing/DialogHeader.tsx';
import { RsdPageSheet } from '../../src/rsdDrawing/RsdNotFoundPage.tsx';
import { DeviceCheckbox } from '../../src/rsdDrawing/RsdDeviceOptIn.tsx';
import { RsdClearOverlay } from '../../src/rsdDrawing/RsdClearControl.tsx';
import { RsdAiStylePrompt } from '../../src/rsdDrawing/RsdAiStylePrompt.tsx';

// The web export's controls as the browser gets them: React Native Web's View and focus
// handling, each platform split's .web file, and React Strict DOM reduced to the plain elements
// and attributes its web build emits. The ring itself is src/strict.css, applied by happy-dom's
// cascade to whichever element the browser would focus.
vi.mock('react-native', async () => import('react-native-web'));
vi.mock(
  '../../src/platform/KeyboardScope.tsx',
  () => import('../../src/platform/KeyboardScope.web.tsx')
);
vi.mock(
  '../../src/rsdDrawing/DepartingSheetInk.tsx',
  () => import('../../src/rsdDrawing/DepartingSheetInk.web.tsx')
);
vi.mock('../../src/platform/flyoutFocus.ts', () => import('../../src/platform/flyoutFocus.web.ts'));
vi.mock(
  '../../src/platform/bootAppearance.ts',
  () => import('../../src/platform/bootAppearance.web.ts')
);
vi.mock('../../src/rsdDrawing/landFocus.ts', () => import('../../src/rsdDrawing/landFocus.web.ts'));
// The web build resolves ModalScrim to its web file; Vitest resolves the native one.
vi.mock(
  '../../src/rsdDrawing/ModalScrim.tsx',
  () => import('../../src/rsdDrawing/ModalScrim.web.tsx')
);
vi.mock(
  '../../src/rsdDrawing/RsdPressable.tsx',
  () => import('../../src/rsdDrawing/RsdPressable.web.tsx')
);
vi.mock(
  '../../src/rsdDrawing/RsdToggleSwitch.tsx',
  () => import('../../src/rsdDrawing/RsdToggleSwitch.web.tsx')
);
vi.mock(
  '../../src/rsdDrawing/segmentThumb.tsx',
  () => import('../../src/rsdDrawing/segmentThumb.web.tsx')
);
vi.mock(
  '../../src/platform/clearActivation.ts',
  () => import('../../src/platform/clearActivation.web.ts')
);
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }) => h('svg', { 'aria-hidden': true }, children),
  Path: ({ d }) => h('path', { d }),
  SvgXml: () => null,
}));
vi.mock('react-strict-dom', () => {
  const elements = new Map();
  const element = (tag) => {
    if (!elements.has(tag))
      elements.set(
        tag,
        forwardRef(({ style: _style, for: htmlFor, ...props }, ref) =>
          h(tag, { ...props, htmlFor, ref })
        )
      );
    return elements.get(tag);
  };
  return {
    html: new Proxy({}, { get: (_, tag) => element(tag) }),
    css: {
      create: (styles) =>
        Object.fromEntries(
          Object.entries(styles).map(([key, value]) => [
            key,
            typeof value === 'function' ? () => null : null,
          ])
        ),
      props: () => ({}),
      defineVars: (values) => values,
      createTheme: () => null,
    },
  };
});

const root = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
// The stylesheet without React Strict DOM's own rules, which the postcss plugin expands in place
// of its directive.
const RING_RULES = read('src/strict.css').replace('@react-strict-dom;', '');

// A selector list split at its own commas, not those inside :is() or :where().
function selectorList(selectors) {
  const list = [''];
  let depth = 0;
  for (const char of selectors.trim()) {
    if (char === ',' && depth === 0) list.push('');
    else {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      list[list.length - 1] += char;
    }
  }
  return list.map((selector) => selector.trim().replaceAll('"', "'"));
}

// Each rule of a stylesheet (or a component's <style> block) by its selector list, with its
// declarations. Nested at-rules are not split out, so only top-level rules are looked up.
function rules(css) {
  const flat = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat
    .split('}')
    .map((chunk) => chunk.split('{'))
    .filter((parts) => parts.length === 2)
    .map(([selectors, body]) => ({
      selectors: selectorList(selectors),
      declarations: Object.fromEntries(
        body
          .split(';')
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .map((declaration) => {
            const colon = declaration.indexOf(':');
            return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
          })
      ),
    }));
}

function rule(css, selector) {
  const found = rules(css).find(({ selectors }) => selectors.includes(selector));
  if (!found) throw new Error(`no rule for ${selector}`);
  return found.declarations;
}

const RING = `${scale.focusRingWidth} solid ${brand.brand}`;
const RING_OFFSET = scale.focusRingOffset;
const DISCLOSURE_OFFSET = `-${scale.focusRingOffset}`;
const AI_HALO = {
  'border-color': brand.brand,
  'box-shadow': `0 0 0 3px color-mix(in srgb, ${brand.brand} 35%, transparent)`,
};
const BLOB_RADII = {
  radiusBlob1: scale.radiusBlob1,
  radiusBlob2: scale.radiusBlob2,
};

let host;
let reactRoot;
let probe = 0;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sheet = document.createElement('style');
  sheet.textContent = RING_RULES;
  document.head.append(sheet);
  host = document.createElement('div');
  document.body.append(host);
  reactRoot = createRoot(host);
});

afterEach(async () => {
  await act(async () => reactRoot.unmount());
  document.head.replaceChildren();
  document.body.replaceChildren();
});

it('matches focus tokens, inset, halo and blob radii in the web export stylesheet', () => {
  expect(rule(RING_RULES, ':focus-visible')).toEqual({
    outline: RING,
    'outline-offset': RING_OFFSET,
  });
  expect(
    rule(RING_RULES, "[data-focus-ring='part']:focus-visible [data-focus-ring-part='ring']")
  ).toEqual({ outline: RING, 'outline-offset': RING_OFFSET });
  expect(rule(RING_RULES, "[data-focus-ring='part']:focus-visible")).toEqual({ outline: 'none' });
  expect(rule(RING_RULES, "[data-focus-ring='inset']:focus-visible")).toEqual({
    'outline-offset': DISCLOSURE_OFFSET,
  });
  expect(
    rule(RING_RULES, "[data-focus-ring='part']:focus-visible [data-focus-ring-part='halo']")
  ).toEqual(AI_HALO);
  for (const [shape, radius] of Object.entries(BLOB_RADII)) {
    expect(rule(RING_RULES, `[data-focus-ring='${shape}']:focus-visible`)).toEqual({
      'border-radius': radius,
    });
  }
});

async function mount(element) {
  await act(async () => reactRoot.render(element));
}

// happy-dom caches computed style until the DOM changes, and focus is not a DOM change.
function computed(element) {
  document.body.setAttribute('data-style-probe', String(++probe));
  return getComputedStyle(element);
}

const painted = (element) => {
  const style = computed(element);
  return style.outlineStyle === 'solid' || style.boxShadow !== '';
};

// Focuses the control and finds the element that paints its ring: itself, or the part it marks.
function ringOf(control) {
  control.focus();
  expect(document.activeElement).toBe(control);
  const element = [control, ...control.querySelectorAll('*')].find(painted);
  if (!element) return null;
  const style = computed(element);
  return {
    on: element === control ? 'self' : 'part',
    element,
    outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
    offset: style.outlineOffset,
    radius: style.borderRadius,
    borderColor: style.borderColor,
    boxShadow: style.boxShadow,
  };
}

// happy-dom keeps only the horizontal radii of an elliptical border-radius, so a blob is compared
// through the same parser; the stylesheet test above checks the full value against the design tokens.
function parsedRadius(value) {
  const probeElement = document.createElement('div');
  probeElement.style.borderRadius = value;
  document.body.append(probeElement);
  return computed(probeElement).borderRadius;
}

const noop = () => {};
const byLabel = (label) => document.querySelector(`[aria-label="${label}"]`);

const OUTLINED = [
  [
    'a design Button',
    () => h(RsdButton, { variant: 'brand', onPress: noop }, 'Send report'),
    () => document.querySelector('button'),
  ],
  [
    'a corner icon button',
    () => h(RsdIconButton, { skin: 'corner', icon: 'settings', label: 'Settings', onPress: noop }),
    () => byLabel('Settings'),
  ],
  [
    'a segmented option',
    () =>
      h(RsdSegmentedPicker, {
        label: 'Theme',
        options: [
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        selected: 'light',
        onSelect: noop,
      }),
    () => byLabel('Light'),
  ],
  [
    'a hub row',
    () =>
      h(RsdHubRow, {
        icon: 'sound',
        title: 'Sound',
        subtitle: 'Volume 50%',
        unseen: false,
        onOpen: noop,
      }),
    () => byLabel('Sound, Volume 50%'),
  ],
];

it.each(OUTLINED)('rings %s on its own box', async (_, render, find) => {
  await mount(render());
  const ring = ringOf(find());
  expect(ring).toMatchObject({ on: 'self', outline: RING, offset: RING_OFFSET });
});

it('rings the toggle switch track, not its taller hit area, as shipping rings ::before', async () => {
  await mount(h(RsdToggleSwitch, { id: 'sound', label: 'Sound', checked: true, onToggle: noop }));
  const ring = ringOf(byLabel('Sound'));
  expect(ring).toMatchObject({ on: 'part', outline: RING, offset: RING_OFFSET });
  expect(ring.element.getAttribute('data-testid')).toBe('toggle-switch-track');
});

it('rings the slider track, the pill shipping rounds its focused slider to', async () => {
  await mount(h(RsdSliderRow, { id: 'volume', label: 'Volume', value: 50, onInput: noop }));
  const slider = document.querySelector('[role="slider"]');
  const ring = ringOf(slider);
  expect(ring).toMatchObject({ on: 'part', outline: RING, offset: RING_OFFSET });
  expect(ring.element.parentElement).toBe(slider);
});

it('rings the device checkbox square around its box, not the whole labelled row', async () => {
  await mount(h(DeviceCheckbox, { checked: false, onToggle: noop }));
  const ring = ringOf(document.querySelector('[role="checkbox"]'));
  expect(ring).toMatchObject({ on: 'part', outline: RING, offset: RING_OFFSET });
});

it('draws the disclosure summary ring inside the panel that clips it', async () => {
  await mount(h(RsdDisclosure, { summary: 'Install as App' }, h('p', null, 'Steps')));
  const ring = ringOf(document.querySelector('[aria-expanded]'));
  expect(ring).toMatchObject({ on: 'self', outline: RING, offset: DISCLOSURE_OFFSET });
});

it('rounds the dialog Back and Close rings to the blobs they paint', async () => {
  await mount(h(DialogHeader, { title: 'Sound', titleSize: 'xl', onBack: noop, onClose: noop }));
  for (const [label, shape] of [
    ['Back', 'radiusBlob1'],
    ['Close', 'radiusBlob2'],
  ]) {
    const ring = ringOf(byLabel(label));
    expect(ring, label).toMatchObject({ on: 'self', outline: RING, offset: RING_OFFSET });
    expect(ring.radius, label).toBe(parsedRadius(BLOB_RADII[shape]));
  }
});

it('rounds the floating close, the parental gate close, to its blob', async () => {
  await mount(h(DialogHeader, { onClose: noop }));
  const ring = ringOf(byLabel('Close'));
  expect(ring).toMatchObject({ on: 'self', outline: RING, offset: RING_OFFSET });
  expect(ring.radius).toBe(parsedRadius(BLOB_RADII.radiusBlob2));
});

const DOCK = { top: 48, right: 0, size: 70, iconSize: 40 };

it('rings the docked Clear half-disc rather than its square host', async () => {
  const value = () => new Animated.Value(0);
  const control = {
    values: {
      drag: new Animated.ValueXY(),
      emphasis: value(),
      lift: value(),
      liftReturn: value(),
      ring: value(),
      ringScale: value(),
    },
    dragging: false,
    reached: false,
    clearing: false,
    ringShown: false,
    coachmark: false,
    reduced: false,
    radius: 120,
    dock: DOCK,
    responder: {},
    activate: noop,
  };
  await mount(h(RsdClearOverlay, { control, disabled: false }));
  const ring = ringOf(byLabel('Clear drawing'));
  expect(ring).toMatchObject({ on: 'part', outline: RING, offset: RING_OFFSET });
  expect(ring.element.getAttribute('data-testid')).toBe('rsd-clear-face');
});

it('lights the AI style cover with shipping halo instead of ringing the whole option', async () => {
  await mount(h(RsdAiStylePrompt, { visible: true, onPick: noop, onClose: noop, onDismiss: noop }));
  const option = document.querySelector('button[aria-label]:not([aria-label="Close"])');
  const ring = ringOf(option);
  expect(ring).toMatchObject({
    on: 'part',
    borderColor: AI_HALO['border-color'],
    boxShadow: AI_HALO['box-shadow'],
  });
  expect(computed(option).outlineStyle).toBe('none');
});

it('moves reading-page focus to the heading without a control outline', async () => {
  await mount(
    h(RsdPageSheet, { title: 'Changelog', lede: 'Every release' }, h('p', null, 'Notes'))
  );
  const heading = host.querySelector('h1');
  expect(document.activeElement).toBe(heading);
  expect(heading.hasAttribute('data-page-heading')).toBe(true);
  expect(computed(heading).outlineStyle).toBe('none');
});
