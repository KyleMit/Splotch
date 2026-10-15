import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { css, html } from 'react-strict-dom';
import { DrawingStatusBar, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { useDialogBack } from '../platform/BrowserBack';
import { DialogScope } from './dialogScope';
import { fontTheme } from './fontTheme';
import { FOLLOW_APP_ORIENTATION, useModalFrame } from './useModalFrame';
import { ModalScrim } from './ModalScrim';
import { useModalOrigin } from './modalOrigin';
import { colors, darkTheme, dimensions, fonts, shadows } from './tokens.css';
import {
  CSS_EASE,
  CSS_EASE_REVERSED,
  EASE_GLIDE,
  FLY_BACK_REACH,
  FLY_BACK_SCALE,
  FLY_IN_DURATION_MS,
  FLY_IN_OPACITY,
  FLY_IN_TRANSFORM,
  MODAL_EXIT_MS,
  MODAL_FADE_MS,
  type ModalSize,
  type TouchBackdrop,
} from './modalGeometry';

type Phase = 'entering' | 'open' | 'exiting' | 'gone';
type Point = { x: number; y: number };
type Motion = ReturnType<typeof createMotion>;
type Keyframe = { at: number; easing: readonly [number, number, number, number] | null };

const ignore = () => {};

function createMotion() {
  return {
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    scale: new Animated.Value(1),
    opacity: new Animated.Value(0),
    scrim: new Animated.Value(0),
  };
}

function curve(easing: Keyframe['easing']) {
  return easing ? Easing.bezier(...easing) : Easing.linear;
}

function tween(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: Keyframe['easing']
) {
  return Animated.timing(value, {
    toValue,
    duration,
    easing: curve(easing),
    useNativeDriver: true,
  });
}

function keyframes<Frame extends Keyframe>(
  value: Animated.Value,
  frames: readonly Frame[],
  pick: (frame: Frame) => number
) {
  value.setValue(pick(frames[0]));
  return Animated.sequence(
    frames
      .slice(1)
      .map((frame, index) =>
        tween(
          value,
          pick(frame),
          (frame.at - frames[index].at) * FLY_IN_DURATION_MS,
          frames[index].easing
        )
      )
  );
}

function rest(motion: Motion) {
  motion.x.setValue(0);
  motion.y.setValue(0);
  motion.scale.setValue(1);
}

// dialogFlyFromOrigin, or under reduced motion the card's plain fade; the scrim fades either way.
function enter(motion: Motion, from: Point, reduced: boolean) {
  const scrim = tween(motion.scrim, 1, MODAL_FADE_MS, CSS_EASE);
  if (reduced) {
    rest(motion);
    return Animated.parallel([tween(motion.opacity, 1, MODAL_FADE_MS, CSS_EASE), scrim]);
  }
  return Animated.parallel([
    keyframes(motion.x, FLY_IN_TRANSFORM, (frame) => frame.reach * from.x),
    keyframes(motion.y, FLY_IN_TRANSFORM, (frame) => frame.reach * from.y),
    keyframes(motion.scale, FLY_IN_TRANSFORM, (frame) => frame.scale),
    keyframes(motion.opacity, FLY_IN_OPACITY, (frame) => frame.opacity),
    scrim,
  ]);
}

// dialogFlyBack toward the opener, or the reduced-motion fade.
function exit(motion: Motion, from: Point, reduced: boolean) {
  const scrim = tween(motion.scrim, 0, MODAL_EXIT_MS, CSS_EASE_REVERSED);
  if (reduced)
    return Animated.parallel([tween(motion.opacity, 0, MODAL_FADE_MS, CSS_EASE_REVERSED), scrim]);
  return Animated.parallel([
    tween(motion.x, from.x * FLY_BACK_REACH, MODAL_EXIT_MS, EASE_GLIDE),
    tween(motion.y, from.y * FLY_BACK_REACH, MODAL_EXIT_MS, EASE_GLIDE),
    tween(motion.scale, FLY_BACK_SCALE, MODAL_EXIT_MS, EASE_GLIDE),
    tween(motion.opacity, 0, MODAL_EXIT_MS, EASE_GLIDE),
    scrim,
  ]);
}

// Holds the dialog on screen through its exit, and reports the dismissal once the exit is done:
// natively on iOS, which cannot present the next dialog until UIKit has dismissed this one, and
// from here everywhere else.
function useModalMotion(visible: boolean, onDismiss: (() => void) | undefined) {
  const reduced = useReduceMotion();
  const origin = useModalOrigin();
  const window = useWindowDimensions();
  const [motion] = useState(createMotion);
  const [phase, setPhase] = useState<Phase>(visible ? 'entering' : 'gone');
  if (visible && (phase === 'gone' || phase === 'exiting')) setPhase('entering');
  if (!visible && (phase === 'entering' || phase === 'open')) setPhase('exiting');
  const from = useRef<Point>({ x: 0, y: 0 });
  const windowRef = useRef(window);
  windowRef.current = window;
  const dismissal = useRef({ pending: false, onDismiss });
  dismissal.current.onDismiss = onDismiss;
  useEffect(() => {
    if (phase !== 'entering' && phase !== 'exiting') return;
    if (phase === 'entering') from.current = origin?.take(windowRef.current) ?? { x: 0, y: 0 };
    const animation =
      phase === 'entering'
        ? enter(motion, from.current, reduced)
        : exit(motion, from.current, reduced);
    animation.start(({ finished }) => {
      if (!finished) return;
      if (phase === 'exiting') dismissal.current.pending = true;
      setPhase(phase === 'entering' ? 'open' : 'gone');
    });
    return () => animation.stop();
  }, [phase, motion, origin, reduced]);
  useEffect(() => {
    if (phase !== 'gone' || !dismissal.current.pending) return;
    dismissal.current.pending = false;
    if (Platform.OS !== 'ios') dismissal.current.onDismiss?.();
  }, [phase]);
  return { presented: phase !== 'gone', motion };
}

type ModalStageProps = {
  visible: boolean;
  // The scrim and card surface clear so the screen behind shows (useDialogSeeThrough).
  seeThrough?: boolean;
  touchBackdrop?: TouchBackdrop;
  label: string;
  labelledBy?: string;
  onClose: () => void;
  onDismiss?: () => void;
  children: ReactNode;
  overlay?: ReactNode;
};

// The shipping modal frame (app.css .modal-dialog): a card centered on a dimmed scrim that flies
// in from the press that opened it and flies back as it closes. Escape, Android Back, the browser
// Back and a press on the scrim all ask the caller to close.
export function ModalStage({
  visible,
  seeThrough = false,
  touchBackdrop = 'frosted',
  label,
  labelledBy,
  onClose,
  onDismiss,
  children,
  overlay,
}: ModalStageProps) {
  const { presented, motion } = useModalMotion(visible, onDismiss);
  const origin = useModalOrigin();
  useDialogBack(visible, onClose);
  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      visible={presented}
      animationType="none"
      supportedOrientations={FOLLOW_APP_ORIENTATION}
      accessibilityLabel={label}
      aria-labelledby={overlay ? undefined : labelledBy}
      onRequestClose={visible ? onClose : ignore}
      onDismiss={Platform.OS === 'ios' ? onDismiss : undefined}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={layout.fill}>
        <DrawingStatusBar />
        <View
          style={layout.fill}
          onStartShouldSetResponderCapture={(event) =>
            origin?.blocks(event) || (origin?.record(event) ?? false)
          }
          onResponderTerminationRequest={() => false}
        >
          {/* Hidden rather than unmounted: the web scrim follows its fade only while mounted. */}
          <View style={[layout.cover, seeThrough && layout.clear]} pointerEvents="none">
            <ModalScrim
              opacity={motion.scrim}
              visible={visible}
              seeThrough={seeThrough}
              touchBackdrop={touchBackdrop}
            />
          </View>
          {/* A responder rather than a Pressable: React Native Web makes every enabled Pressable a
              tab stop, and its Modal focuses the first one, which would put an unnamed scrim
              ahead of the header and let Enter dismiss the dialog. */}
          <View
            testID="modal-backdrop"
            aria-hidden
            style={layout.cover}
            onStartShouldSetResponder={() => visible}
            onResponderRelease={onClose}
          />
          {/* box-none, so a press beside the card reaches the backdrop. React Native Web's box-none
              also stamps an unlayered `pointer-events: auto` on every descendant, outranking React
              Strict DOM's layered `pointerEvents: 'none'`; the card turns its own subtree back on,
              so plain `none` is the same stage on the web without that rule. */}
          <View
            accessibilityElementsHidden={!!overlay}
            importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'}
            aria-hidden={!!overlay}
            pointerEvents={overlay ? 'none' : Platform.OS === 'web' ? 'none' : 'box-none'}
            style={[layout.center, !!overlay && layout.clear]}
          >
            <Animated.View
              testID="modal-card"
              pointerEvents={visible ? 'auto' : 'none'}
              style={{
                opacity: motion.opacity,
                transform: [
                  { translateX: motion.x },
                  { translateY: motion.y },
                  { scale: motion.scale },
                ],
              }}
            >
              {children}
            </Animated.View>
          </View>
          {overlay ? <View style={layout.cover}>{overlay}</View> : null}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

type ModalShellProps = Omit<ModalStageProps, 'labelledBy'> & {
  size: ModalSize;
  header: ReactNode;
  // false: the body lays out its own scrollers, inset by useDialogBody, as Settings' shells do.
  scrolls?: boolean;
  // A height the card budgets under its frame's cap: the Coloring Book Picker's fold through a row.
  heightBudget?: number | null;
};

// The shipping .modal-shell card: a header over a scrolling body, sized by the card it ports.
export function ModalShell({
  size,
  header,
  scrolls = true,
  heightBudget = null,
  children,
  ...stage
}: ModalShellProps) {
  const titleId = useId();
  return (
    <ModalStage {...stage} labelledBy={titleId}>
      <ModalCard
        size={size}
        titleId={titleId}
        active={stage.visible && !stage.overlay}
        seeThrough={stage.seeThrough ?? false}
        header={header}
        scrolls={scrolls}
        heightBudget={heightBudget}
      >
        {children}
      </ModalCard>
    </ModalStage>
  );
}

function ModalCard({
  size,
  titleId,
  active,
  seeThrough,
  header,
  scrolls,
  heightBudget,
  children,
}: {
  size: ModalSize;
  titleId: string;
  active: boolean;
  seeThrough: boolean;
  header: ReactNode;
  scrolls: boolean;
  heightBudget: number | null;
  children: ReactNode;
}) {
  const theme = useDrawingAppearance();
  const frame = useModalFrame(size);
  const { body } = frame;
  const fit = frame.height === null ? layout.hug : layout.fill;
  const maxHeight =
    heightBudget === null ? frame.maxHeight : Math.min(frame.maxHeight, heightBudget);
  return (
    <html.div
      data-testid="modal-surface"
      inert={!active}
      style={[
        fontTheme,
        theme === 'dark' && darkTheme,
        styles.card(frame.width, maxHeight),
        frame.height !== null && styles.height(frame.height),
        seeThrough && styles.seeThrough,
      ]}
    >
      <html.div style={styles.clip}>
        <DialogScope value={{ titleId, header: frame.header, body, active, seeThrough }}>
          {header}
          {scrolls ? (
            <ScrollView
              testID="modal-body"
              style={fit}
              contentContainerStyle={{
                paddingTop: body.top,
                paddingBottom: body.bottom,
                paddingHorizontal: body.inline,
              }}
              removeClippedSubviews={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View testID="modal-body" style={fit}>
              {children}
            </View>
          )}
        </DialogScope>
      </html.div>
    </html.div>
  );
}

const layout = StyleSheet.create({
  fill: { flex: 1 },
  hug: { flexGrow: 0, flexShrink: 1 },
  cover: { position: 'absolute', inset: 0 },
  clear: { opacity: 0 },
  center: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
});

const styles = css.create({
  card: (width: number, maxHeight: number) => ({
    display: 'flex',
    flexDirection: 'column',
    width,
    maxHeight,
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    boxShadow: shadows.shadowPop,
    color: colors.text,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
  }),
  height: (height: number) => ({ height }),
  seeThrough: { backgroundColor: 'transparent', boxShadow: 'none' },
  clip: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    borderRadius: dimensions.radiusLg,
    overflow: 'hidden',
  },
});
