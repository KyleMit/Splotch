import { useContext, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { css, html } from 'react-strict-dom';
import {
  CLEAR_SHEET_CURVE,
  CLEAR_SHEET_DURATION_MS,
  CLEAR_SHEET_END_SCALE,
  CLEAR_SHEET_END_TURN_DEG,
  WASH_REACH_DIAGONAL_FRACTION,
  clearSheetOrigin,
} from '../clear/dragToClear';
import type { ClearControl } from '../clear/useClearGesture';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { InkAppearanceScope } from '../drawing/InkAppearance';
import { InkPaperScope } from '../drawing/InkPaper';
import { InkScene } from '../drawing/InkScene';
import type { Drawing } from '../drawing/model';
import { PageOutline } from '../drawing/PageOutline';
import { fittedPaper } from '../drawing/paperGeometry';
import { drawingPaper, presentedPaperSize } from '../drawing/paperSpace';
import { PAPER_THEMES, TOUCH_TARGET } from '../drawing/theme';
import { OfflineArtworkScope } from '../offlineLibrary/artworkContext';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { clearActivationProps } from '../platform/clearActivation';
import { ACCEPT_RING, RsdClearRing, ringFrame } from './RsdClearRing';
import { RsdIcon } from './RsdIcon';
import { EDGE_INSET_PX, type AreaSize } from './edgeLayout';
import { iconFrame, styles } from './controls';

const ICON_SIZE_PX = 32;
// ClearButton.svelte's .clear-wash: a fixed gradient square scaled out from the dock corner.
const WASH_SIZE_PX = 256;
const WASH_PEAK_OPACITY = 0.9;
// .clear-preview's flood: 95% paper at the dock corner fading to 82% at 140% of the reach, which
// is this strength at the far corner.
const FLOOD_NEAR_OPACITY = 0.95;
const FLOOD_FAR_OPACITY = 0.857;
const DELETE_READY_SCALE = 1.1;
const LIFT_SQUASH = 0.07;
const SHEET_EASING = Easing.bezier(...CLEAR_SHEET_CURVE);

const clearStyles = css.create({
  lifted: { boxShadow: '-6px 6px 30px rgba(0, 0, 0, 0.4)' },
  round: (radius: number) => ({ borderRadius: radius }),
  // The shipping delete-ready alarm red.
  alarm: { backgroundColor: 'rgb(255, 56, 56)', borderColor: 'rgb(255, 56, 56)' },
});

const layer = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  wash: { position: 'absolute', top: 0, right: 0, width: WASH_SIZE_PX, height: WASH_SIZE_PX },
});

export function RsdClearButton({
  control,
  disabled,
}: {
  control: ClearControl;
  disabled: boolean;
}) {
  const { values, dragging, reached, clearing } = control;
  return (
    <Animated.View
      accessible
      accessibilityRole="button"
      accessibilityLabel="Clear"
      accessibilityState={{ disabled }}
      pointerEvents={clearing ? 'none' : 'auto'}
      {...control.responder}
      {...clearActivationProps(control.activate)}
      style={{
        width: TOUCH_TARGET,
        height: TOUCH_TARGET,
        transform: [
          { translateX: values.drag.x },
          { translateY: values.drag.y },
          {
            scale: values.emphasis.interpolate({
              inputRange: [0, 1],
              outputRange: [1, DELETE_READY_SCALE],
            }),
          },
          {
            scaleX: values.lift.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1 + LIFT_SQUASH],
            }),
          },
          {
            scaleY: values.lift.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1 - LIFT_SQUASH],
            }),
          },
        ],
      }}
    >
      <html.div
        style={[
          styles.iconAction,
          iconFrame(TOUCH_TARGET),
          styles.touchTarget(TOUCH_TARGET),
          dragging && clearStyles.lifted,
          dragging && clearStyles.round(TOUCH_TARGET / 2),
          reached && clearStyles.alarm,
          disabled && styles.disabled,
        ]}
      >
        <RsdIcon
          name={dragging ? 'trash-open' : 'trash-closed'}
          size={ICON_SIZE_PX}
          ink={undefined}
          muted={disabled}
        />
      </html.div>
    </Animated.View>
  );
}

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
function DepartingSheet({ control, area }: { control: ClearControl; area: AreaSize }) {
  const sheet = control.sheet;
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
  const bin = {
    x: area.width - EDGE_INSET_PX - TOUCH_TARGET / 2,
    y: EDGE_INSET_PX + TOUCH_TARGET / 2,
  };
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

// Everything the gesture paints between the paper and the controls: the clean page standing in
// while the clear lands, the radial wash that grows with the drag, the flood past the threshold,
// the departing page and the accept ring.
export function RsdClearUnderlay({
  control,
  drawing,
}: {
  control: ClearControl;
  drawing: Drawing;
}) {
  const [area, setArea] = useState<AreaSize>({ width: 0, height: 0 });
  const { values, reached, radius } = control;
  const reach = Math.hypot(area.width, area.height) * WASH_REACH_DIAGONAL_FRACTION;
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
        style={[
          layer.wash,
          {
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
      <DepartingSheet control={control} area={area} />
      {control.ringShown ? (
        <Animated.View
          testID="rsd-clear-accept-ring"
          style={[
            ringFrame(radius),
            {
              opacity: values.ring.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
              transform: [
                { scale: values.ring.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            },
          ]}
        >
          <RsdClearRing
            radius={radius}
            ink={reached ? ACCEPT_RING.reached : ACCEPT_RING.short}
            id="rsd-clear-accept"
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
