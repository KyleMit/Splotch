import { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import {
  RAINBOW_BAND_PX,
  RING_LINE_PX,
  haloMotionPending,
  haloPose,
  rainbowArcs,
  reconcileHalos,
  settleHalos,
  type Halo,
  type ShownHalo,
} from './haloModel';
import { useReduceMotion } from './useReduceMotion';

const HALO_LINE = 'rgb(80, 80, 80)';
const HALO_GLOW = 'rgb(255, 255, 255)';
const HALO_GLOW_PX = 1;
const RING_LINE_OPACITY = 0.35;
const RING_GLOW_OPACITY = 0.35;
const ERASER_LINE_OPACITY = 0.7;
const ERASER_FILL_OPACITY = 0.35;
const ERASER_GLOW_OPACITY = 0.6;

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

// Purely presentational: the halos the contact responder publishes, in ink-plane pixels.
export function PointerHalos({ halos }: { halos: readonly Halo[] }) {
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
}
