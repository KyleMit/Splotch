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
const policyLink = () => host.querySelector(`a[href="${POLICY_LINK}"]`);

async function loadPolicyLinks() {
  records.os = 'web';
  records.dimensions = WIDE;
  Linking.openURL = vi.fn(async () => {});
  useCaller();
  await loadAt('/privacy');
  expect(policyLink().getAttribute('target')).toBe('_blank');
  expect(policyLink().getAttribute('rel')).toBe('noopener noreferrer');
}

async function activate(type, init = {}) {
  const event =
    type === 'dragstart'
      ? new Event(type, { bubbles: true, cancelable: true })
      : new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  await act(async () => policyLink().dispatchEvent(event));
  return event;
}

it.each([
  { name: 'a plain click', type: 'click' },
  // A browser answers Enter on a focused anchor with a click that has no pointer detail.
  { name: 'Enter', type: 'click', init: { detail: 0 } },
  { name: 'a Control click', type: 'click', init: { ctrlKey: true } },
  { name: 'a Command click', type: 'click', init: { metaKey: true } },
  { name: 'a Shift click', type: 'click', init: { shiftKey: true } },
  { name: 'an Alt click', type: 'click', init: { altKey: true } },
  { name: 'a middle click', type: 'auxclick', init: { button: 1 } },
  { name: 'a context menu', type: 'contextmenu', init: { button: 2 } },
])(
  'holds $name on a policy link that leaves the app behind the grown-up check',
  async ({ type, init }) => {
    try {
      await loadPolicyLinks();
      expect((await activate(type, init)).defaultPrevented).toBe(true);
      expect(host.querySelector(GATE_MODAL)).not.toBeNull();
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect((await activate('dragstart')).defaultPrevented).toBe(true);
      await solveParentGate();
      expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(POLICY_LINK);
    } finally {
      delete Linking.openURL;
    }
  }
);

it('opens a policy link at once, and leaves the browser its link menu, when the parent asks for no check', async () => {
  try {
    await loadPolicyLinks();
    const owner = caller.product.owner;
    await act(async () => owner.openParentCenter());
    await solveParentGate();
    await vi.waitFor(() => expect(owner.getState().parentCenterOpen).toBe(true));
    await act(async () => owner.setPolicy('externalLinks', 'never'));
    await act(async () => owner.closeParentCenter());
    expect(owner.gate.requires('externalLinks')).toBe(false);
    expect((await activate('contextmenu', { button: 2 })).defaultPrevented).toBe(false);
    expect((await activate('dragstart')).defaultPrevented).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect((await activate('auxclick', { button: 1 })).defaultPrevented).toBe(true);
    expect(owner.getState().gate.open).toBe(false);
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(POLICY_LINK);
  } finally {
    delete Linking.openURL;
  }
});
