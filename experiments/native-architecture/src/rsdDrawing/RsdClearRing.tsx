import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { createClearRingContours } from '../../../../web/src/lib/components/clearRingContours';
import { dockCenterFromTopRight, type ClearDock } from '../clear/clearDock';

const RING_STROKE_WIDTH_PX = 4;
// The shipping wash is a CSS `radial-gradient(circle, …)` over the ring's square box, whose default
// farthest-corner extent puts 100% at the box corner: the half-diagonal, not the ring's radius.
const WASH_EXTENT_PERCENT = 50 * Math.SQRT2;

export type RingInk = Readonly<{
  rgb: string;
  strokeOpacity: number;
  washOpacity: number;
  washFrom: number;
  solid: boolean;
}>;

// ClearButton.svelte's accept-zone inks: the dashed hint while short of the threshold, solid and
// stronger past it, both in the shipping alarm red.
const ALARM_RGB = 'rgb(255, 56, 56)';
export const ACCEPT_RING: Record<'short' | 'reached', RingInk> = {
  short: { rgb: ALARM_RGB, strokeOpacity: 0.45, washOpacity: 0.06, washFrom: 0.55, solid: false },
  reached: { rgb: ALARM_RGB, strokeOpacity: 0.9, washOpacity: 0.22, washFrom: 0.5, solid: true },
};

// The accept ring is centred on the Clear Button's docked centre, in the dock's own frame.
export function ringFrame(radius: number, dock: ClearDock) {
  const center = dockCenterFromTopRight(dock);
  return {
    position: 'absolute',
    top: center.y - radius,
    right: center.x - radius,
    width: radius * 2,
    height: radius * 2,
  } as const;
}

// The shipping hand-drawn ring (web/src/lib/components/ClearRing.svelte), drawn from the same
// contours, with the accept zone's radial wash behind it.
export function RsdClearRing({ radius, ink, id }: { radius: number; ink: RingInk; id: string }) {
  const diameter = Math.max(1, radius * 2 - RING_STROKE_WIDTH_PX);
  const contours = useMemo(() => createClearRingContours(diameter), [diameter]);
  return (
    <View pointerEvents="none" style={{ width: radius * 2, height: radius * 2 }}>
      <Svg width={radius * 2} height={radius * 2}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r={`${WASH_EXTENT_PERCENT}%`}>
            <Stop offset={ink.washFrom} stopColor={ink.rgb} stopOpacity={0} />
            <Stop offset={1} stopColor={ink.rgb} stopOpacity={ink.washOpacity} />
          </RadialGradient>
        </Defs>
        <Circle cx={radius} cy={radius} r={radius} fill={`url(#${id})`} />
        <Path
          d={ink.solid ? contours.solid : contours.dashes}
          transform={`translate(${RING_STROKE_WIDTH_PX / 2} ${RING_STROKE_WIDTH_PX / 2})`}
          fill="none"
          stroke={ink.rgb}
          strokeOpacity={ink.strokeOpacity}
          strokeWidth={RING_STROKE_WIDTH_PX}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
