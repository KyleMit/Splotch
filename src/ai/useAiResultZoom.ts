import { useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { createPinchZoom } from '../lib/actions/pinchZoom';

export function useAiResultZoom(
  enabled: boolean,
  resetKey: string | undefined,
  width: number,
  height: number
) {
  const bounds = useRef({ width, height });
  bounds.current = { width, height };
  const [zoom] = useState(() => createPinchZoom(() => bounds.current));
  const [transform, setTransform] = useState(zoom.transform);
  const pointers = useRef(new Set<number>());
  const origin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    zoom.reset();
    pointers.current.clear();
    setTransform(zoom.transform);
  }, [enabled, resetKey, width, height, zoom]);

  function update(event: GestureResponderEvent) {
    if (!enabled) return;
    const touches = event.nativeEvent.touches
      .map((touch) => ({ ...touch, identifier: Number(touch.identifier) }))
      .filter((touch) => Number.isFinite(touch.identifier));
    const present = new Set(touches.map((touch) => touch.identifier));
    for (const id of pointers.current) if (!present.has(id)) zoom.up(id);
    for (const touch of touches) {
      const point = { x: touch.pageX - origin.current.x, y: touch.pageY - origin.current.y };
      if (pointers.current.has(touch.identifier)) zoom.move(touch.identifier, point);
      else zoom.down(touch.identifier, point);
    }
    pointers.current = present;
    setTransform({ ...zoom.transform });
  }

  function end() {
    for (const id of pointers.current) zoom.up(id);
    pointers.current.clear();
  }

  return {
    transform: [
      { translateX: transform.x },
      { translateY: transform.y },
      { scale: transform.scale },
    ],
    handlers: {
      onStartShouldSetResponder: () => enabled,
      onMoveShouldSetResponder: () => enabled,
      onResponderGrant: (event: GestureResponderEvent) => {
        const touch = event.nativeEvent;
        origin.current = { x: touch.pageX - touch.locationX, y: touch.pageY - touch.locationY };
        update(event);
      },
      onResponderStart: update,
      onResponderMove: update,
      onResponderEnd: update,
      onResponderRelease: end,
      onResponderTerminate: end,
      onResponderTerminationRequest: () => false,
    },
  };
}
