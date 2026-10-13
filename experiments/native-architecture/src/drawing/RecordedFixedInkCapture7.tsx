import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import type Svg from 'react-native-svg';
import { CaptureSvg } from './CaptureSvg';
import { InkPaperScope } from './InkPaper';
import { RecordedScene7 } from './RecordedScene7';
import { recordedResourceStyles7 } from './recordedPaintPlan7';
import { recordedResourceStrokes7 } from './RecordedPaint7';
import { CrayonTileResourceScope, useCrayonTileResources, useCrayonTileReadiness } from './useCrayonTileReadiness';
import { BundledFillLoadScope } from './BundledBookArtwork';
import { useBundledFillReadiness } from './useBundledFillReadiness';
import { useInkAppearance } from './InkAppearance';
import { PAPER_WIDTH, PAPER_HEIGHT } from './paperSpace';
import type { RecordedInkPlan7 } from './captureInkPlan';

export function RecordedFixedInkCapture7({ plan, svgRef, onReady, onError }: { plan: RecordedInkPlan7; svgRef: RefObject<Svg | null>; onReady: () => void; onError: (error: unknown) => void }) {
  const { theme } = useInkAppearance();
  const strokes = useMemo(() => recordedResourceStrokes7(recordedResourceStyles7(plan.drawing, null)), [plan.drawing]);
  const fillPlan = useMemo(() => ({ strokes }), [strokes]);
  const resources = useCrayonTileResources(strokes, theme);
  const tiles = useCrayonTileReadiness(resources.uris, onError);
  const fill = useBundledFillReadiness(fillPlan, onError);
  const current = useRef({ plan, onReady }); current.current = { plan, onReady };
  useEffect(() => { if (tiles.ready && fill.ready && current.current.plan === plan) current.current.onReady(); }, [plan, tiles.ready, fill.ready]);
  return <InkPaperScope.Provider value={plan.paper}><View style={styles.capture} pointerEvents="none">{tiles.decode}{fill.decode}<CrayonTileResourceScope.Provider value={resources}><BundledFillLoadScope.Provider value={fill.loaded}>
    <CaptureSvg style={styles.ink} ref={svgRef} width={PAPER_WIDTH} height={PAPER_HEIGHT} viewBox={'0 0 ' + PAPER_WIDTH + ' ' + PAPER_HEIGHT} preserveAspectRatio="xMidYMid meet"><RecordedScene7 drawing={plan.drawing} preview={null} /></CaptureSvg>
  </BundledFillLoadScope.Provider></CrayonTileResourceScope.Provider></View></InkPaperScope.Provider>;
}
const styles = StyleSheet.create({ ink: { isolation: 'isolate' }, capture: { position: 'absolute', left: -PAPER_WIDTH * 2, top: 0, width: PAPER_WIDTH, height: PAPER_HEIGHT } });
