import { InkPaperScope } from './InkPaper';
import { paperSize, samePaper } from './paperSpace';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type Svg from 'react-native-svg';
import { CaptureSvg } from './CaptureSvg';
import type { InkPlan, InkCheckpoint } from './checkpoints';
import { PNG_TIMEOUT_MS } from './svgCapture';
import { InkScene } from './InkScene';
import { DecodedPng } from './DecodedPng';
import { BundledFillLoadScope } from './BundledBookArtwork';
import { useInkAppearance } from './InkAppearance';
import {
  CrayonTileResourceScope,
  useCrayonTileResources,
  useCrayonTileReadiness,
} from './useCrayonTileReadiness';
import { useBundledFillReadiness } from './useBundledFillReadiness';

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
  if (plan.checkpoint && !samePaper(plan.paper, plan.checkpoint.paper))
    throw new Error('The checkpoint paper reference does not match the capture.');
  const { theme } = useInkAppearance();
  const size = paperSize(plan.paper);
  const tileResources = useCrayonTileResources(plan.strokes, theme);
  const tiles = useCrayonTileReadiness(tileResources.uris, onError);
  const fill = useBundledFillReadiness(plan, onError);
  const [loaded, setLoaded] = useState<InkCheckpoint | null>(null);
  const current = useRef({ plan, onReady, onError });
  current.current = { plan, onReady, onError };
  useEffect(() => {
    if ((!plan.checkpoint || loaded === plan.checkpoint) && fill.ready && tiles.ready) {
      current.current.onReady();
      return;
    }
    const timeout = setTimeout(() => {
      if (current.current.plan !== plan) return;
      current.current.onError(
        new Error(
          fill.uri
            ? 'The coloring fill did not load for capture. Your saved drawing is unchanged.'
            : 'The checkpoint did not load for capture. Your saved drawing is unchanged.'
        )
      );
    }, PNG_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [plan, loaded, fill.uri, fill.ready, tiles.ready]);
  function imageLoaded() {
    if (current.current.plan.checkpoint === plan.checkpoint) setLoaded(plan.checkpoint);
  }
  return (
    <InkPaperScope.Provider value={plan.paper}>
      <View style={[styles.capture, size, { left: -size.width * 2 }]} pointerEvents="none">
        {fill.decode}
        {tiles.decode}
        {plan.checkpoint ? (
          <DecodedPng
            key={plan.checkpoint.id}
            base64={plan.checkpoint.base64}
            size={size}
            onLoad={imageLoaded}
            onError={(error) => {
              if (current.current.plan === plan) current.current.onError(error);
            }}
          />
        ) : null}
        <CrayonTileResourceScope.Provider value={tileResources}>
          <BundledFillLoadScope.Provider value={fill.loaded}>
            <CaptureSvg
              ref={svgRef}
              width={size.width}
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <InkScene
                checkpoint={plan.checkpoint}
                strokes={plan.strokes}
                onImageLoad={() => {
                  if (Platform.OS !== 'android') imageLoaded();
                }}
              />
            </CaptureSvg>
          </BundledFillLoadScope.Provider>
        </CrayonTileResourceScope.Provider>
      </View>
    </InkPaperScope.Provider>
  );
}

const styles = StyleSheet.create({
  capture: { position: 'absolute', top: 0 },
});
