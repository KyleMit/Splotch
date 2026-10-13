import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { BREAKPOINT_EPSILON_PX, TABLET_MIN_SIDE_PX } from '../../web/src/lib/breakpoints.ts';
import {
  INSTALL_BANNER_PARTS,
  iosBannerStepParts,
} from '../../experiments/native-architecture/src/install/installCopy.ts';
import {
  INSTALL_BANNER_METRICS,
  INSTALL_PREVIEW_ICON_SRC,
} from '../../experiments/native-architecture/src/rsdDrawing/RsdInstallBanner.tsx';
import {
  INSTALL_HINT_ID,
  INSTALL_TEXT_METRICS,
} from '../../experiments/native-architecture/src/rsdDrawing/RsdInstallText.tsx';
import { INSTALL_BANNER_MOTION } from '../../experiments/native-architecture/src/rsdDrawing/installBannerMotion.ts';

vi.mock('react-native', () => {
  const curve = () => (t) => t;
  return {
    AccessibilityInfo: {},
    Animated: { View: () => null, createAnimatedComponent: (component) => component },
    Easing: { back: curve, cubic: (t) => t, in: curve, linear: (t) => t, out: curve },
    Platform: { OS: 'web' },
    Pressable: () => null,
    ScrollView: () => null,
    StyleSheet: { create: (styles) => styles },
    Text: () => null,
    TextInput: () => null,
    View: () => null,
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 0, height: 0 }),
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));
vi.mock('react-strict-dom', () => ({
  compat: { native: () => null },
  css: { create: (styles) => styles, defineVars: (vars) => vars, createTheme: () => ({}) },
  html: {},
}));

// The Install Banner's look is authored as Svelte markup and scoped CSS, which React Native
// cannot import, so each value the port carries is read back from the shipping source here.
const web = (path) => readFileSync(new URL(`../../web/src/${path}`, import.meta.url), 'utf8');
const banner = web('lib/components/InstallBanner.svelte');
const bannerScript = banner.slice(0, banner.indexOf('</script>'));
const bannerMarkup = banner
  .slice(banner.indexOf('</script>'), banner.indexOf('<style>'))
  .replace(/\s+/g, ' ');
const bannerStyle = banner.slice(banner.indexOf('<style>'));
const appCss = web('app.css');

function rule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

function declaration(css, selector, property) {
  const value = new RegExp(`(?:^|[\\s;{])${property}:\\s*([^;]+);`).exec(rule(css, selector))?.[1];
  expect(value, `${selector} ${property}`).toBeDefined();
  return value.replace(/\s+/g, ' ').trim();
}

const px = (value) => `${value}px`;

it('keeps the card, preview tile and copy geometry', () => {
  const m = INSTALL_BANNER_METRICS;
  expect(declaration(bannerStyle, '.install-banner', 'max-width')).toBe(px(m.maxWidthPx));
  expect(bannerMarkup).toContain(
    `<img src="${INSTALL_PREVIEW_ICON_SRC}" alt="" width="${m.previewIconPx}" height="${m.previewIconPx}"`
  );
  expect(declaration(bannerStyle, '.install-preview', 'width')).toBe(px(m.previewColumnPx));
  expect(declaration(bannerStyle, '.install-preview-label', 'max-width')).toBe(
    px(m.previewColumnPx)
  );
  expect(declaration(bannerStyle, '.install-preview-label', 'line-height')).toBe(
    String(m.previewLabelLineHeight)
  );
  expect(declaration(bannerStyle, '.install-copy', 'line-height')).toBe(String(m.copyLineHeight));
});

it('keeps the hint and parting text geometry', () => {
  const m = INSTALL_TEXT_METRICS;
  expect(declaration(bannerStyle, '.install-mascot', 'width')).toBe(px(m.mascotPx));
  expect(declaration(bannerStyle, '.install-hint', 'line-height')).toBe(String(m.textLineHeight));
  expect(declaration(bannerStyle, '.install-parting p', 'line-height')).toBe(
    String(m.textLineHeight)
  );
});

it('keeps the light preview lift, as React Native reads it', () => {
  const shipping = declaration(bannerStyle, '.install-preview img', 'box-shadow').replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, r, g, b, alpha) => `rgba(${r}, ${g}, ${b}, ${Number(alpha) / 100})`
  );
  expect(shipping).toBe(INSTALL_BANNER_METRICS.previewLightShadow);
});

it('keeps the brand CTA, its chevron and the dismiss offset', () => {
  const m = INSTALL_BANNER_METRICS;
  expect(declaration(bannerStyle, '.install-cta', 'height')).toBe(px(m.ctaHeightPx));
  expect(declaration(bannerStyle, '.install-cta:active', 'transform')).toBe(
    `scale(${m.ctaPressScale})`
  );
  expect(declaration(bannerStyle, ':global(.install-cta-icon)', 'width')).toBe(px(m.ctaIconPx));
  expect(
    declaration(bannerStyle, '.install-cta.expanded :global(.install-chevron)', 'transform')
  ).toBe(`rotate(${m.chevronTurnDeg}deg)`);
  expect(declaration(appCss, '.banner-dismiss', 'margin')).toBe(
    `-${m.dismissOutsetPx}px -${m.dismissOutsetPx}px 0 0`
  );
  expect(bannerMarkup).toContain(
    `aria-controls={installState.mode === 'oneTap' ? undefined : '${INSTALL_HINT_ID}'}`
  );
  expect(bannerMarkup).toContain(`<div id="${INSTALL_HINT_ID}"`);
});

it('stacks the CTA under the copy at the same breakpoint', () => {
  const query = `@media (max-width: ${TABLET_MIN_SIDE_PX - BREAKPOINT_EPSILON_PX}px) and (orientation: portrait)`;
  expect(bannerStyle).toContain(query);
  const stacked = bannerStyle.slice(bannerStyle.indexOf(query));
  expect(declaration(stacked, '.install-main', 'flex-wrap')).toBe('wrap');
  expect(declaration(stacked, '.install-cta', 'flex-basis')).toBe('100%');
});

it('keeps the fade and shrink timings', () => {
  const m = INSTALL_BANNER_MOTION;
  expect(bannerScript).toContain(`const PARTING_FADE_MS = ${m.partingFadeMs};`);
  expect(bannerScript).toContain(`const HINT_FADE_MS = ${m.hintFadeMs};`);
  expect(bannerScript).toContain(`const BANNER_SHRINK_EXIT_MS = ${m.shrinkExitMs};`);
});

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parts = [
  ...iosBannerStepParts('{shareLocation}').flat(),
  ...INSTALL_BANNER_PARTS.androidHint,
  ...INSTALL_BANNER_PARTS.parting,
];

it('sets the same icon beside each term', () => {
  const terms = parts.filter((part) => part.kind === 'term');
  expect(terms).toHaveLength(4);
  for (const term of terms) {
    const spoken = term.spoken ? `<VisuallyHidden>${escape(term.spoken)}</VisuallyHidden>` : '';
    const inked = term.textInk ? '[^>]*install-menu-icon' : '';
    expect(bannerMarkup).toMatch(
      new RegExp(`<Icon name="${term.icon}"${inked}[^>]*/>${spoken}${escape(term.text)}`)
    );
  }
});

it('sets the same icon before the bold word in the parting message', () => {
  const icons = parts.filter((part) => part.kind === 'icon');
  expect(icons).toHaveLength(1);
  for (const { icon } of icons)
    expect(bannerMarkup).toMatch(new RegExp(`<Icon name="${icon}"[^>]*/> <strong>`));
});

it('detects a negative control: a swapped term icon is not found in the shipping markup', () => {
  expect(bannerMarkup).not.toMatch(/<Icon name="add-homescreen"[^>]*\/> Share/);
});
