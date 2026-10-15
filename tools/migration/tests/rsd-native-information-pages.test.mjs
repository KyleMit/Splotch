import { caller, host, mount } from './rsd-native-selection-host.mjs';
import { Linking } from 'react-native';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { useCaller } from './rsd-native-ai-fixture.mjs';
import privacy from '../../../experiments/native-architecture/src/information/privacy.generated.json';
import { RELEASE_NOTES } from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import { GATE_MODAL, solveParentGate } from './rsd-parent-gate-keypad.mjs';
vi.mock('../../../experiments/native-architecture/src/platform/appPath.ts', () => ({
  openAppPage: vi.fn(),
  setDocumentTitle: vi.fn(() => 'Splotch'),
}));

afterEach(() => {
  delete Linking.openURL;
});

it('renders every shipping privacy paragraph and gates only the links that leave the app', async () => {
  Linking.openURL = vi.fn(async () => {});
  caller.settingsStorage = { read: async () => null, write: vi.fn() };
  useCaller();
  await mount(createElement(RsdDrawingScreen, { page: 'privacy' }));
  expect(host.querySelector(GATE_MODAL)).toBeNull();
  expect(host.textContent).toContain(privacy.native.title);
  expect(host.textContent).toContain(privacy.native.lede);
  for (const section of privacy.native.sections) {
    expect(host.textContent).toContain(section.title);
    for (const block of section.blocks)
      expect(host.textContent).toContain(block.spans.map(({ text }) => text).join(''));
  }
  const hosting = host.querySelector('[data-testid="privacy-section-hosting"]');
  expect(hosting.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  const policyLink = [...host.querySelectorAll('[role="link"]')].find((node) =>
    node.textContent.includes('OpenAI Services Agreement')
  );
  expect(policyLink).toBeDefined();
  await act(async () => policyLink.click());
  expect(host.querySelector(GATE_MODAL)).not.toBeNull();
  expect(Linking.openURL).not.toHaveBeenCalled();
  await solveParentGate();
  expect(Linking.openURL).toHaveBeenCalledWith('https://openai.com/policies/services-agreement/');
});

it('renders the complete bundled release history, newest first', async () => {
  useCaller();
  await mount(createElement(RsdDrawingScreen, { page: 'changelog' }));
  const headings = [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
  expect(headings.filter((title) => title.startsWith('Version '))).toEqual(
    RELEASE_NOTES.map(({ version }) => `Version ${version}`)
  );
  for (const release of RELEASE_NOTES)
    for (const section of release.sections)
      for (const block of section.blocks) expect(host.textContent).toContain(block.text);
  expect(host.querySelector(GATE_MODAL)).toBeNull();
});
