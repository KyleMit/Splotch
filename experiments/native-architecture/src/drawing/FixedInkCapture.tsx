import { useEffect, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import type { InkPlan, InkCheckpoint } from './checkpoints';
import { PNG_TIMEOUT_MS } from './svgCapture';
import { InkScene } from './InkScene';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';

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
    const timeout = setTimeout(
      () =>
        current.current.onError(
          new Error('The checkpoint did not load for capture. Your saved drawing is unchanged.')
        ),
      PNG_TIMEOUT_MS
    );
    return () => clearTimeout(timeout);
  }, [plan, loaded]);
  return (
    <View style={styles.capture} pointerEvents="none">
      <Svg
        ref={svgRef}
        width={PAPER_WIDTH}
        height={PAPER_HEIGHT}
        viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
      >
        <InkScene
          checkpoint={plan.checkpoint}
          strokes={plan.strokes}
          onImageLoad={() => {
            if (current.current.plan.checkpoint === plan.checkpoint) setLoaded(plan.checkpoint);
          }}
        />
      </Svg>
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
