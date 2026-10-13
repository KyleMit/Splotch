import { useContext, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  CLEAR_SHEET_CURVE,
  CLEAR_SHEET_DURATION_MS,
  CLEAR_SHEET_END_SCALE,
  CLEAR_SHEET_END_TURN_DEG,
  WASH_REACH_DIAGONAL_FRACTION,
  clearSheetOrigin,
} from '../clear/dragToClear';
import { dockCenterFromTopRight } from '../clear/clearDock';
import type { ClearControl } from '../clear/useClearGesture';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { InkAppearanceScope } from '../drawing/InkAppearance';
import { InkPaperScope } from '../drawing/InkPaper';
import { InkScene } from '../drawing/InkScene';
import type { Drawing } from '../drawing/model';
import { PageOutline } from '../drawing/PageOutline';
import { fittedPaper } from '../drawing/paperGeometry';
import { drawingPaper, presentedPaperSize } from '../drawing/paperSpace';
import { PAPER_THEMES } from '../drawing/theme';
import { OfflineArtworkScope } from '../offlineLibrary/artworkContext';
import { isOfflinePageId } from '../offlineLibrary/identity';
import type { AreaOffset, AreaSize } from './edgeLayout';

// ClearButton.svelte's .clear-wash: a fixed gradient square scaled out from the dock corner.
const WASH_SIZE_PX = 256;
const WASH_PEAK_OPACITY = 0.9;
// .clear-preview's flood: 95% paper at the dock corner fading to 82% at 140% of the reach, which
// is this strength at the far corner.
const FLOOD_NEAR_OPACITY = 0.95;
const FLOOD_FAR_OPACITY = 0.857;
const SHEET_EASING = Easing.bezier(...CLEAR_SHEET_CURVE);

const layer = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  wash: { position: 'absolute', width: WASH_SIZE_PX, height: WASH_SIZE_PX },
});
function PaperArt({ drawing, ink, frame }: { drawing: Drawing; ink: boolean; frame: AreaSize }) {
  const theme = useDrawingAppearance();
  const size = presentedPaperSize(drawingPaper(drawing), frame);
  const artwork = useContext(OfflineArtworkScope);
  const outline = !isOfflinePageId(drawing.pageId) || Boolean(artwork[drawing.pageId]);
  return (
    <InkAppearanceScope.Provider value={{ pageId: drawing.pageId, theme }}>
      <InkPaperScope.Provider value={drawingPaper(drawing)}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
        >
          <Rect width={size.width} height={size.height} fill={PAPER_THEMES[theme].paper} />
          {ink ? (
            <InkScene checkpoint={null} strokes={drawing.strokes} onImageLoad={() => {}} />
          ) : null}
          {outline ? <PageOutline pageId={drawing.pageId} size={size} /> : null}
        </Svg>
      </InkPaperScope.Provider>
    </InkAppearanceScope.Provider>
  );
}

// The whole page, paper and ink, scales into the Clear button and slides beneath it, so the
// button hiding the sheet is the disappearance (web/src/lib/drawing/inkMotion.ts clear()).
function DepartingSheet({
  control,
  area,
  offset,
}: {
  control: ClearControl;
  area: AreaSize;
  offset: AreaOffset;
}) {
  // A sheet that left before this layer mounted has missed its departure; replaying the flight from
  // the start would bring the cleared page back over newer ink. The gesture expires it on time.
  const [mountedAt] = useState(Date.now);
  const sheet = control.sheet && control.sheet.startedAt >= mountedAt ? control.sheet : null;
  const [flight] = useState(() => new Animated.Value(0));
  const { finishSheet } = control;
  useEffect(() => {
    if (!sheet) return;
    flight.setValue(0);
    const animation = Animated.timing(flight, {
      toValue: 1,
      duration: CLEAR_SHEET_DURATION_MS,
      easing: SHEET_EASING,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) finishSheet(sheet.id);
    });
    return () => animation.stop();
  }, [flight, sheet, finishSheet]);
  if (!sheet) return null;
  const frame = fittedPaper(area, drawingPaper(sheet.drawing));
  const dock = dockCenterFromTopRight(control.dock);
  const bin = { x: area.width + offset.right - dock.x, y: dock.y - offset.top };
  const origin = clearSheetOrigin(bin, area);
  return (
    <Animated.View
      testID="rsd-clear-sheet"
      pointerEvents="none"
      style={{
        position: 'absolute',
        ...frame,
        transformOrigin: `${origin.x - frame.left}px ${origin.y - frame.top}px`,
        transform: [
          {
            scale: flight.interpolate({
              inputRange: [0, 1],
              outputRange: [1, CLEAR_SHEET_END_SCALE],
            }),
          },
          {
            rotate: flight.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${CLEAR_SHEET_END_TURN_DEG}deg`],
            }),
          },
        ],
      }}
    >
      <PaperArt drawing={sheet.drawing} ink frame={frame} />
    </Animated.View>
  );
}

function PaperGradient({
  id,
  width,
  height,
  reach,
  near,
  far,
}: {
  id: string;
  width: number;
  height: number;
  reach: number;
  near: number;
  far: number;
}) {
  const paper = PAPER_THEMES[useDrawingAppearance()].paper;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient
          id={id}
          cx={width}
          cy={0}
          r={Math.max(reach, 1)}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset={0} stopColor={paper} stopOpacity={near} />
          <Stop offset={1} stopColor={paper} stopOpacity={far} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

function ClearCover({ drawing, area }: { drawing: Drawing; area: AreaSize }) {
  const frame = fittedPaper(area, drawingPaper(drawing));
  return (
    <View testID="rsd-clear-cover" style={[{ position: 'absolute' }, frame]}>
      <PaperArt drawing={drawing} ink={false} frame={frame} />
    </View>
  );
}

// Everything the gesture paints between the paper and the edge controls: the clean page standing
// in while the clear lands, the radial wash that grows with the drag out of the screen's top-right
// corner, the flood past the threshold and the departing page. `offset` places this paper area
// inside the layout the dock is measured from.
export function RsdClearUnderlay({
  control,
  drawing,
  offset,
}: {
  control: ClearControl;
  drawing: Drawing;
  offset: AreaOffset;
}) {
  const [area, setArea] = useState<AreaSize>({ width: 0, height: 0 });
  const window = useWindowDimensions();
  const { values, reached } = control;
  const reach = Math.hypot(window.width, window.height) * WASH_REACH_DIAGONAL_FRACTION;
  return (
    <View
      testID="rsd-clear-underlay"
      pointerEvents="none"
      style={layer.fill}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setArea((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        );
      }}
    >
      {control.covered ? <ClearCover drawing={drawing} area={area} /> : null}
      <Animated.View
        testID="rsd-clear-wash"
        style={[
          layer.wash,
          {
            top: -offset.top,
            right: -offset.right,
            opacity: reached ? 0 : values.progress,
            transformOrigin: '100% 0%',
            transform: [
              {
                scale: values.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, reach / WASH_SIZE_PX],
                }),
              },
            ],
          },
        ]}
      >
        <PaperGradient
          id="rsd-clear-wash"
          width={WASH_SIZE_PX}
          height={WASH_SIZE_PX}
          reach={WASH_SIZE_PX}
          near={WASH_PEAK_OPACITY}
          far={0}
        />
      </Animated.View>
      <Animated.View style={[layer.fill, { opacity: values.flood }]}>
        <PaperGradient
          id="rsd-clear-flood"
          width={area.width}
          height={area.height}
          reach={Math.hypot(area.width, area.height)}
          near={FLOOD_NEAR_OPACITY}
          far={FLOOD_FAR_OPACITY}
        />
      </Animated.View>
      <DepartingSheet control={control} area={area} offset={offset} />
    </View>
  );
}
