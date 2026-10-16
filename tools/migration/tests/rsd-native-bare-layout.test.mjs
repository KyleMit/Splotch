import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { NativeDrawingLayout } from '../../../experiments/native-architecture/src/rsdDrawing/NativeScrollAreas.tsx';
import { flat } from './rsd-native-toolbar-fixture.mjs';
import {
  adoptPaper,
  UNADOPTED_PAPER,
} from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';

const RESTING_GLASS = { open: null, expanded: false, panel: null };

function layoutElement(seen, bareGlass, paper = adoptPaper(1000, 700, 1), departingPaper = null) {
  return createElement(
    NativeDrawingLayout,
    {
      bareGlass,
      paperPresentations: (seen.paperPresentations ??= new WeakMap()),
      paper,
      empty: false,
      departingPaper,
      palette: () => createElement('button', null, 'Colors'),
      clearUnderlay: (_, frame, departingFrame) => {
        seen.clearFrame = frame;
        seen.departingFrame = departingFrame;
        return createElement('div', { 'data-clear-underlay': true });
      },
      clearOverlay: createElement('button', null, 'Clear drawing'),
      actionsPanel: (area) => {
        seen.area = area;
        return createElement('button', null, 'Tools');
      },
      capturePress: () => false,
      settings: createElement('button', null, 'Settings'),
      status: createElement('output', { 'data-status': true }),
      overlays: createElement('div', { 'data-overlay': true }),
    },
    (frame, space) => {
      seen.paperFrame = frame;
      seen.paperSpace = space;
      return createElement('div', { 'data-paper': true });
    }
  );
}

const props = (testID) => flat(records.props.findLast((found) => found.testID === testID).style);
const rail = () => host.querySelector('[data-testid="rsd-rail-glass"]');

it.each([
  ['portrait', { width: 402, height: 874 }, 'top', 0],
  ['landscape', { width: 1180, height: 820 }, 'left', 84],
  ['large tablet', { width: 1366, height: 1024 }, 'left', 84],
])(
  'floats the %s flat bar over the paper, as shipping ColorPalette does',
  async (_, dimensions, edge, controlsLeft) => {
    records.dimensions = { ...dimensions, scale: 1, fontScale: 1 };
    const area = { width: 1000, height: 700 };
    const box = (width, height) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    const measureArea = () =>
      act(async () =>
        records.props
          .findLast((found) => found.testID === 'rsd-canvas-area')
          .onLayout(box(area.width, area.height))
      );
    const raised = {};
    await mount(layoutElement(raised, null));
    await measureArea();
    await act(async () => root.render(layoutElement(raised, null)));
    expect(rail()).toBeNull();
    const raisedLayout = {
      bar: props('rsd-palette-bar'),
      controls: props('rsd-controls-inset'),
    };
    const seen = {};
    await act(async () => root.render(layoutElement(seen, RESTING_GLASS)));
    const bar = host.querySelector('[data-testid="rsd-palette-bar"]');
    expect(bar.contains(rail())).toBe(true);
    expect(raisedLayout.bar.position).not.toBe('absolute');
    expect(props('rsd-palette-bar')).toMatchObject({ position: 'absolute', top: 0, left: 0 });
    expect(props('rsd-palette-bar')[edge === 'top' ? 'right' : 'bottom']).toBe(0);
    expect(props('rsd-controls-inset')).toEqual({
      ...raisedLayout.controls,
      left: controlsLeft,
    });
    expect(seen.area).toEqual({ width: area.width - controlsLeft, height: area.height });
    expect(seen.paperSpace).toEqual(area);
    expect(seen.paperFrame).toEqual(raised.paperFrame);
    const layout = host.querySelector('[data-testid="rsd-drawing-layout"]');
    const order = [...layout.children].map((node) => node.dataset.testid);
    expect(order.indexOf('rsd-palette-bar')).toBeLessThan(order.indexOf('rsd-canvas-column'));
    expect(
      host.querySelector('[data-testid="rsd-canvas-area"] [data-paper]'),
      'paper in the area'
    ).not.toBeNull();
  }
);

it('hands the landscape phone its whole paper, with no rail to print', async () => {
  records.dimensions = { width: 874, height: 402, scale: 1, fontScale: 1 };
  const seen = {};
  await mount(layoutElement(seen, RESTING_GLASS));
  expect(host.querySelector('[data-testid="rsd-palette-bar"]')).toBeNull();
  expect(rail()).toBeNull();
  expect(props('rsd-controls-inset')).toMatchObject({ top: 0, left: 0 });
  expect(seen.area).toEqual({ width: 874, height: 402 });
  expect(seen.paperSpace).toEqual(seen.area);
});

it('shares the retained paper frame with Clear after the Flat bar releases its column', async () => {
  records.dimensions = { width: 1180, height: 820, scale: 1, fontScale: 1 };
  const paper = adoptPaper(1096, 788, 1);
  const seen = {};
  const measure = async (testID, box) =>
    act(async () =>
      records.props
        .findLast((found) => found.testID === testID)
        .onLayout({
          nativeEvent: { layout: box },
        })
    );
  await mount(layoutElement(seen, null, paper));
  await measure('rsd-drawing-layout', { x: 0, y: 32, width: 1180, height: 788 });
  await measure('rsd-canvas-column', { x: 84, y: 0, width: 1096, height: 788 });
  await measure('rsd-canvas-area', { x: 0, y: 0, width: 1096, height: 788 });
  expect(seen.paperFrame).toEqual({ left: 0, top: 0, width: 1096, height: 788 });
  await act(async () => root.render(layoutElement(seen, RESTING_GLASS, paper)));
  await measure('rsd-canvas-column', { x: 0, y: 0, width: 1180, height: 788 });
  await measure('rsd-canvas-area', { x: 0, y: 0, width: 1180, height: 788 });
  expect(seen.paperFrame).toEqual({ left: 84, top: 0, width: 1096, height: 788 });
  expect(seen.clearFrame).toBe(seen.paperFrame);
  await act(async () => root.render(layoutElement(seen, RESTING_GLASS, UNADOPTED_PAPER, paper)));
  expect(seen.paperFrame).toEqual({ left: 0, top: 0, width: 1180, height: 788 });
  expect(seen.departingFrame).toEqual({ left: 84, top: 0, width: 1096, height: 788 });
  await act(async () => root.render(layoutElement(seen, RESTING_GLASS, paper)));
  expect(seen.paperFrame).toEqual({ left: 84, top: 0, width: 1096, height: 788 });
});

it.each(['window-first', 'area-first'])(
  'adopts the current paper area when resize arrives %s',
  async (order) => {
    records.dimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
    const paper = adoptPaper(400, 725, 1);
    const seen = {};
    const areaLayout = (width, height) =>
      act(async () =>
        records.props
          .findLast((props) => props.testID === 'rsd-canvas-area')
          .onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } })
      );
    await mount(layoutElement(seen, null, paper));
    await areaLayout(400, 725);
    const area = host.querySelector('[data-testid="rsd-canvas-area"]');
    area.measure = (complete) => complete(0, 0, 800, 925, 0, 75);
    if (order === 'area-first') await areaLayout(800, 925);
    records.dimensions = { ...records.dimensions, width: 800, height: 1000 };
    await act(async () => root.render(layoutElement(seen, null, paper)));
    if (order === 'window-first') await areaLayout(800, 925);
    expect(seen.paperFrame).toEqual({ left: 0, top: 0, width: 800, height: 925 });
    expect(seen.clearFrame).toBe(seen.paperFrame);
  }
);

it('ignores an obsolete paper-area measurement after another resize', async () => {
  records.dimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
  const paper = adoptPaper(400, 725, 1);
  const seen = {};
  await mount(layoutElement(seen, null, paper));
  await act(async () =>
    records.props
      .findLast((props) => props.testID === 'rsd-canvas-area')
      .onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 725 } } })
  );
  const callbacks = [];
  host.querySelector('[data-testid="rsd-canvas-area"]').measure = (complete) =>
    callbacks.push(complete);
  records.dimensions = { ...records.dimensions, width: 800, height: 1000 };
  await act(async () => root.render(layoutElement(seen, null, paper)));
  records.dimensions = { ...records.dimensions, width: 900, height: 1100 };
  await act(async () => root.render(layoutElement(seen, null, paper)));
  expect(callbacks).toHaveLength(2);
  await act(async () => callbacks[0](0, 0, 800, 925, 0, 75));
  expect(seen.paperFrame).toEqual({ left: 0, top: 0, width: 400, height: 725 });
  await act(async () => callbacks[1](0, 0, 900, 1025, 0, 75));
  expect(seen.paperFrame).toEqual({ left: 0, top: 0, width: 900, height: 1025 });
  expect(seen.clearFrame).toBe(seen.paperFrame);
});
