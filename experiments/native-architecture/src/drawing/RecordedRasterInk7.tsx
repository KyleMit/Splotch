import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { RecordedScene7 } from './RecordedScene7';
import { recordedResourceStyles7 } from './recordedPaintPlan7';
import { recordedResourceStrokes7 } from './RecordedPaint7';
import {
  CrayonTileResourceScope,
  useCrayonTileResources,
  useCrayonTileReadiness,
} from './useCrayonTileReadiness';
import { BundledFillLoadScope } from './BundledBookArtwork';
import { useBundledFillReadiness } from './useBundledFillReadiness';
import { useInkAppearance } from './InkAppearance';
import { PAPER_WIDTH, PAPER_HEIGHT } from './paperSpace';
import type { RecordedInkPlan7 } from './captureInkPlan';
import type { Drawing7, Style7 } from './recordedTypes7';
import type { LiveCohort7 } from './recordedContactCohort7';

export type RecordedRasterHandle7 = {
  readyPlan: (drawing: Drawing7) => RecordedInkPlan7;
  isReady: () => boolean;
};
type Props = {
  drawing: Drawing7;
  preview: LiveCohort7 | null;
  selection: Style7;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
};
export const RecordedRasterInk7 = forwardRef<RecordedRasterHandle7, Props>(
  function RecordedRasterInk7(props, ref) {
    const { theme } = useInkAppearance();
    const strokes = useMemo(
      () =>
        recordedResourceStrokes7([
          ...recordedResourceStyles7(props.drawing, props.preview),
          props.selection,
        ]),
      [props.drawing, props.preview, props.selection]
    );
    const fillPlan = useMemo(() => ({ strokes }), [strokes]);
    const resources = useCrayonTileResources(strokes, theme);
    const tiles = useCrayonTileReadiness(resources.uris, props.onError);
    const fill = useBundledFillReadiness(fillPlan, props.onError);
    const current = useRef(props);
    current.current = props;
    const ready = tiles.ready && fill.ready;
    useEffect(() => current.current.onBusy(!ready), [ready]);
    useImperativeHandle(
      ref,
      () => ({
        isReady: () => ready,
        readyPlan(drawing) {
          if (!ready || current.current.preview || drawing !== current.current.drawing)
            throw new Error('This picture is still being prepared.');
          return { kind: 'recorded', paper: drawing.paper, drawing };
        },
      }),
      [ready]
    );
    return (
      <CrayonTileResourceScope.Provider value={resources}>
        <BundledFillLoadScope.Provider value={fill.loaded}>
          <View style={styles.scene} pointerEvents="none">
            {tiles.decode}
            {fill.decode}
            <Svg
              style={styles.ink}
              width="100%"
              height="100%"
              viewBox={'0 0 ' + PAPER_WIDTH + ' ' + PAPER_HEIGHT}
              preserveAspectRatio="xMidYMid meet"
            >
              <RecordedScene7 drawing={props.drawing} preview={props.preview} />
            </Svg>
          </View>
        </BundledFillLoadScope.Provider>
      </CrayonTileResourceScope.Provider>
    );
  }
);
const styles = StyleSheet.create({
  ink: { isolation: 'isolate' },
  scene: { width: '100%', height: '100%', isolation: 'isolate' },
});
