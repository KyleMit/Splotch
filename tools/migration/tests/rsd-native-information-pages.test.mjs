import { caller, host, mount, root, records } from './rsd-native-selection-host.mjs';
import { Linking } from 'react-native';
import { RsdInformationFooter } from '../../../experiments/native-architecture/src/rsdDrawing/RsdInformationFooter.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { mixSrgb } from '../../../experiments/native-architecture/src/rsdDrawing/colorMix.ts';
import { paletteHex } from '../../../experiments/native-architecture/src/drawing/palette.ts';
import { themes, scale } from '../../../web/src/lib/design/tokens.ts';
import releases from '../../../web/src/lib/releases.json';
import { FEEDBACK_URL } from '../../../web/src/lib/siteUrl.ts';
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
vi.mock(
  '../../../experiments/native-architecture/src/platform/appPath.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    openAppPage: vi.fn(),
    setDocumentTitle: vi.fn(() => 'Splotch'),
  })
);

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
const footerTree = (page = 'privacy', theme = 'light', onExternal = vi.fn()) =>
  createElement(
    DrawingAppearanceProvider,
    { preference: theme },
    createElement(RsdInformationFooter, { page, onExternal })
  );

it.each(['light', 'dark'])(
  'paints the shared footer with shipping’s orange squiggle in %s',
  async (theme) => {
    await mount(footerTree('privacy', theme));
    const rule = records.props.findLast((props) => props.testID === 'release-squiggle');
    expect(rule).toBeDefined();
    await act(async () => rule.onLayout({ nativeEvent: { layout: { width: 48 } } }));
    const stroke = host.querySelector('[data-testid="release-squiggle"] path');
    expect(stroke.getAttribute('d')).toBe('M0 4 Q6 0 12 4 T24 4 M24 4 Q30 0 36 4 T48 4');
    expect(stroke.getAttribute('stroke-width')).toBe('2.5');
    expect(stroke.getAttribute('stroke')).toBe(
      mixSrgb(
        paletteHex('Orange'),
        Number.parseFloat(themes[theme].squiggleStrength),
        themes[theme].surface
      )
    );
  }
);

it.each([
  {
    page: 'privacy',
    target: 'page',
    arguments: ['changelog', releases[0].id],
    current: 'Privacy',
    links: ['Changelog', 'Send feedback'],
  },
  {
    page: 'changelog',
    target: 'fragment',
    arguments: [`#${releases[0].id}`],
    current: 'Changelog',
    links: ['Privacy', 'Send feedback'],
  },
  {
    page: 'feedback',
    target: 'page',
    arguments: ['changelog', releases[0].id],
    current: null,
    links: ['Privacy', 'Changelog', 'Send feedback'],
  },
])(
  'keeps shipping footer navigation and release action on $page',
  async ({ page, target, arguments: args, current, links }) => {
    const onExternal = vi.fn();
    openAppPage.mockClear();
    await mount(footerTree(page, 'light', onExternal));
    const nav = host.querySelector('[aria-label="Splotch pages"]');
    expect([...nav.querySelectorAll('[role="link"]')].map((node) => node.textContent)).toEqual(
      links
    );
    expect([...nav.querySelectorAll('[role="listitem"]')].map((node) => node.textContent)).toEqual([
      'Privacy',
      'Changelog',
      'Send feedback',
    ]);
    const markers = [...nav.querySelectorAll('path')];
    expect(markers).toHaveLength(current ? 1 : 0);
    expect(markers.map((node) => node.getAttribute('fill').toLowerCase())).toEqual(
      current ? [paletteHex(page === 'privacy' ? 'Purple' : 'Blue').toLowerCase()] : []
    );
    const latest = [...host.querySelectorAll('[role="link"]')].find(
      (node) => node.textContent === "What's new"
    );
    expect(latest).toBeDefined();
    await act(async () => latest.click());
    expect({ page: openAppPage, fragment: onExternal }[target]).toHaveBeenCalledExactlyOnceWith(
      ...args
    );
  }
);

it('keeps the native footer’s feedback link behind its external-link owner', async () => {
  const onExternal = vi.fn();
  openAppPage.mockClear();
  await mount(footerTree('feedback', 'light', onExternal));
  const link = [...host.querySelectorAll('[role="link"]')].find(
    (node) => node.textContent === 'Send feedback'
  );
  await act(async () => link.click());
  expect(onExternal).toHaveBeenCalledExactlyOnceWith(FEEDBACK_URL);
  expect(openAppPage).not.toHaveBeenCalled();
});

it('returns from a Settings reading page to drawing without reopening the previous About section', async () => {
  useCaller();
  await mount(createElement(RsdDrawingScreen));
  await act(async () => host.querySelector('[aria-label="Settings"]').click());
  const about = [...host.querySelectorAll('button')].find((node) =>
    node.getAttribute('aria-label')?.startsWith('About,')
  );
  expect(about).toBeDefined();
  await act(async () => about.click());
  const privacyLink = [...host.querySelectorAll('[role="link"]')].find(
    (node) => node.textContent === 'Privacy Policy'
  );
  expect(privacyLink).toBeDefined();
  await act(async () => privacyLink.click());
  expect(openAppPage).toHaveBeenLastCalledWith('privacy');
  await act(async () => root.render(createElement(RsdDrawingScreen, { page: 'privacy' })));
  expect(caller.screen.settingsOpen).toBe(true);
  const footer = [...host.querySelectorAll('[role="link"]')].find(
    (node) => node.textContent === 'Splotch'
  );
  expect(footer).toBeDefined();
  await act(async () => footer.click());
  expect(openAppPage).toHaveBeenLastCalledWith('drawing');
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  expect(caller.screen.settingsOpen).toBe(false);
});

const footerStyle = (node) => JSON.parse(node.getAttribute('data-committed-props')).style;
it.each([
  {
    width: 540,
    height: 500 + 1,
    direction: 'column',
    gap: 'space2',
    margin: 'space8',
  },
  {
    width: 540 + 1,
    height: 500 + 1,
    direction: 'row',
    gap: null,
    margin: 'space8',
  },
  { width: 844, height: 500, direction: 'row', gap: null, margin: 'space6' },
])(
  'lays out the shipping footer at $width × $height',
  async ({ width, height, direction, gap, margin }) => {
    records.dimensions = { width, height, scale: 1, fontScale: 1 };
    records.journalHostProps = true;
    await mount(footerTree());
    const nav = host.querySelector('[aria-label="Splotch pages"]');
    const row = nav.parentElement;
    const footer = row.parentElement;
    expect(footerStyle(row)).toMatchObject({
      flexDirection: direction,
      alignItems: direction === 'column' ? 'flex-start' : 'center',
      flexWrap: 'wrap',
      gap: Number.parseFloat(scale.space4),
    });
    expect(footerStyle(footer)).toMatchObject({
      flexDirection: 'column',
      gap: Number.parseFloat(scale.space4),
      marginTop: Number.parseFloat(scale[margin]),
    });
    expect(footerStyle(footer).borderTopWidth).toBeUndefined();
    expect(footerStyle(nav.querySelector('[role="list"]'))).toMatchObject({
      rowGap: Number.parseFloat(scale.space1),
      columnGap: gap ? Number.parseFloat(scale[gap]) : 18,
    });
    const brand = [...row.querySelectorAll('[role="link"]')].find(
      (node) => node.textContent === 'Splotch'
    );
    const wordmark = brand.lastElementChild;
    expect(footerStyle(brand)).toMatchObject({
      minHeight: 44,
      gap: Number.parseFloat(scale.space2),
    });
    expect(footerStyle(wordmark)).toMatchObject({
      fontSize: Number.parseFloat(scale.fontSizeXs),
      fontWeight: scale.fontWeightBold,
      textTransform: 'uppercase',
      letterSpacing: Number.parseFloat(scale.fontSizeXs) * 0.14,
    });
    expect(footer.lastElementChild.textContent).toBe(
      `Splotch ${releases[0].version} · released ${releases[0].dateLabel} ·What's new`
    );
  }
);
