import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  caller,
  host,
  mount,
  records,
  root,
  expandControls,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { RsdPageSheet, NOT_FOUND_COPY } from '../../../src/rsdDrawing/RsdNotFoundPage.tsx';
import { DrawingAppearanceProvider } from '../../../src/drawing/DrawingAppearance.tsx';
import { SHORT_PAGE_HEIGHT_PX } from '../../../src/lib/breakpoints.ts';
import releases from '../../../src/lib/releases.json';
import { SECTIONS } from '../../../src/lib/privacy/contents.ts';
import { ProbeApp } from '../../../src/ProbeApp.tsx';
import { openAppPage } from '../../../src/platform/appPath.ts';
import { ABOUT_COPY } from '../../../src/rsdDrawing/RsdAboutSection.tsx';
import { FEEDBACK_PAGE_COPY } from '../../../src/information/feedbackPageCopy.ts';
import { GATE_MODAL } from './rsd-parent-gate-keypad.mjs';
import { useCaller, click, settle } from './rsd-native-ai-fixture.mjs';

vi.mock('react-strict-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, css: { ...actual.css, props: () => ({}) } };
});

vi.mock(
  '../../../src/rsdDrawing/pageTypography.ts',
  () => import('../../../src/rsdDrawing/pageTypography.web.ts')
);
vi.mock(
  '../../../src/rsdDrawing/notFoundFooter.tsx',
  () => import('../../../src/rsdDrawing/notFoundFooter.web.tsx')
);

vi.mock(
  '../../../src/rsdDrawing/notFoundLink.tsx',
  () => import('../../../src/rsdDrawing/notFoundLink.web.tsx')
);

vi.mock('../../../src/platform/shippingFont.tsx', () => ({
  ShippingFontGate: ({ children }) => children,
}));
vi.mock('../../../src/platform/appPath.ts', () => import('../../../src/platform/appPath.web.ts'));
vi.mock(
  '../../../src/platform/informationFragment.ts',
  () => import('../../../src/platform/informationFragment.web.ts')
);
vi.mock(
  '../../../src/platform/BrowserBack.tsx',
  () => import('../../../src/platform/BrowserBack.web.tsx')
);
vi.mock(
  '../../../src/platform/drawingArrival.ts',
  () => import('../../../src/platform/drawingArrival.web.ts')
);
vi.mock(
  '../../../src/platform/drawingVisited.ts',
  () => import('../../../src/platform/drawingVisited.web.ts')
);

afterEach(() => {
  history.replaceState(null, '', '/');
  sessionStorage.clear();
  delete document.referrer;
});
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
  'keeps browser text measure and wrapping at height $height in $theme',
  async ({ theme, height }) => {
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
  expect(
    [...nav.querySelectorAll('a[href]')].map((node) => [
      node.textContent,
      node.getAttribute('href'),
    ])
  ).toEqual([
    ['Privacy', '/privacy'],
    ['Changelog', '/changelog'],
    ['Send feedback', '/feedback'],
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

it('renders the not-found actions as real links with page leading', async () => {
  records.os = 'web';
  history.replaceState(null, '', '/unknown-page');
  useCaller();
  await mount(createElement(ProbeApp));
  const actions = host.querySelector('[data-testid="information-page-body"] [role="list"]');
  const links = [...actions.querySelectorAll('a[href]')];
  expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Start drawing', '/'],
    ['Changelog', '/changelog'],
    ['Privacy', '/privacy'],
  ]);
  for (const link of links) expect(link.style.lineHeight).toBe('1.62');
});

it.each([
  { label: 'Alt', altKey: true },
  { label: 'Control', ctrlKey: true },
  { label: 'Command', metaKey: true },
  { label: 'Shift', shiftKey: true },
  { label: 'middle click', button: 1 },
])(
  'leaves the browser in charge of $label on a not-found link',
  async ({ label: _label, ...modifiers }) => {
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

it('applies browser typography after actual information-page navigation remounts its nodes', async () => {
  records.os = 'web';
  history.replaceState(null, '', '/privacy');
  useCaller();
  await mount(createElement(ProbeApp));
  const first = host.querySelector('[role="heading"]');
  for (const page of ['changelog', 'privacy']) {
    await act(async () => openAppPage(page));
    const title = host.querySelector('[role="heading"]');
    expect(title).not.toBe(first);
    expect(title.style.getPropertyValue('text-wrap')).toBe('balance');
    expect(title.parentElement.lastElementChild.style.maxWidth).toBe('62ch');
  }
});

const mastheadLabel = () =>
  host.querySelector('[data-testid="information-page-scroll"]').firstElementChild.firstElementChild
    .firstElementChild.firstElementChild.textContent;

async function loadAt(path) {
  if (root) await act(async () => root.unmount());
  history.replaceState(null, '', path);
  await mount(createElement(ProbeApp));
}

it.each(['/privacy', '/unknown-page'])(
  'offers the way back from %s loaded after the drawing ran in this tab',
  async (path) => {
    records.os = 'web';
    useCaller();
    await loadAt(path);
    expect(mastheadLabel()).toBe('Start drawing');
    await loadAt('/');
    await loadAt(path);
    expect(mastheadLabel()).toBe('Back to drawing');
  }
);

it.each([
  { path: '/unknown-page', from: '/', label: 'Back to drawing' },
  { path: '/privacy', from: '/', label: 'Back to drawing' },
  { path: '/unknown-page', from: '/changelog', label: 'Start drawing' },
  { path: '/changelog', from: '/privacy', label: 'Start drawing' },
])('labels the way back from $path reached from $from as $label', async ({ path, from, label }) => {
  records.os = 'web';
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    value: new URL(from, location.origin).href,
  });
  useCaller();
  await loadAt(path);
  expect(mastheadLabel()).toBe(label);
});

it('keeps the cold-visit label when the browser blocks session storage', async () => {
  records.os = 'web';
  const blocked = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage is disabled', 'SecurityError');
  });
  try {
    useCaller();
    await loadAt('/');
    expect(blocked).toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await loadAt('/unknown-page');
    expect(mastheadLabel()).toBe('Start drawing');
  } finally {
    blocked.mockRestore();
  }
});

it.each([
  { page: 'privacy', title: 'Privacy Policy · Splotch' },
  { page: 'changelog', title: 'Changelog · Splotch' },
  { page: 'feedback', title: 'Send Feedback · Splotch' },
])('titles the browser tab for $page', async ({ page, title }) => {
  records.os = 'web';
  useCaller();
  await loadAt(`/${page}`);
  expect(document.title).toBe(title);
});

it('gives the page inherited leading and pretty wrapping', async () => {
  records.os = 'web';
  useCaller();
  await loadAt('/unknown-page');
  const ancestors = [];
  for (let node = host.querySelector('[role="heading"]'); node; node = node.parentElement) {
    ancestors.push(node);
  }
  const page = ancestors.find((node) => node.style.lineHeight === '1.62');
  expect(page).toBeDefined();
  expect(page.style.getPropertyValue('text-wrap')).toBe('pretty');
  expect(page.contains(host.querySelector('[aria-label="Splotch pages"]'))).toBe(true);
});

const pageAnchors = () =>
  [...host.querySelectorAll('a[href]')].map((link) => [
    link.textContent,
    link.getAttribute('href'),
  ]);

it('gives the masthead, footer and in-app page links the addresses shipping’s pages give them', async () => {
  records.os = 'web';
  useCaller();
  await loadAt('/unknown-page');
  expect(pageAnchors()).toEqual([
    ['Start drawing', '/'],
    ['Splotch', '/'],
    ['Start drawing', '/'],
    ['Changelog', '/changelog'],
    ['Privacy', '/privacy'],
    ['Splotch', '/'],
    ['Privacy', '/privacy'],
    ['Changelog', '/changelog'],
    ['Send feedback', '/feedback'],
    ["What's new", `/changelog#${releases[0].id}`],
  ]);
  await loadAt('/changelog');
  const anchors = pageAnchors();
  expect(anchors.slice(0, 2)).toEqual([
    ['Start drawing', '/'],
    ['Splotch', '/'],
  ]);
  expect(anchors.slice(-4)).toEqual([
    ['Splotch', '/'],
    ['Privacy', '/privacy'],
    ['Send feedback', '/feedback'],
    ["What's new", `#${releases[0].id}`],
  ]);
  await loadAt('/feedback');
  expect(pageAnchors()).toContainEqual([FEEDBACK_PAGE_COPY.privacy, '/privacy']);
});

it.each([
  ['the masthead mark', 1],
  ['the back link', 0],
])('follows %s in place, and leaves a modified click to the browser', async (_name, index) => {
  records.os = 'web';
  useCaller();
  await loadAt('/privacy');
  const anchor = () => host.querySelectorAll('a[href="/"]')[index];
  const browserDefault = vi.fn((event) => {
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
  });
  document.addEventListener('click', browserDefault);
  try {
    await act(async () =>
      anchor().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
      )
    );
  } finally {
    document.removeEventListener('click', browserDefault);
  }
  expect(browserDefault).toHaveBeenCalledOnce();
  expect(location.pathname).toBe('/privacy');
  const plain = new MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => anchor().dispatchEvent(plain));
  expect(plain.defaultPrevented).toBe(true);
  expect(location.pathname).toBe('/');
});

const WIDE = { width: 1280, height: 900, scale: 1, fontScale: 1 };

it('gives the privacy contents, section anchors and in-page links their fragments', async () => {
  records.os = 'web';
  records.dimensions = WIDE;
  useCaller();
  await loadAt('/privacy');
  const anchors = pageAnchors();
  for (const section of SECTIONS) {
    expect(anchors).toContainEqual([section.label, `#${section.id}`]);
    const copy = host.querySelector(`a[aria-label="Copy link to “${section.label}”"]`);
    expect(copy?.getAttribute('href')).toBe(`#${section.id}`);
    expect(copy?.getAttribute('data-focus-ring')).toBe('radiusBlob2');
  }
  const inText = [
    ...host.querySelectorAll('a[href]:not([data-testid="sidebar-row"]):not([aria-label])'),
  ]
    .map((link) => [link.textContent, link.getAttribute('href')])
    .filter(([, href]) => href.startsWith('#'));
  expect(inText).toEqual([
    ['How the counting works', '#counting'],
    ['Reporting a picture', '#reports'],
  ]);
  // The default policy asks for a check, which keeps the links that leave the app addressless.
  expect(anchors.some(([, href]) => href.startsWith('https:'))).toBe(false);
});

it('gives the changelog contents and Back to top their fragments', async () => {
  records.os = 'web';
  records.dimensions = WIDE;
  useCaller();
  await loadAt('/changelog');
  const rows = [...host.querySelectorAll('a[data-testid="sidebar-row"]')];
  expect(rows.map((row) => row.getAttribute('href'))).toEqual(
    releases.map((release) => `#${release.id}`)
  );
  expect(pageAnchors()).toContainEqual(['Back to top', '#top']);
});

// A link to an older release opens the older releases, as a browser opens shipping's folded
// <details> for its fragment, so the page can reach the release the link names.
it('opens the older releases for a page loaded at one of them', async () => {
  records.os = 'web';
  records.dimensions = WIDE;
  useCaller();
  const positions = () =>
    [...host.querySelectorAll('[data-testid^="changelog-position-"]')].map((node) =>
      node.getAttribute('data-testid').replace('changelog-position-', '')
    );
  await loadAt(`/changelog#${releases[1].id}`);
  await act(async () => {});
  expect(positions()).toEqual(releases.slice(0, 3).map(({ id }) => id));
  await loadAt(`/changelog#${releases.at(-1).id}`);
  await act(async () => {});
  expect(positions()).toEqual(releases.map(({ id }) => id));
});

it('follows a contents entry in place, and leaves a modified click to the browser', async () => {
  records.os = 'web';
  records.dimensions = WIDE;
  useCaller();
  await loadAt('/privacy');
  const row = () => host.querySelector(`a[data-testid="sidebar-row"][href="#${SECTIONS[2].id}"]`);
  const browserDefault = vi.fn((event) => {
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
  });
  document.addEventListener('click', browserDefault);
  try {
    await act(async () =>
      row().dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
      )
    );
  } finally {
    document.removeEventListener('click', browserDefault);
  }
  expect(browserDefault).toHaveBeenCalledOnce();
  expect(location.hash).toBe('');
  const plain = new MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => row().dispatchEvent(plain));
  expect(plain.defaultPrevented).toBe(true);
  expect(location.hash).toBe(`#${SECTIONS[2].id}`);
});

it('runs the footer’s release line as one paragraph, as shipping’s does', async () => {
  records.os = 'web';
  useCaller();
  await loadAt('/unknown-page');
  const link = [...host.querySelectorAll('a[href]')].find(
    (node) => node.textContent === "What's new"
  );
  expect(link.parentElement.textContent).toBe(
    `Splotch ${releases[0].version} · released ${releases[0].dateLabel} · What's new`
  );
});
