import { act, createElement, useState } from 'react';
import { expect, it } from 'vitest';
import { mount, records } from './rsd-native-selection-host.mjs';
import { RsdAiResultStage } from '../../../src/rsdDrawing/RsdAiResultStage.tsx';
import { createPinchZoom } from '../../../src/lib/actions/pinchZoom.ts';

const event = (touches) => ({
  nativeEvent: {
    touches: touches.map(([identifier, x, y]) => ({ identifier, pageX: x, pageY: y })),
    pageX: 80,
    pageY: 100,
    locationX: 80,
    locationY: 100,
  },
});
const last = (id) => records.props.filter((props) => props.testID === id).at(-1);
const render = (uri, revealed = true) =>
  createElement(RsdAiResultStage, {
    run: {
      id: 1,
      startedAt: 1,
      phase: 'arrived',
      submitted: null,
      picture: { uri, mime: 'image/png' },
    },
    progress: { value: 1, overrun: false, revealed },
    width: 200,
    height: 200,
    dialSize: 40,
  });

it('uses shipping pinch bounds, pans a zoomed result and resets a new picture', async () => {
  let change;
  function Picture() {
    const [picture, setPicture] = useState({ uri: 'first.png', revealed: true });
    change = setPicture;
    return render(picture.uri, picture.revealed);
  }
  await mount(createElement(Picture));
  let gesture = last('ai-result-gesture');
  expect(gesture).toBeDefined();
  const shipping = createPinchZoom(() => ({ width: 200, height: 200 }));
  shipping.down(1, { x: 80, y: 100 });
  shipping.down(2, { x: 120, y: 100 });
  await act(async () =>
    gesture.onResponderGrant(
      event([
        [1, 80, 100],
        [2, 120, 100],
      ])
    )
  );
  shipping.move(1, { x: 60, y: 100 });
  shipping.move(2, { x: 140, y: 100 });
  await act(async () =>
    gesture.onResponderMove(
      event([
        [1, 60, 100],
        [2, 140, 100],
      ])
    )
  );
  const transform = () => last('ai-zoomed-picture').style.transform;
  expect(transform()).toEqual([
    { translateX: shipping.transform.x },
    { translateY: shipping.transform.y },
    { scale: shipping.transform.scale },
  ]);
  shipping.up(2);
  await act(async () => gesture.onResponderEnd(event([[1, 60, 100]])));
  shipping.move(1, { x: 100, y: 100 });
  await act(async () => gesture.onResponderMove(event([[1, 100, 100]])));
  expect(transform()).toEqual([
    { translateX: shipping.transform.x },
    { translateY: shipping.transform.y },
    { scale: shipping.transform.scale },
  ]);
  await act(async () => change({ uri: 'second.png', revealed: true }));
  expect(transform()).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  gesture = last('ai-result-gesture');
  expect(gesture.onStartShouldSetResponder()).toBe(true);
  await act(async () => change({ uri: 'second.png', revealed: false }));
  expect(last('ai-result-gesture').onStartShouldSetResponder()).toBe(false);
});
