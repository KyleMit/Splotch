import { describe, expect, it, vi } from 'vitest';
import { host, records } from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';

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

  it('keeps the raised strip under the bottom inset over the plate shadow it continues', async () => {
    records.dimensions = { width: 1180, height: 820, scale: 1, fontScale: 1 };
    records.insets = { top: 0, right: 0, bottom: INSET_BOTTOM_PX, left: 0 };
    await mountToolbar(toolbarScreen());
    const bar = hostOf(byTestId('rsd-palette-bar'));
    const [plate, strip] = hostChildren(bar).map(({ element }) => element);
    expect(hostOf(plate).props.testID).toBe('rsd-palette-plate');
    expect(hostOf(strip).style.height).toBe(INSET_BOTTOM_PX);
    const painted = paintOrder(bar).map(({ element }) => element);
    expect(painted.indexOf(strip)).toBeGreaterThan(painted.indexOf(plate));
  });
});
