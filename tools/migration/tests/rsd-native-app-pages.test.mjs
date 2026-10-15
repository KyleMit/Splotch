import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  caller,
  host,
  mount,
  records,
  openSettingsSection,
  expandControls,
} from './rsd-native-selection-host.mjs';
import { Linking } from 'react-native';
import { ProbeApp } from '../../../experiments/native-architecture/src/ProbeApp.tsx';
import { openAppPage } from '../../../experiments/native-architecture/src/platform/appPath.ts';
import { ABOUT_COPY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAboutSection.tsx';
import {
  useCaller,
  reply,
  openPrompt,
  click,
  settle,
  pictureReply,
  drawingRequests,
  GATED_FLOW_TIMEOUT_MS,
} from './rsd-native-ai-fixture.mjs';

vi.mock('../../../experiments/native-architecture/src/platform/shippingFont.tsx', () => ({
  ShippingFontGate: ({ children }) => children,
}));

afterEach(async () => {
  await act(async () => openAppPage('drawing'));
});

it('keeps the mounted paper, product and Settings section beneath an internal page', async () => {
  useCaller();
  caller.realScreen = true;
  await mount(createElement(ProbeApp));
  const paper = host.querySelector('[data-testid="rsd-real-history-paper"]');
  await act(async () => paper.click());
  const drawing = caller.paper;
  const owner = caller.product.owner;
  const ai = caller.product.ai.owner;
  await expandControls();
  await click('Settings');
  await openSettingsSection('About');
  const about = host.querySelector(`[role="img"][aria-label="${ABOUT_COPY.mascot}"]`);
  const modalCard = host.querySelector('[data-testid="modal-card"]');
  const privacy = [...host.querySelectorAll('[role="link"]')].find((node) =>
    node.textContent.startsWith(ABOUT_COPY.privacy)
  );
  await act(async () => privacy.click());
  expect(host.textContent).toContain('Privacy policy');
  expect(caller.product.owner).toBe(owner);
  expect(caller.product.ai.owner).toBe(ai);
  expect(host.querySelector('[data-testid="rsd-real-history-paper"]')).toBe(paper);
  expect(caller.paper).toBe(drawing);
  expect(host.querySelector('[data-testid="modal-card"]')).toBe(modalCard);
  const stage = () =>
    records.props.findLast((props) => props.children?.props?.testID === 'modal-card');
  expect(stage().accessibilityElementsHidden).toBe(true);
  expect(stage().pointerEvents).toBe('none');
  expect(records.props.findLast((props) => props.testID === 'drawing-page').pointerEvents).toBe(
    'none'
  );
  const back = [...host.querySelectorAll('[role="link"]')].find(
    (node) => node.textContent === 'Back to drawing'
  );
  expect(back).toBeDefined();
  await act(async () => back.click());
  expect(host.querySelector(`[role="img"][aria-label="${ABOUT_COPY.mascot}"]`)).toBe(about);
  expect(host.querySelector('[data-testid="modal-card"]')).toBe(modalCard);
  expect(caller.product.owner).toBe(owner);
  expect(caller.paper).toBe(drawing);
  expect(stage().accessibilityElementsHidden).toBe(false);
});

it(
  'lets an approved AI request finish while an internal page covers the drawing',
  async () => {
    const pending = Promise.withResolvers();
    reply(() => pending.promise);
    useCaller();
    await mount(createElement(ProbeApp));
    await expandControls();
    await click('Settings');
    await openSettingsSection('AI Art');
    await click('Create AI Images');
    await click('Close');
    await openPrompt();
    await click('Sticker');
    await settle(() => expect(drawingRequests()).toHaveLength(1));
    const product = caller.product.owner;
    const ai = caller.product.ai.owner;
    const signal = drawingRequests()[0][1];
    await click('Keep drawing while this is made');
    await click('Settings');
    await openSettingsSection('About');
    const policy = [...host.querySelectorAll('[role="link"]')].find((node) =>
      node.textContent.startsWith(ABOUT_COPY.privacy)
    );
    await act(async () => policy.click());
    expect(signal.aborted).toBe(false);
    expect(caller.product.ai.owner).toBe(ai);
    await act(async () => pending.resolve(pictureReply()));
    await settle(() => expect(caller.product.ai.state.journal?.phase).toBe('result'));
    expect(host.textContent).toContain('Privacy policy');
    await act(async () => openAppPage('drawing'));
    expect(caller.product.owner).toBe(product);
    expect(caller.product.ai.owner).toBe(ai);
    expect(signal.aborted).toBe(false);
    await click('Close');
    await settle(() =>
      expect(host.querySelector('[aria-label="Show your finished picture"]')).not.toBeNull()
    );
  },
  GATED_FLOW_TIMEOUT_MS
);

it('withdraws a check raised by an information page when navigation leaves it', async () => {
  Linking.openURL = vi.fn(async () => {});
  try {
    useCaller();
    await mount(createElement(ProbeApp));
    const owner = caller.product.owner;
    await act(async () => openAppPage('privacy'));
    const link = [...host.querySelectorAll('[role="link"]')].find((node) =>
      node.textContent.includes('OpenAI Services Agreement')
    );
    await act(async () => link.click());
    expect(caller.product.state.gate.open).toBe(true);
    await act(async () => openAppPage('drawing'));
    expect(caller.product.owner).toBe(owner);
    expect(caller.product.state.gate.open).toBe(false);
    await settle(() =>
      expect(host.querySelector('[data-native-modal="Grown-Ups Only"]')).toBeNull()
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  } finally {
    delete Linking.openURL;
  }
});
