import { describe, expect, it, vi } from 'vitest';
import { host, records } from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { themes } from '../../../web/src/lib/design/tokens.ts';
import { MARGIN_RULE_INKS } from '../../../experiments/native-architecture/src/rsdDrawing/marginRuleInk.ts';

// React Native's Fabric paint order over the recorded hosts, as sliceChildShadowNodeViewPairs.cpp
// and ViewShadowNode.cpp compute it: a static child mounts before every positioned sibling, a
// view that forms no stacking context hands its children to its parent's list, and zIndex orders
// the positioned ones. Each stand-in host is a forwardRef rendering one element (View a div,
// Pressable a button, Text a span, Image a div with a source), so an element's React Native
// props are those of the forwardRef that rendered it.
const FORWARD_REF = Symbol.for('react.forward_ref');
const HOST_KINDS = { DIV: 'view', BUTTON: 'pressable', SPAN: 'text' };

function hostOf(element) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
  const owner = key ? element[key].return : null;
  const kind = owner?.type?.$$typeof === FORWARD_REF ? HOST_KINDS[element.tagName] : undefined;
  if (!kind) return { element, kind: 'native', props: {}, style: {} };
  const props = owner.memoizedProps;
  return {
    element,
    kind: kind === 'view' && props.source ? 'image' : kind,
    props,
    style: flat(props.style) ?? {},
  };
}

function hostChildren(node) {
  return [...node.element.children].map(hostOf);
}

const isStatic = ({ style }) => style.position === 'static';
const meaningful = (color) => color != null && color !== 'transparent';
const hasTransform = (transform) =>
  Array.isArray(transform) ? transform.length > 0 : transform != null && transform !== 'none';

function formsStackingContext(node) {
  // A Pressable is accessible; an image, text or other native component draws its own content.
  if (node.kind !== 'view') return true;
  const { props, style } = node;
  return (
    props.collapsable === false ||
    ['box-only', 'none'].includes(props.pointerEvents ?? style.pointerEvents) ||
    props.nativeID != null ||
    props.accessible === true ||
    (style.opacity ?? 1) !== 1 ||
    hasTransform(style.transform) ||
    (style.zIndex != null && !isStatic(node)) ||
    style.display === 'none' ||
    ['hidden', 'scroll'].includes(style.overflow) ||
    meaningful(style.shadowColor) ||
    (style.filter?.length ?? 0) > 0 ||
    (style.mixBlendMode ?? 'normal') !== 'normal' ||
    style.isolation === 'isolate' ||
    (style.elevation ?? 0) !== 0 ||
    props['aria-hidden'] === true ||
    props.accessibilityElementsHidden === true ||
    (props.importantForAccessibility ?? 'auto') !== 'auto'
  );
}

function formsView(node) {
  const { props, style } = node;
  return (
    formsStackingContext(node) ||
    meaningful(style.backgroundColor) ||
    (style.borderWidth ?? 0) > 0 ||
    props.testID != null ||
    (style.boxShadow ?? 'none') !== 'none' ||
    style.experimental_backgroundImage != null
  );
}

function mountList(parent) {
  const list = [];
  const visit = (node, statics) => {
    for (const child of hostChildren(node)) {
      const flattened = !formsStackingContext(child);
      if (isStatic(child)) {
        list.splice(statics.at++, 0, child);
        if (flattened) visit(child, statics);
      } else {
        list.push(child);
        if (flattened) visit(child, { at: list.length });
      }
    }
  };
  visit(parent, { at: 0 });
  const order = (node) => (isStatic(node) ? 0 : (node.style.zIndex ?? 0));
  return list
    .map((node, index) => ({ node, index }))
    .sort((a, b) => order(a.node) - order(b.node) || a.index - b.index)
    .map(({ node }) => node);
}

// Every concrete view under `root`, first painted first.
function paintOrder(root) {
  return mountList(root).flatMap((node) =>
    formsView(node) ? [node, ...(formsStackingContext(node) ? paintOrder(node) : [])] : []
  );
}

const INSET_BOTTOM_PX = 34;
const byTestId = (id) => host.querySelector(`[data-testid="${id}"]`);

async function mountFlat(width, height) {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
  storedSettings({ toolbarStyle: 'bare', aiEnabled: true });
  await mountToolbar(toolbarScreen());
  await vi.waitFor(() => expect(byTestId('rsd-rail-glass')).not.toBeNull());
}

describe('the native palette bar', () => {
  it.each([
    ['portrait', 390, 844],
    ['landscape', 1180, 820],
  ])('paints the %s swatches over the rail paper', async (_, width, height) => {
    await mountFlat(width, height);
    const painted = paintOrder(hostOf(byTestId('rsd-drawing-layout'))).map(
      ({ element }) => element
    );
    const rail = painted.indexOf(byTestId('rsd-rail-glass'));
    expect(rail).toBeGreaterThanOrEqual(0);
    const swatches = [
      ...host.querySelectorAll('[role="radiogroup"][aria-label="Paint colors"] [role="radio"]'),
      host.querySelector('[aria-label="More colors"]'),
    ];
    expect(swatches.length).toBeGreaterThan(1);
    for (const swatch of swatches)
      expect(painted.indexOf(swatch), swatch.getAttribute('aria-label')).toBeGreaterThan(rail);
  });

  // The plate runs through the bottom inset to the screen's edge itself (shipping's column does),
  // so no second box continues it there for a shadow to seam. Negative control: a strip beside the
  // plate fails here.
  it('runs the raised plate alone through the bottom inset, leaving no seam', async () => {
    records.dimensions = { width: 1180, height: 820, scale: 1, fontScale: 1 };
    records.insets = { top: 0, right: 0, bottom: INSET_BOTTOM_PX, left: 0 };
    await mountToolbar(toolbarScreen());
    const children = hostChildren(hostOf(byTestId('rsd-palette-bar')));
    expect(children.map(({ props }) => props.testID)).toEqual(['rsd-palette-plate']);
    expect(children[0].style).toMatchObject({ position: 'relative', flexGrow: 1 });
  });

  // A blended view makes Android draw its whole parent, the drawing layout with its ink,
  // offscreen on every frame.
  it('prints its margin rules without a blended view', async () => {
    await mountFlat(390, 844);
    const blended = records.props
      .map((props) => flat(props.style) ?? {})
      .filter((style) => (style.mixBlendMode ?? 'normal') !== 'normal');
    expect(blended).toEqual([]);
    expect(
      records.props.filter((props) =>
        String(flat(props.style)?.experimental_backgroundImage).includes(
          MARGIN_RULE_INKS.light.first.rgb
        )
      ).length
    ).toBeGreaterThanOrEqual(2);
  });
});

// Android draws a view offscreen when it carries a partial or animated opacity, and draws a view's
// parent offscreen when the view blends (PR 2887). Either on a view holding the paper redraws the
// whole drawing, ink included, on every frame, so neither may sit on the paper's ancestors or
// their children through a stroke. Dialogs and buttons fade on layers of their own. Negative
// control: a translucent canvas area, or a blended view beside the paper, fails here.
describe('the views holding the paper', () => {
  const composites = ({ style }) =>
    (style.opacity ?? 1) !== 1 || (style.mixBlendMode ?? 'normal') !== 'normal';
  const named = ({ element, props }) => props.testID ?? element.getAttribute('aria-label');

  it.each(['buttons', 'bare'])('draw nothing offscreen in the %s style', async (toolbarStyle) => {
    records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
    storedSettings({ toolbarStyle, aiEnabled: true });
    await mountToolbar(toolbarScreen({ drawing: true }));
    // The flat style's glass loads before the first paint shows the chrome.
    await vi.waitFor(() =>
      expect(byTestId('rsd-rail-glass') !== null).toBe(toolbarStyle === 'bare')
    );
    const ancestors = [];
    let element = byTestId('rsd-paper-slot');
    for (; element !== host; element = element.parentElement) ancestors.push(hostOf(element));
    expect(ancestors.map(({ props }) => props.testID)).toEqual(
      expect.arrayContaining(['rsd-paper-slot', 'rsd-canvas-area', 'rsd-drawing-layout'])
    );
    expect(ancestors.filter(composites).map(named)).toEqual([]);
    const blendedChildren = ancestors
      .flatMap(hostChildren)
      .filter(({ style }) => (style.mixBlendMode ?? 'normal') !== 'normal');
    expect(blendedChildren.map(named)).toEqual([]);
  });
});

const channels = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
const BLENDS = {
  multiply: (paper, ink) => paper * ink,
  screen: (paper, ink) => paper + ink - paper * ink,
};
const CHANNEL_TOLERANCE = 1 / 255;

describe('the pre-blended margin rule ink', () => {
  it.each(['light', 'dark'])('lays the %s rules over the paper as shipping blends them', (mode) => {
    const theme = themes[mode];
    const paper = channels(theme.paper);
    const ink = channels(theme.ruleInk);
    const blend = BLENDS[theme.ruleBlend];
    for (const [rule, opacity] of [
      [MARGIN_RULE_INKS[mode].first, Number(theme.ruleOpacity)],
      [MARGIN_RULE_INKS[mode].second, Number(theme.ruleSecondaryOpacity)],
    ]) {
      const bytes = rule.rgb.split(' ').map(Number);
      expect(bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)).toBe(true);
      const color = bytes.map((byte) => byte / 255);
      expect(rule.alpha).toBeGreaterThan(0);
      expect(rule.alpha).toBeLessThanOrEqual(opacity);
      paper.forEach((p, channel) => {
        const shipping = p + opacity * (blend(p, ink[channel]) - p);
        const native = p + rule.alpha * (color[channel] - p);
        expect(Math.abs(native - shipping)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      });
    }
  });
});
