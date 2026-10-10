import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type Svg from 'react-native-svg';
import { CaptureSvg } from './CaptureSvg';
import type { InkPlan, InkCheckpoint } from './checkpoints';
import { PNG_TIMEOUT_MS } from './svgCapture';
import { InkScene } from './InkScene';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';
import { DecodedPng } from './DecodedPng';

export function FixedInkCapture({
  plan,
  svgRef,
  onReady,
  onError,
}: {
  plan: InkPlan;
  svgRef: RefObject<Svg | null>;
  onReady: () => void;
  onError: (error: unknown) => void;
}) {
  const [loaded, setLoaded] = useState<InkCheckpoint | null>(null);
  const current = useRef({ plan, onReady, onError });
  current.current = { plan, onReady, onError };
  useEffect(() => {
    if (!plan.checkpoint || loaded === plan.checkpoint) {
      current.current.onReady();
      return;
    }
    const timeout = setTimeout(() => {
      if (current.current.plan !== plan) return;
      current.current.onError(
        new Error('The checkpoint did not load for capture. Your saved drawing is unchanged.')
      );
    }, PNG_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [plan, loaded]);
  function imageLoaded() {
    if (current.current.plan.checkpoint === plan.checkpoint) setLoaded(plan.checkpoint);
  }
  return (
    <View style={styles.capture} pointerEvents="none">
      {plan.checkpoint ? (
        <DecodedPng
          key={plan.checkpoint.id}
          base64={plan.checkpoint.base64}
          onLoad={imageLoaded}
          onError={(error) => {
            if (current.current.plan === plan) current.current.onError(error);
          }}
        />
      ) : null}
      <CaptureSvg
        ref={svgRef}
        width={PAPER_WIDTH}
        height={PAPER_HEIGHT}
        viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
      >
        <InkScene
          checkpoint={plan.checkpoint}
          strokes={plan.strokes}
          onImageLoad={() => {
            if (Platform.OS !== 'android') imageLoaded();
          }}
        />
      </CaptureSvg>
    </View>
  );
}

const styles = StyleSheet.create({
  capture: {
    position: 'absolute',
    left: -PAPER_WIDTH * 2,
    top: 0,
    width: PAPER_WIDTH,
    height: PAPER_HEIGHT,
  },
});
