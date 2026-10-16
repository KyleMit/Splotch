import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  caller,
  host,
  mount,
  records,
  expandControls,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import {
  RsdPageSheet,
  NOT_FOUND_COPY,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdNotFoundPage.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { SHORT_PAGE_HEIGHT_PX } from '../../../web/src/lib/breakpoints.ts';
import releases from '../../../web/src/lib/releases.json';
import { ProbeApp } from '../../../experiments/native-architecture/src/ProbeApp.tsx';
import { ABOUT_COPY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAboutSection.tsx';
import { GATE_MODAL } from './rsd-parent-gate-keypad.mjs';
import { useCaller, click, settle } from './rsd-native-ai-fixture.mjs';

vi.mock('react-strict-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, css: { ...actual.css, props: () => ({}) } };
});

vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/pageTypography.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/pageTypography.web.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/notFoundFooter.tsx',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/notFoundFooter.web.tsx')
);

vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/notFoundLink.tsx',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/notFoundLink.web.tsx')
);

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

it.each(
  ['light', 'dark'].flatMap((theme) =>
    [SHORT_PAGE_HEIGHT_PX, SHORT_PAGE_HEIGHT_PX + 1].map((height) => ({ theme, height }))
  )
)(
  'keeps shipping’s browser text measure and wrapping at height $height in $theme',
  async ({ theme, height }) => {
    const shipping = readFileSync(
      join(import.meta.dirname, '../../../web/src/lib/components/page/PageShell.svelte'),
      'utf8'
    );
    expect(shipping).toContain('--page-measure: 62ch;');
    expect(shipping).toContain('text-wrap: balance;');
    records.os = 'web';
    records.dimensions = { width: 844, height, scale: 1, fontScale: 1 };
    await mount(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(RsdPageSheet, {
          title: 'Privacy policy',
          lede: 'The complete privacy introduction.',
        })
      )
    );
    const title = host.querySelector('[role="heading"]');
    const lede = title.parentElement.lastElementChild;
    expect(title.style.getPropertyValue('text-wrap')).toBe('balance');
    expect(lede.style.maxWidth).toBe('62ch');
    const toggle = [...host.querySelectorAll('button')].find(
      (node) => node.textContent === 'About this page'
    );
    await act(async () => toggle.click());
    expect(lede.style.maxWidth).toBe('62ch');
    expect(title.style.getPropertyValue('text-wrap')).toBe('balance');
  }
);

it.each([
  { label: 'Start drawing', path: '/', footer: false },
  { label: 'Changelog', path: '/changelog', footer: false },
  { label: 'Privacy', path: '/privacy', footer: false },
  { label: 'Send feedback', path: '/feedback', footer: true },
  { label: "What's new", path: `/changelog#${releases[0].id}`, footer: true },
])('navigates from the browser not-found page through $label', async ({ label, path, footer }) => {
  records.os = 'web';
  history.replaceState(null, '', '/unknown-page');
  useCaller();
  await mount(createElement(ProbeApp));
  expect(host.textContent).toContain(NOT_FOUND_COPY.title);
  const nav = host.querySelector('[aria-label="Splotch pages"]');
  expect(nav).not.toBeNull();
  const footerNode = nav.parentElement.parentElement;
  expect(footerNode).not.toBeNull();
  expect([...nav.querySelectorAll('[role="link"]')].map((node) => node.textContent)).toEqual([
    'Privacy',
    'Changelog',
    'Send feedback',
  ]);
  expect(
    [...footerNode.querySelector('[aria-label="Splotch pages"]').children[0].children].map(
      (node) => node.textContent
    )
  ).toEqual(['Privacy', 'Changelog', 'Send feedback']);
  const surface = footer ? footerNode : host.querySelector('[data-testid="information-page-body"]');
  const action = [...surface.querySelectorAll('button, a')].find(
    (node) => node.textContent === label
  );
  expect(action).toBeDefined();
  await act(async () => action.click());
  expect(`${location.pathname}${location.hash}`).toBe(path);
  expect(host.querySelector(GATE_MODAL)).toBeNull();
});

it('renders the not-found actions as real links with shipping page leading', async () => {
  records.os = 'web';
  history.replaceState(null, '', '/unknown-page');
  useCaller();
  await mount(createElement(ProbeApp));
  const links = [...host.querySelectorAll('[data-testid="information-page-body"] a[href]')];
  expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Start drawing', '/'],
    ['Changelog', '/changelog'],
    ['Privacy', '/privacy'],
  ]);
  const shipping = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/page/PageShell.svelte'),
    'utf8'
  );
  const pageLeading = shipping.match(/line-height: ([\d.]+);/)[1];
  for (const link of links) expect(link.style.lineHeight).toBe(pageLeading);
});

it.each([
  { label: 'Alt', altKey: true },
  { label: 'Control', ctrlKey: true },
  { label: 'Command', metaKey: true },
  { label: 'Shift', shiftKey: true },
  { label: 'middle click', button: 1 },
])(
  'leaves the browser in charge of $label on a not-found link',
  async ({ label, ...modifiers }) => {
    records.os = 'web';
    history.replaceState(null, '', '/unknown-page');
    useCaller();
    await mount(createElement(ProbeApp));
    const link = host.querySelector('[data-testid="information-page-body"] a[href="/privacy"]');
    expect(link).not.toBeNull();
    const browserDefault = vi.fn((event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
    });
    document.addEventListener('click', browserDefault);
    try {
      await act(async () =>
        link.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers })
        )
      );
      expect(browserDefault).toHaveBeenCalledOnce();
      expect(location.pathname).toBe('/unknown-page');
    } finally {
      document.removeEventListener('click', browserDefault);
    }
  }
);

it('preserves an already prevented not-found link activation', async () => {
  records.os = 'web';
  history.replaceState(null, '', '/unknown-page');
  useCaller();
  await mount(createElement(ProbeApp));
  const link = host.querySelector('[data-testid="information-page-body"] a[href="/privacy"]');
  expect(link).not.toBeNull();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  event.preventDefault();
  await act(async () => link.dispatchEvent(event));
  expect(location.pathname).toBe('/unknown-page');
});
