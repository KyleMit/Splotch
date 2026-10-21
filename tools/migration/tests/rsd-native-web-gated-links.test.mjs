// The privacy policy's links that leave the app, as the RN web export renders them: real anchors
// whose every activation still answers to the parent's Viewing external links setting.
import { caller, host, mount, records, root } from './rsd-native-selection-host.mjs';
import { Linking } from 'react-native';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProbeApp } from '../../../experiments/native-architecture/src/ProbeApp.tsx';
import { GATE_MODAL, solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { useCaller } from './rsd-native-ai-fixture.mjs';

vi.mock('react-strict-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, css: { ...actual.css, props: () => ({}) } };
});
vi.mock('../../../experiments/native-architecture/src/platform/shippingFont.tsx', () => ({
  ShippingFontGate: ({ children }) => children,
}));
vi.mock(
  '../../../experiments/native-architecture/src/platform/appPath.ts',
  () => import('../../../experiments/native-architecture/src/platform/appPath.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/platform/informationFragment.ts',
  () => import('../../../experiments/native-architecture/src/platform/informationFragment.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/platform/BrowserBack.tsx',
  () => import('../../../experiments/native-architecture/src/platform/BrowserBack.web.tsx')
);
vi.mock(
  '../../../experiments/native-architecture/src/platform/drawingArrival.ts',
  () => import('../../../experiments/native-architecture/src/platform/drawingArrival.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/platform/drawingVisited.ts',
  () => import('../../../experiments/native-architecture/src/platform/drawingVisited.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/platform/parentPlatform.ts',
  () => import('../../../experiments/native-architecture/src/platform/parentPlatform.web.ts')
);

afterEach(() => {
  history.replaceState(null, '', '/');
  sessionStorage.clear();
  delete Linking.openURL;
});

const WIDE = { width: 1280, height: 900, scale: 1, fontScale: 1 };

async function loadAt(path) {
  if (root) await act(async () => root.unmount());
  history.replaceState(null, '', path);
  await mount(createElement(ProbeApp));
}

const POLICY_LINK = 'https://openai.com/policies/services-agreement/';
const POLICY_LABEL = 'OpenAI Services Agreement';
const policyLink = () =>
  [...host.querySelectorAll('a')].find((node) => node.textContent === POLICY_LABEL);

async function loadPolicyLinks() {
  records.os = 'web';
  records.dimensions = WIDE;
  Linking.openURL = vi.fn(async () => {});
  useCaller();
  await loadAt('/privacy');
}

async function chooseExternalLinks(mode) {
  const owner = caller.product.owner;
  await act(async () => owner.openParentCenter());
  await solveParentGate();
  await vi.waitFor(() => expect(owner.getState().parentCenterOpen).toBe(true));
  await act(async () => owner.setPolicy('externalLinks', mode));
  await act(async () => owner.closeParentCenter());
}

async function activate(type, init = {}) {
  const event =
    type === 'keydown'
      ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
      : new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  await act(async () => policyLink().dispatchEvent(event));
  return event;
}

it.each([
  { name: 'a plain click', type: 'click' },
  { name: 'Enter', type: 'keydown', init: { key: 'Enter' } },
  { name: 'a Control click', type: 'click', init: { ctrlKey: true } },
  { name: 'a Command click', type: 'click', init: { metaKey: true } },
  { name: 'a Shift click', type: 'click', init: { shiftKey: true } },
  { name: 'an Alt click', type: 'click', init: { altKey: true } },
  { name: 'a middle click', type: 'auxclick', init: { button: 1 } },
])(
  'holds $name on a policy link that leaves the app behind the grown-up check',
  async ({ type, init }) => {
    await loadPolicyLinks();
    expect((await activate(type, init)).defaultPrevented).toBe(true);
    expect(host.querySelector(GATE_MODAL)).not.toBeNull();
    expect(Linking.openURL).not.toHaveBeenCalled();
    await solveParentGate();
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(POLICY_LINK);
  }
);

// Firefox's Shift-right-click menu, a screen reader's open-in-new-tab and iOS Safari's long-press
// preview reach an href without an event the page can answer, so a due check leaves none to reach.
it('keeps the address off a policy link while its check is due, and a link by role and focus', async () => {
  await loadPolicyLinks();
  expect(policyLink().hasAttribute('href')).toBe(false);
  expect(policyLink().getAttribute('role')).toBe('link');
  expect(policyLink().tabIndex).toBe(0);
});

// A prerendered page document read without JavaScript cannot run the check, so the address it
// keeps off the link is named beside it as plain text, which no script-enabled browser shows.
it('names a policy link’s address beside it for a reader without JavaScript', async () => {
  await loadPolicyLinks();
  const note = policyLink().nextElementSibling;
  expect(note.tagName).toBe('NOSCRIPT');
  expect(note.textContent).toBe(' (openai.com/policies/services-agreement)');
});

it('gives a policy link its address, and opens it at once, when the parent asks for no check', async () => {
  await loadPolicyLinks();
  await chooseExternalLinks('never');
  const owner = caller.product.owner;
  expect(owner.gate.requires('externalLinks')).toBe(false);
  expect(policyLink().getAttribute('href')).toBe(POLICY_LINK);
  expect(policyLink().getAttribute('target')).toBe('_blank');
  expect(policyLink().getAttribute('rel')).toBe('noopener noreferrer');
  expect((await activate('auxclick', { button: 1 })).defaultPrevented).toBe(true);
  expect(owner.getState().gate.open).toBe(false);
  expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(POLICY_LINK);
  await chooseExternalLinks('always');
  expect(policyLink().hasAttribute('href')).toBe(false);
});
