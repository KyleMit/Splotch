import { memo, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import {
  ERASER_FILL_OPACITY,
  ERASER_GLOW_OPACITY,
  ERASER_LINE_OPACITY,
  HALO_GLOW,
  HALO_GLOW_PX,
  HALO_LINE,
  RAINBOW_BAND_PX,
  RING_GLOW_OPACITY,
  RING_LINE_OPACITY,
  RING_LINE_PX,
  haloMotionPending,
  haloPose,
  rainbowArcs,
  reconcileHalos,
  settleHalos,
  type Halo,
  type ShownHalo,
} from './haloModel';
import type { HaloFeed } from './haloFeed';
import { useReduceMotion } from './useReduceMotion';

function useShownHalos(halos: readonly Halo[], reduced: boolean) {
  const [shown, setShown] = useState<readonly ShownHalo[]>([]);
  const [now, setNow] = useState(() => performance.now());
  useLayoutEffect(() => {
    const at = performance.now();
    setNow(at);
    setShown((previous) => reconcileHalos(previous, halos, at, reduced));
  }, [halos, reduced]);
  const pending = haloMotionPending(shown, now, reduced);
  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      const at = performance.now();
      setNow(at);
      setShown((previous) => settleHalos(previous, at));
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, now]);
  return { shown, now };
}

function HaloMarks({ halo }: { halo: Halo }) {
  const radius = halo.size / 2;
  if (halo.kind === 'eraser')
    return (
      <>
        <Circle
          r={radius + HALO_GLOW_PX / 2}
          fill="none"
          stroke={HALO_GLOW}
          strokeOpacity={ERASER_GLOW_OPACITY}
          strokeWidth={HALO_GLOW_PX}
        />
        <Circle
          r={Math.max(radius - RING_LINE_PX / 2, 0)}
          fill={HALO_GLOW}
          fillOpacity={ERASER_FILL_OPACITY}
          stroke={HALO_LINE}
          strokeOpacity={ERASER_LINE_OPACITY}
          strokeWidth={RING_LINE_PX}
        />
      </>
    );
  if (halo.kind === 'magic')
    return (
      <>
        {rainbowArcs(radius + RAINBOW_BAND_PX / 2).map(({ d, color }) => (
          <Path key={d} d={d} fill="none" stroke={color} strokeWidth={RAINBOW_BAND_PX} />
        ))}
      </>
    );
  return (
    <>
      <Circle
        r={radius + RING_LINE_PX + HALO_GLOW_PX / 2}
        fill="none"
        stroke={HALO_GLOW}
        strokeOpacity={RING_GLOW_OPACITY}
        strokeWidth={HALO_GLOW_PX}
      />
      <Circle
        r={radius + RING_LINE_PX / 2}
        fill="none"
        stroke={HALO_LINE}
        strokeOpacity={RING_LINE_OPACITY}
        strokeWidth={RING_LINE_PX}
      />
    </>
  );
}

// The web build animates halos through React state each frame, like the SVG ink beneath them.
// Native draws them in Skia on the UI thread instead (PointerHalos.tsx).
export const PointerHalos = memo(function PointerHalos({ feed }: { feed: HaloFeed }) {
  const halos = useSyncExternalStore(feed.subscribe, feed.current);
  const reduced = useReduceMotion();
  const { shown, now } = useShownHalos(halos, reduced);
  if (shown.length === 0) return null;
  return (
    <Svg
      width="100%"
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="pointer-halos"
    >
      {shown.map((entry) => {
        const { scale, opacity } = haloPose(entry, now, reduced);
        return (
          <G
            key={entry.halo.id}
            opacity={opacity}
            transform={`translate(${entry.halo.x} ${entry.halo.y}) scale(${scale})`}
          >
            <HaloMarks halo={entry.halo} />
          </G>
        );
      })}
    </Svg>
  );
});
