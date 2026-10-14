import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { records, root, mount } from './rsd-native-selection-host.mjs';
import { flat } from './rsd-native-toolbar-fixture.mjs';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import {
  RsdScrollCue,
  SCROLL_CUE_END_SLACK_PX,
  SCROLL_CUE_HEIGHT_PX,
  SCROLL_CUE_OPAQUE_FROM_PERCENT,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdScrollCue.tsx';
import {
  COLORING_CUE_END_SLACK_PX,
  COLORING_CUE_HEIGHT_PX,
  COLORING_CUE_OPAQUE_FROM_PERCENT,
  RsdColoringScroll,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringScroll.tsx';

function element(component, preference) {
  return createElement(DrawingAppearanceProvider, { preference }, component);
}

// The picker keeps its own copy of the fade so Settings' lazy chunk and its own share no module
// (RsdColoringScroll.tsx says why). Negative control: a copy whose height, ramp, colour or
// retirement drifts from RsdScrollCue's fails here.
it('fades its grid exactly as RsdScrollCue fades a scrolling pane', async () => {
  expect([
    COLORING_CUE_HEIGHT_PX,
    COLORING_CUE_OPAQUE_FROM_PERCENT,
    COLORING_CUE_END_SLACK_PX,
  ]).toEqual([SCROLL_CUE_HEIGHT_PX, SCROLL_CUE_OPAQUE_FROM_PERCENT, SCROLL_CUE_END_SLACK_PX]);
  const cue = () => flat(records.props.findLast((props) => props.testID === 'scroll-cue').style);
  const scroll = () => records.viewports.at(-1);
  async function phases(component, preference) {
    records.props.length = 0;
    const tree = element(
      createElement(component, null, createElement('p', null, 'Grid')),
      preference
    );
    if (!root) await mount(tree);
    else await act(async () => root.render(tree));
    const seen = [cue()];
    await act(async () => {
      scroll().onLayout({ nativeEvent: { layout: { height: 200 } } });
      scroll().onContentSizeChange(320, 600);
    });
    seen.push(cue());
    await act(async () =>
      scroll().onScroll({
        nativeEvent: { contentOffset: { y: 600 - 200 - SCROLL_CUE_END_SLACK_PX } },
      })
    );
    seen.push(cue());
    return seen;
  }
  for (const preference of ['light', 'dark']) {
    const pane = await phases(RsdScrollCue, preference);
    expect(pane.map((style) => style.opacity)).toEqual([0, undefined, 0]);
    expect(await phases(RsdColoringScroll, preference), preference).toEqual(pane);
  }
});
