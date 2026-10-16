// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ModalShell } from '../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx';
import { DialogHeader } from '../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx';
import { RsdConfirmCard } from '../../experiments/native-architecture/src/rsdDrawing/RsdConfirmCard.tsx';
import { RsdButton } from '../../experiments/native-architecture/src/rsdDrawing/RsdButton.tsx';
import { DeviceCheckbox } from '../../experiments/native-architecture/src/rsdDrawing/RsdDeviceOptInContent.tsx';
import { DialogScope } from '../../experiments/native-architecture/src/rsdDrawing/dialogScope.ts';
import { RsdPageSheet } from '../../experiments/native-architecture/src/rsdDrawing/RsdNotFoundPage.tsx';

// React Native Web's own Modal, focus trap, View and responder system decide where focus lands;
// only React Strict DOM is reduced to the plain elements its web build emits.
vi.mock('react-native', async () => import('react-native-web'));
vi.mock(
  '../../experiments/native-architecture/src/platform/KeyboardScope.tsx',
  () => import('../../experiments/native-architecture/src/platform/KeyboardScope.web.tsx')
);
vi.mock(
  '../../experiments/native-architecture/src/platform/flyoutFocus.ts',
  () => import('../../experiments/native-architecture/src/platform/flyoutFocus.web.ts')
);
vi.mock(
  '../../experiments/native-architecture/src/platform/bootAppearance.ts',
  () => import('../../experiments/native-architecture/src/platform/bootAppearance.web.ts')
);
const scrollChunk = vi.hoisted(() => ({ release: null }));
vi.mock(
  '../../experiments/native-architecture/src/platform/ScrollView.ts',
  () => import('../../experiments/native-architecture/src/platform/ScrollView.web.ts')
);
vi.mock('../../experiments/native-architecture/src/platform/ScrollViewContent.web.ts', async () => {
  await new Promise((resolve) => {
    scrollChunk.release = resolve;
  });
  return { ScrollView: (await import('react-native-web')).ScrollView };
});
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/landFocus.ts',
  () => import('../../experiments/native-architecture/src/rsdDrawing/landFocus.web.ts')
);

// The web build resolves ModalScrim to its web file; Vitest resolves the native one.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/ModalScrim.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/ModalScrim.web.tsx')
);
// The web build resolves RsdPressable to its web file; Vitest resolves the native one.
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/RsdPressable.tsx',
  () => import('../../experiments/native-architecture/src/rsdDrawing/RsdPressable.web.tsx')
);
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
vi.mock('react-strict-dom', () => ({
  html: Object.fromEntries(
    ['div', 'span', 'button', 'header', 'h1', 'h2', 'p', 'main'].map((tag) => [
      tag,
      ({ style: _style, 'data-testid': testId, ...props }) =>
        createElement(tag, { ...props, 'data-testid': testId }),
    ])
  ),
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
}));

// happy-dom lets focus() land on any element; a browser only moves focus to a focusable area. React
// Native Web's focus trap walks the dialog calling focus() until one sticks, so the browser rule
// decides where it lands.
const NATIVELY_FOCUSABLE = 'button, input, select, textarea, a[href]';
const domFocus = HTMLElement.prototype.focus;
function focusLikeABrowser(options) {
  const focusable =
    this.hasAttribute('tabindex') || (this.matches(NATIVELY_FOCUSABLE) && !this.disabled);
  if (focusable) domFocus.call(this, options);
}

const TITLE = 'Settings';
let root;
let host;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.focus = focusLikeABrowser;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  scrollChunk.release?.();
  await act(async () => root.unmount());
  document.body.replaceChildren();
  HTMLElement.prototype.focus = domFocus;
});

function dialog(onBack) {
  return createElement(
    ModalShell,
    {
      visible: true,
      label: TITLE,
      size: 'settings',
      onClose() {},
      header: createElement(DialogHeader, {
        title: TITLE,
        titleSize: 'xl',
        onBack,
        onClose() {},
      }),
    },
    createElement('button', { type: 'button' }, 'Sound')
  );
}

async function open(onBack) {
  const opener = document.createElement('button');
  opener.textContent = 'Settings';
  document.body.append(opener);
  opener.focus();
  await act(async () => root.render(dialog(onBack)));
  return opener;
}

const tabStops = () =>
  [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [tabindex]')]
    .filter((node) => node.getAttribute('tabindex') !== '-1' && !node.disabled)
    .map((node) => node.getAttribute('aria-label') ?? node.textContent);

it('keeps a cold dialog Close live and lands an information heading when its real web scroller mounts', async () => {
  const opener = document.createElement('button');
  opener.textContent = 'Privacy';
  document.body.append(opener);
  opener.focus();
  await act(async () => root.render(dialog(undefined)));
  await act(async () => vi.waitFor(() => expect(scrollChunk.release).toBeTypeOf('function')));
  expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
  expect(host.textContent).not.toContain('Sound');
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
  const scroll = createRef();
  await act(async () =>
    root.render(
      createElement(
        RsdPageSheet,
        { title: 'Privacy', lede: 'Privacy details', scrollRef: scroll },
        createElement('p', null, 'Privacy content')
      )
    )
  );
  await act(async () => vi.waitFor(() => expect(scrollChunk.release).toBeTypeOf('function')));
  expect(host.querySelector('h1')).toBeNull();
  expect(scroll.current).toBeNull();
  expect(document.activeElement).toBe(opener);
  await act(async () => scrollChunk.release());
  await act(async () => vi.waitFor(() => expect(host.querySelector('h1')).not.toBeNull()));
  expect(document.activeElement).toBe(host.querySelector('h1'));
  expect(scroll.current.getScrollableNode()).toBeInstanceOf(HTMLElement);
  expect(scroll.current.scrollTo).toBeTypeOf('function');
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
});

it('lands initial focus on the header Close, as shipping showModal() does, never on the scrim', async () => {
  await open(undefined);
  expect(document.activeElement.getAttribute('aria-label')).toBe('Close');
  expect(tabStops()[0]).toBe('Close');
  const scrim = document.querySelector('[data-testid="modal-backdrop"]');
  expect(scrim.getAttribute('aria-hidden')).toBe('true');
  expect(scrim.hasAttribute('tabindex')).toBe(false);
});

it('lands initial focus on Back when the header has one, ahead of Close and the body', async () => {
  await open(() => {});
  expect(document.activeElement.getAttribute('aria-label')).toBe('Back');
  expect(tabStops()).toEqual(['Back', 'Close', 'Sound']);
});

it('returns focus to the opener when the dialog closes', async () => {
  const opener = await open(undefined);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
});

function confirmation(ready, children) {
  return createElement(
    ModalShell,
    { visible: true, label: 'Report this picture', size: 'confirm', onClose() {}, header: null },
    ready
      ? createElement(
          RsdConfirmCard,
          {
            title: 'Report this picture',
            copy: 'The AI picture and drawing go to a grown-up at Splotch.',
            actions: [
              createElement(RsdButton, { key: 'cancel', onPress() {} }, 'Cancel'),
              createElement(RsdButton, { key: 'send', onPress() {} }, 'Send report'),
            ],
          },
          children
        )
      : null
  );
}

async function emptyConfirmation() {
  await act(async () => root.render(confirmation(false)));
  await act(async () => vi.waitFor(() => expect(scrollChunk.release).toBeTypeOf('function')));
  await act(async () => scrollChunk.release());
  await act(async () =>
    vi.waitFor(() => expect(host.querySelector('[data-testid="modal-body"]')).not.toBeNull())
  );
}

it('lands the shipping first choice when the confirmation body arrives after the web modal opens', async () => {
  const shipping = readFileSync(
    join(import.meta.dirname, '../../web/src/lib/components/AiImageReport.svelte'),
    'utf8'
  );
  const cancelAt = shipping.indexOf('>Cancel</Button>');
  const sendAt = shipping.indexOf("{sending ? 'Sending…' : 'Send report'}");
  expect(cancelAt).toBeGreaterThan(-1);
  expect(sendAt).toBeGreaterThan(cancelAt);
  expect(shipping).not.toContain('autofocus');
  const opener = document.createElement('button');
  opener.textContent = 'Report this picture';
  document.body.append(opener);
  opener.focus();
  await emptyConfirmation();
  expect(host.querySelector('[role="dialog"] button')).toBeNull();
  expect(document.activeElement).not.toBe(opener);
  await act(async () => root.render(confirmation(true)));
  const [cancel, send] = host.querySelectorAll('[role="dialog"] button');
  expect(cancel.textContent).toBe('Cancel');
  expect(document.activeElement).toBe(cancel);
  send.focus();
  await act(async () => root.render(confirmation(true, createElement('p', null, 'Preview ready'))));
  expect(document.activeElement).toBe(send);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
});

it('focuses a preceding problem report device opt-in when that control is present', async () => {
  const shipping = readFileSync(
    join(import.meta.dirname, '../../web/src/lib/components/AiImageReport.svelte'),
    'utf8'
  );
  const deviceAt = shipping.indexOf('mode="device-only"');
  const actionsAt = shipping.indexOf('class="ai-report-confirm-actions"');
  expect(deviceAt).toBeGreaterThan(-1);
  expect(actionsAt).toBeGreaterThan(deviceAt);
  await emptyConfirmation();
  await act(async () =>
    root.render(
      confirmation(
        true,
        createElement(DeviceCheckbox, { checked: false, onToggle() {} })
      )
    )
  );
  expect(document.activeElement.getAttribute('role')).toBe('checkbox');
  expect(document.activeElement.getAttribute('aria-checked')).toBe('false');
});

it('lands confirmation focus only when its dialog is active, including a retained reopening', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const card = (active) =>
    createElement(
      DialogScope,
      { value: { titleId: 'confirm-title', active } },
      createElement(RsdConfirmCard, {
        title: 'Leave Splotch?',
        copy: 'This drawing stays in the background.',
        actions: [
          createElement(RsdButton, { key: 'stay', onPress() {} }, 'Keep drawing'),
          createElement(RsdButton, { key: 'leave', onPress() {} }, 'Leave'),
        ],
      })
    );
  await act(async () => root.render(card(false)));
  expect(document.activeElement).toBe(opener);
  await act(async () => root.render(card(true)));
  const [stay, leave] = host.querySelectorAll('button');
  expect(document.activeElement).toBe(stay);
  leave.focus();
  await act(async () => root.render(card(false)));
  expect(document.activeElement).toBe(leave);
  opener.focus();
  await act(async () => root.render(card(true)));
  expect(document.activeElement).toBe(stay);
});


it('preserves a control that already took focus while the confirmation body mounted', async () => {
  await act(async () =>
    root.render(
      createElement(
        DialogScope,
        { value: { titleId: 'confirm-title', active: true } },
        createElement(RsdConfirmCard, {
          title: 'Report this picture',
          copy: 'The AI picture and drawing go to a grown-up at Splotch.',
          actions: [
            createElement(RsdButton, { key: 'cancel', onPress() {} }, 'Cancel'),
            createElement('button', { key: 'send', type: 'button', autoFocus: true }, 'Send report'),
          ],
        })
      )
    )
  );
  expect(document.activeElement.textContent).toBe('Send report');
});
