import { useEffect, useRef } from 'react';
import { Animated } from '../platform/animated';
import { SELECTION_RING_WIDTH_PX } from './paletteGeometry';
import { keyframeTimeline, keyframeValue } from './keyframeMotion';

import {
  SWATCH_BLOOM_MS,
  SWATCH_BLOOM_TRAIL_MS,
  SWATCH_BLOOM_TRAIL_DELAY_MS,
  SWATCH_BLOOM_TRAIL_WIDTH_PX,
  SWATCH_BLOOM_SCALE_KEYFRAMES,
  SWATCH_BLOOM_FADE_KEYFRAMES,
  SWATCH_TRAIL_SCALE_KEYFRAMES,
  SWATCH_TRAIL_FADE_KEYFRAMES,
} from './swatchKeyframes';

export function RsdSwatchBloom({
  size,
  color,
  reduced,
}: {
  size: number;
  color: string;
  reduced: boolean;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const trailScale = useRef(new Animated.Value(0)).current;
  const trailFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    for (const value of [scale, fade, trailScale, trailFade]) value.setValue(0);
    const bloom = Animated.parallel([
      keyframeTimeline(scale, SWATCH_BLOOM_SCALE_KEYFRAMES, SWATCH_BLOOM_MS),
      keyframeTimeline(fade, SWATCH_BLOOM_FADE_KEYFRAMES, SWATCH_BLOOM_MS),
      keyframeTimeline(
        trailScale,
        SWATCH_TRAIL_SCALE_KEYFRAMES,
        SWATCH_BLOOM_TRAIL_MS,
        SWATCH_BLOOM_TRAIL_DELAY_MS
      ),
      keyframeTimeline(
        trailFade,
        SWATCH_TRAIL_FADE_KEYFRAMES,
        SWATCH_BLOOM_TRAIL_MS,
        SWATCH_BLOOM_TRAIL_DELAY_MS
      ),
    ]);
    bloom.start();
    return () => bloom.stop();
  }, [reduced, scale, fade, trailScale, trailFade]);
  if (reduced) return null;
  const frame = {
    position: 'absolute' as const,
    left: -SELECTION_RING_WIDTH_PX,
    top: -SELECTION_RING_WIDTH_PX,
    width: size + 2 * SELECTION_RING_WIDTH_PX,
    height: size + 2 * SELECTION_RING_WIDTH_PX,
    borderRadius: size / 2 + SELECTION_RING_WIDTH_PX,
    borderColor: color,
  };
  return (
    <>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        style={{
          ...frame,
          borderWidth: SELECTION_RING_WIDTH_PX,
          opacity: keyframeValue(fade, SWATCH_BLOOM_FADE_KEYFRAMES, (frame) => frame.opacity),
          transform: [
            { scale: keyframeValue(scale, SWATCH_BLOOM_SCALE_KEYFRAMES, (frame) => frame.scale) },
          ],
        }}
      />
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        style={{
          ...frame,
          borderWidth: SWATCH_BLOOM_TRAIL_WIDTH_PX,
          opacity: keyframeValue(trailFade, SWATCH_TRAIL_FADE_KEYFRAMES, (frame) => frame.opacity),
          transform: [
            {
              scale: keyframeValue(
                trailScale,
                SWATCH_TRAIL_SCALE_KEYFRAMES,
                (frame) => frame.scale
              ),
            },
          ],
        }}
      />
    </>
  );
}
