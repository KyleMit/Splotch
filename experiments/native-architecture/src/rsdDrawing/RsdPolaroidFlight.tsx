import { useEffect, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { polaroidCssSize } from '../../../../web/src/lib/drawing/polaroidGeometry';
import { POLAROID_FLIGHT_MS } from '../../../../web/src/lib/drawing/screenshotTiming';
import { DRAWING_POLAROID } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { Animated, Easing } from '../platform/animated';
import type { PolaroidFlight } from '../useSavePicture';
import {
  CSS_EASE,
  DISCARD_FADE_MS,
  FLASH_MS,
  POLAROID_Z_INDEX,
  POLAROID_FADE_KEYFRAMES,
  POLAROID_FADE_MS,
  POLAROID_FLASH_KEYFRAMES,
  POLAROID_FRAME,
  POLAROID_SHOW_KEYFRAMES,
  type PolaroidKeyframe,
} from './polaroidFlight';
import { keyframeTimeline, keyframeValue } from './keyframeMotion';
import { fixedColors } from './tokens.css';

type Offset = Readonly<{ x: number; y: number }>;

// The polaroid flies from the Save screenshot button's center; the offset is measured from the
// overlay's own center, where the frame rests.
function measureOrigin(overlay: View | null, button: View | null, done: (offset: Offset) => void) {
  if (!overlay) return;
  overlay.measureInWindow((left, top, width, height) => {
    if (!button) return done({ x: 0, y: 0 });
    button.measureInWindow((buttonLeft, buttonTop, buttonWidth, buttonHeight) =>
      done({
        x: Math.round(buttonLeft + buttonWidth / 2 - (left + width / 2)),
        y: Math.round(buttonTop + buttonHeight / 2 - (top + height / 2)),
      })
    );
  });
}

function frameMotion(
  progress: Animated.Value,
  keyframes: readonly PolaroidKeyframe[],
  from: Offset
) {
  return {
    opacity: keyframeValue(progress, keyframes, (keyframe) => keyframe.opacity),
    transform: [
      { translateX: keyframeValue(progress, keyframes, (keyframe) => keyframe.from * from.x) },
      { translateY: keyframeValue(progress, keyframes, (keyframe) => keyframe.from * from.y) },
      { scale: keyframeValue(progress, keyframes, (keyframe) => keyframe.scale) },
      {
        rotate: progress.interpolate({
          inputRange: keyframes.map((keyframe) => keyframe.at),
          outputRange: keyframes.map((keyframe) => `${keyframe.rotate}deg`),
          extrapolate: 'clamp',
        }),
      },
    ],
  };
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: POLAROID_Z_INDEX },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: 'white' },
  frame: {
    backgroundColor: DRAWING_POLAROID.paper,
    paddingTop: POLAROID_FRAME.paddingTopPx,
    paddingHorizontal: POLAROID_FRAME.paddingInlinePx,
    paddingBottom: POLAROID_FRAME.paddingBottomPx,
    borderRadius: POLAROID_FRAME.radiusPx,
    boxShadow: POLAROID_FRAME.shadow,
  },
});

// .polaroid-image's corner. Local because the StyleX web compile resolves only local constants and
// token files inside css.create; native-polaroid-flight.test.mjs reads it back from app.css.
const IMAGE_RADIUS_PX = 1;

// An RSD image keeps React Native Web's Image component, and the chunk it would share with the AI
// surfaces, off the web startup path.
const pictureStyles = css.create({
  image: {
    display: 'block',
    backgroundColor: fixedColors.polaroidPaper,
    borderRadius: IMAGE_RADIUS_PX,
  },
  size: (width: number, height: number) => ({ width, height }),
});

function useDiscardFade(discarded: boolean) {
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!discarded) return;
    const [x1, y1, x2, y2] = CSS_EASE;
    const out = Animated.timing(fade, {
      toValue: 0,
      duration: DISCARD_FADE_MS,
      easing: Easing.bezier(x1, y1, x2, y2),
      useNativeDriver: true,
    });
    out.start();
    return () => out.stop();
  }, [discarded, fade]);
  return fade;
}

// The flight plays once, measured from where the button is when the polaroid appears, and under
// the Reduce Motion answer it started with, as the shipping frame is stamped at its start.
function useFlightMotion(origin: Offset | null, calm: boolean, land: () => void) {
  const progress = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!origin) return;
    const frame = calm
      ? keyframeTimeline(progress, POLAROID_FADE_KEYFRAMES, POLAROID_FADE_MS)
      : keyframeTimeline(progress, POLAROID_SHOW_KEYFRAMES, POLAROID_FLIGHT_MS);
    const flight = calm
      ? frame
      : Animated.parallel([frame, keyframeTimeline(flash, POLAROID_FLASH_KEYFRAMES, FLASH_MS)]);
    flight.start(({ finished }) => {
      if (finished) land();
    });
    return () => flight.stop();
  }, [origin, calm, progress, flash, land]);
  return { progress, flash };
}

function Flight({
  flight,
  cameraTile,
  onLanded,
}: {
  flight: PolaroidFlight;
  cameraTile: RefObject<View | null>;
  onLanded: (id: number) => void;
}) {
  const reduceMotion = useReduceMotion();
  const [calm] = useState(reduceMotion);
  const window = useWindowDimensions();
  const overlay = useRef<View>(null);
  const [origin, setOrigin] = useState<Offset | null>(null);
  const [land] = useState(() => () => onLanded(flight.id));
  const { progress, flash } = useFlightMotion(origin, calm, land);
  const fade = useDiscardFade(flight.discarded);
  const size = polaroidCssSize(flight.paper, window);
  if (!size) return null;
  const keyframes = calm ? POLAROID_FADE_KEYFRAMES : POLAROID_SHOW_KEYFRAMES;
  return (
    <View
      ref={overlay}
      testID="rsd-polaroid-flight"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.overlay}
      onLayout={() =>
        measureOrigin(overlay.current, cameraTile.current, (offset) =>
          setOrigin((current) => current ?? offset)
        )
      }
    >
      <Animated.View style={[styles.stage, { opacity: fade }]}>
        {calm ? null : (
          <Animated.View
            style={[
              styles.flash,
              { opacity: keyframeValue(flash, POLAROID_FLASH_KEYFRAMES, (key) => key.opacity) },
            ]}
          />
        )}
        <Animated.View
          testID="rsd-polaroid-frame"
          style={[styles.frame, frameMotion(progress, keyframes, origin ?? { x: 0, y: 0 })]}
        >
          <html.img
            alt=""
            src={`data:image/png;base64,${flight.pngBase64}`}
            style={[pictureStyles.image, pictureStyles.size(size.width, size.height)]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// The shipping save-screenshot polaroid (polaroidAnimation.ts and the app.css .polaroid-* rules):
// the camera flash, the picture on photographic paper flying out of the Save screenshot button to
// the middle of the screen, a wobble, and back into the button. Decorative: a save says nothing.
export function RsdPolaroidFlight({
  flight,
  cameraTile,
  onLanded,
}: {
  flight: PolaroidFlight | null;
  cameraTile: RefObject<View | null>;
  onLanded: (id: number) => void;
}) {
  return flight ? (
    <Flight key={flight.id} flight={flight} cameraTile={cameraTile} onLanded={onLanded} />
  ) : null;
}
