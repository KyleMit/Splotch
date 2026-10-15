import { caller, host, mount, root, records } from './rsd-native-selection-host.mjs';
import { Linking } from 'react-native';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { PolicySpans } from '../../../experiments/native-architecture/src/rsdDrawing/RsdPrivacyContent.tsx';
import { useCaller } from './rsd-native-ai-fixture.mjs';
import privacy from '../../../experiments/native-architecture/src/information/privacy.generated.json';
import {
  MESSAGE_PROMPT_BY_KIND,
  REPORT_FORM_COPY,
} from '../../../experiments/native-architecture/src/feedback/reportFormCopy.ts';
import { FEEDBACK_PAGE_COPY } from '../../../experiments/native-architecture/src/information/feedbackPageCopy.ts';
import { openAppPage } from '../../../experiments/native-architecture/src/platform/appPath.ts';
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

it('activates a rendered policy link with Enter and leaves Space to page scrolling', () => {
  const onLink = vi.fn();
  const span = privacy.native.sections
    .flatMap((section) => section.blocks.flatMap((block) => block.spans))
    .find((span) => span.href === 'https://openai.com/policies/services-agreement/');
  expect(span).toBeDefined();
  const [link] = PolicySpans({ spans: [span], onLink });
  expect(link.props.children).toBe('OpenAI Services Agreement');
  link.props.onKeyDown({ key: ' ' });
  expect(onLink).not.toHaveBeenCalled();
  link.props.onKeyDown({ key: 'Enter' });
  expect(onLink).toHaveBeenCalledExactlyOnceWith(span.href);
});

it('keeps Settings closed when leaving a standalone reading page with Parent Center open', async () => {
  useCaller();
  await mount(createElement(RsdDrawingScreen, { page: 'privacy' }));
  await act(async () => caller.product.owner.openParentCenter());
  await solveParentGate();
  expect(caller.product.owner.getState().parentCenterOpen).toBe(true);
  expect(caller.screen.settingsOpen).toBe(false);
  await act(async () => root.render(createElement(RsdDrawingScreen, { page: 'drawing' })));
  expect(caller.product.owner.getState().parentCenterOpen).toBe(false);
  expect(caller.screen.settingsOpen).toBe(false);
});

it('renders the complete bundled release history, newest first', async () => {
  useCaller();
  await mount(createElement(RsdDrawingScreen, { page: 'changelog' }));
  const older = [...host.querySelectorAll('button')].find((node) =>
    node.textContent.includes('older releases')
  );
  await act(async () => older.click());
  const headings = [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
  expect(headings.filter((title) => title.startsWith('Version '))).toEqual(
    RELEASE_NOTES.map(({ version }) => `Version ${version}`)
  );
  for (const release of RELEASE_NOTES)
    for (const section of release.sections)
      for (const block of section.blocks) expect(host.textContent).toContain(block.text);
  expect(host.querySelector(GATE_MODAL)).toBeNull();
});

it('uses the standalone shipping Feedback hero and fields without a second Settings introduction', async () => {
  useCaller();
  caller.feedbackSend.mockReset().mockResolvedValue(new Response('{"ok":true}'));
  await mount(createElement(RsdDrawingScreen, { page: 'feedback' }));
  expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.title);
  expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.lede);
  expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.next);
  expect(host.textContent).not.toContain('Send Feedback');
  expect(
    [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent)
  ).not.toContain('Send Feedback');
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent === 'I have an idea')
      .click()
  );
  expect(host.textContent).toContain(REPORT_FORM_COPY.sendIdea);
  const field = records.props.findLast(
    (props) => props.accessibilityLabel === MESSAGE_PROMPT_BY_KIND.feature.label
  );
  await act(async () => field.onChange({ nativeEvent: { text: 'A bigger brush' } }));
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent === REPORT_FORM_COPY.sendIdea)
      .click()
  );
  expect(host.querySelector(GATE_MODAL)).toBeNull();
  expect(caller.feedbackSend).toHaveBeenCalledExactlyOnceWith(
    { kind: 'feature', message: 'A bigger brush', hp: '' },
    expect.any(AbortSignal)
  );
  expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.sentTitle);
  expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.sentStatus);
  expect(host.querySelector('input')).toBeNull();
  await act(async () =>
    [...host.querySelectorAll('[role="link"]')]
      .find((node) => node.textContent === FEEDBACK_PAGE_COPY.sendAnother)
      .click()
  );
  expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.title);
  await act(async () =>
    [...host.querySelectorAll('[role="link"]')]
      .find((node) => node.textContent === FEEDBACK_PAGE_COPY.privacy)
      .click()
  );
  expect(openAppPage).toHaveBeenCalledWith('privacy');
});
