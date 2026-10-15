import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  caller,
  host,
  mount,
  expandControls,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { ProbeApp } from '../../../experiments/native-architecture/src/ProbeApp.tsx';
import { ABOUT_COPY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAboutSection.tsx';
import { useCaller, click, settle } from './rsd-native-ai-fixture.mjs';

vi.mock('../../../experiments/native-architecture/src/platform/shippingFont.tsx', () => ({
  ShippingFontGate: ({ children }) => children,
}));
vi.mock(
  '../../../experiments/native-architecture/src/platform/appPath.ts',
  () => import('../../../experiments/native-architecture/src/platform/appPath.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/platform/BrowserBack.tsx',
  () => import('../../../experiments/native-architecture/src/platform/BrowserBack.web.tsx')
);

afterEach(() => history.replaceState(null, '', '/'));
const BROWSER_HISTORY_SETTLE_MS = 50;

it('keeps the drawing and Settings mounted through browser Back and Forward between pages', async () => {
  history.replaceState(null, '', '/');
  useCaller();
  caller.realScreen = true;
  await mount(createElement(ProbeApp));
  const paper = host.querySelector('[data-testid="rsd-real-history-paper"]');
  await act(async () => paper.click());
  const drawing = caller.paper;
  const owner = caller.product.owner;
  await expandControls();
  await click('Settings');
  await openSettingsSection('About');
  const about = host.querySelector(`[role="img"][aria-label="${ABOUT_COPY.mascot}"]`);
  const privacy = [...host.querySelectorAll('[role="link"]')].find((node) =>
    node.textContent.startsWith(ABOUT_COPY.privacy)
  );
  await act(async () => privacy.click());
  expect(location.pathname).toBe('/privacy');
  expect(host.textContent).toContain('Privacy policy');
  expect(caller.product.owner).toBe(owner);
  await act(async () => history.back());
  await settle(() => expect(location.pathname).toBe('/'));
  expect(host.querySelector(`[role="img"][aria-label="${ABOUT_COPY.mascot}"]`)).toBe(about);
  expect(host.querySelector('[data-testid="rsd-real-history-paper"]')).toBe(paper);
  expect(caller.paper).toBe(drawing);
  expect(caller.product.owner).toBe(owner);
  expect(host.textContent).not.toContain('Privacy policy');
  await act(async () => new Promise((done) => setTimeout(done, BROWSER_HISTORY_SETTLE_MS)));
  await act(async () => history.forward());
  await settle(() => expect(location.pathname).toBe('/privacy'));
  expect(host.textContent).toContain('Privacy policy');
  expect(caller.product.owner).toBe(owner);
  expect(caller.paper).toBe(drawing);
});
