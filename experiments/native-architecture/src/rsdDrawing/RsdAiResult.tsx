import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { css, html } from 'react-strict-dom';
import {
  AI_FAILED_ANNOUNCEMENT,
  AI_LOADING_TITLE,
  AI_READY_ANNOUNCEMENT,
} from '../../../../web/src/lib/ai/loadingCopy';
import { Animated, Easing } from '../platform/animated';
import { AiRecoveryActions } from '../ai/AiRecoveryActions';
import type { AiProgress, AiProgressOwner } from '../ai/aiProgress';
import { AI_RESULT_COPY } from '../ai/aiResultCopy';
import { aiResultFrame, type AiResultMode } from '../ai/aiResultGeometry';
import type { AiState, NativeAiOwner } from '../ai/generation';
import type { AiResult } from '../ai/journal';
import { keepAiPicture } from '../ai/keepAiPicture';
import { aiResultPhase, aiRun, aiJournalWaiting } from '../ai/uiState';
import { useAiProgress } from '../ai/useAiProgress';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { isUnsaved, type UnsavedOutcome } from '../export/pictureSave';
import type { PictureFormat } from '../export/pictureFilename';
import type { KeptAiPicture } from '../ai/keepAiPicture';
import { DialogHeader } from './DialogHeader';
import { fontTheme } from './fontTheme';
import { ModalStage } from './ModalShell';
import { RsdAiReportConfirm, RsdAiReportStatus, aiReportSettled } from './RsdAiImageReport';
import { RsdAiResultError } from './RsdAiResultError';
import {
  RsdAiDisclosure,
  RsdAiDownload,
  RsdAiKeepDrawing,
  RsdAiLoadingCaption,
} from './RsdAiResultParts';
import { RsdAiResultStage } from './RsdAiResultStage';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { colors, darkTheme, dimensions, fixedColors, fonts, shadows } from './tokens.css';

// AiImageResult.svelte's polaroid send-off: the card tilts like a fresh print, holds, then sails
// off to the bottom-left. native-ai-flow-geometry.test.mjs reads these back.
export const SEND_OFF_TILT_DEG = -3;
export const SEND_OFF_TILT_MS = 400;
export const SEND_OFF_FLY_DELAY_MS = 900;
export const SEND_OFF_FLY_MS = 850;
export const SEND_OFF_CALM_FLY_DELAY_MS = 500;
export const SEND_OFF_CALM_FLY_MS = 400;
export const SEND_OFF_END = { x: -0.42, y: 0.48, scale: 0.12, rotateDeg: -28 } as const;
const EASE_POP = Easing.bezier(0.34, 1.56, 0.64, 1);
const FLY_EASE = Easing.bezier(0.55, 0, 0.85, 0.2);
const DEG = 'deg';

type Decoded = { src: string; width: number; height: number };

function useSendOff(exiting: boolean, reduceMotion: boolean, onDone: () => void) {
  const tilt = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!exiting) return;
    const animation = Animated.parallel([
      Animated.timing(tilt, {
        toValue: 1,
        duration: reduceMotion ? 0 : SEND_OFF_TILT_MS,
        easing: EASE_POP,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(reduceMotion ? SEND_OFF_CALM_FLY_DELAY_MS : SEND_OFF_FLY_DELAY_MS),
        Animated.timing(fly, {
          toValue: 1,
          duration: reduceMotion ? SEND_OFF_CALM_FLY_MS : SEND_OFF_FLY_MS,
          easing: reduceMotion ? Easing.ease : FLY_EASE,
          useNativeDriver: true,
        }),
      ]),
    ]);
    animation.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => animation.stop();
  }, [exiting, fly, reduceMotion, tilt]);
  return { tilt, fly };
}

// The dial and the reveal are silent to a screen reader, so a status says each state in words.
function announcement(phase: ReturnType<typeof aiResultPhase>, revealed: boolean) {
  if (phase.kind === 'error') return AI_FAILED_ANNOUNCEMENT;
  return revealed ? AI_READY_ANNOUNCEMENT : AI_LOADING_TITLE;
}

function resultMode(phase: ReturnType<typeof aiResultPhase>, waiting: boolean): AiResultMode {
  if (phase.kind === 'error') return phase.reason === 'safety' ? 'safety' : 'serverError';
  return waiting ? 'waiting' : 'picture';
}

// The shipping AI Result: the dial over the blurred drawing while the picture is made, then the
// picture with its Download and the disclosure strip, or the error card. While the picture is
// still on its way, leaving tucks it into the paper's corner instead of throwing it away.
export function RsdAiResult({
  owner,
  state,
  progress,
  visible,
  onDismiss,
  onSaveFailed,
}: {
  owner: NativeAiOwner;
  state: AiState;
  progress: AiProgressOwner;
  visible: boolean;
  onDismiss: () => void;
  // A Download that did not land, for the Save Failure Banner and its Try again.
  onSaveFailed: (outcome: UnsavedOutcome, base64: string | null, format: PictureFormat) => void;
}) {
  const dial = useAiProgress(progress);
  const phase = aiResultPhase(state);
  const generating = phase.kind === 'generating';
  const [exiting, setExiting] = useState(false);
  const leave = () => {
    if (exiting) return;
    if (generating) owner.minimize();
    else owner.close();
  };
  return (
    <>
      <ModalStage
        visible={visible}
        label={AI_RESULT_COPY.label}
        onClose={leave}
        onDismiss={onDismiss}
      >
        <ResultCard
          owner={owner}
          state={state}
          phase={phase}
          dial={dial}
          exiting={exiting}
          onLeave={leave}
          onKept={(kept) => {
            // A save that did not land keeps the picture on the card rather than sending it off
            // as if it were kept; the banner tells the parent and offers the retry.
            if (isUnsaved(kept.outcome)) onSaveFailed(kept.outcome, kept.base64, kept.format);
            else setExiting(true);
          }}
        />
      </ModalStage>
      <RsdAiReportConfirm owner={owner} report={state.report} />
    </>
  );
}

function ResultCard({
  owner,
  state,
  phase,
  dial,
  exiting,
  onLeave,
  onKept,
}: {
  owner: NativeAiOwner;
  state: AiState;
  phase: ReturnType<typeof aiResultPhase>;
  dial: AiProgress;
  exiting: boolean;
  onLeave: () => void;
  onKept: (kept: KeptAiPicture) => void;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useDrawingAppearance();
  const run = aiRun(state);
  const result = phase.kind === 'result' ? phase.picture : null;
  const revealed = dial.revealed && !!result;
  const loading = phase.kind !== 'error' && !revealed;
  const waiting = loading && phase.kind === 'generating';
  const sizerSrc = result?.uri ?? run?.submitted ?? null;
  const decoded = useDecodedSize(sizerSrc);
  const aspect = decoded ? decoded.width / decoded.height : window.width / window.height;
  const frame = aiResultFrame({
    window,
    insets,
    aspect,
    mode: resultMode(phase, waiting),
    naturalWidth: decoded && decoded.src === sizerSrc ? decoded.width : null,
  });
  const settled = aiReportSettled(state.report);
  const download = useDownload(exiting, onKept);
  return (
    <SendOff exiting={exiting} shiftY={frame.shiftY} onDone={owner.close}>
      <html.div
        data-testid="ai-result-card"
        style={[
          fontTheme,
          theme === 'dark' && darkTheme,
          styles.card(frame.width, frame.maxHeight),
          exiting && styles.polaroid,
        ]}
      >
        <RsdVisuallyHidden live>{announcement(phase, revealed)}</RsdVisuallyHidden>
        <Fades hidden={exiting}>
          <DialogHeader
            onClose={onLeave}
            closeLabel={phase.kind === 'generating' ? AI_RESULT_COPY.closeWaiting : undefined}
          />
        </Fades>
        <html.div
          style={[
            styles.content,
            phase.kind === 'error' && phase.reason !== 'safety' && styles.serverContent,
          ]}
        >
          {phase.kind === 'error' ? (
            <RsdAiResultError owner={owner} state={state} reason={phase.reason}>
              {state.recovery ? (
                <AiRecoveryActions owner={owner} state={state} waiting={aiJournalWaiting(state)} />
              ) : null}
            </RsdAiResultError>
          ) : (
            <>
              <RsdAiResultStage
                run={run}
                progress={dial}
                width={frame.stage.width}
                height={frame.stage.height}
                dialSize={frame.dialSize}
              />
              {loading ? <RsdAiLoadingCaption /> : null}
              {waiting ? <RsdAiKeepDrawing onPress={owner.minimize} /> : null}
              {revealed && result ? (
                <Fades hidden={exiting}>
                  <html.div style={styles.footer}>
                    <RsdAiDownload onPress={() => void download(result)} />
                    <RsdAiReportStatus owner={owner} report={state.report} />
                  </html.div>
                </Fades>
              ) : null}
            </>
          )}
        </html.div>
        {revealed && result && !settled ? (
          <Fades hidden={exiting} strip>
            <RsdAiDisclosure
              disabled={!run?.submitted}
              onReport={() => owner.reportPicture(result.uri)}
            />
          </Fades>
        ) : null}
      </html.div>
    </SendOff>
  );
}

// The shown picture's own size, which the card sizes itself from, read from the image rather
// than a load event, which React Native Web's Image restarts on every render of a turning dial.
function useDecodedSize(src: string | null) {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  useEffect(() => {
    if (!src) return;
    let current = true;
    Image.getSize(
      src,
      (width, height) => {
        if (current && width > 0 && height > 0) setDecoded({ src, width, height });
      },
      () => {}
    );
    return () => {
      current = false;
    };
  }, [src]);
  return decoded;
}

// One Download at a time per picture: a second tap while its save is in flight does nothing.
function useDownload(exiting: boolean, onKept: (kept: KeptAiPicture) => void) {
  const saving = useRef<string | null>(null);
  return async (picture: AiResult) => {
    if (exiting || saving.current === picture.uri) return;
    saving.current = picture.uri;
    const kept = await keepAiPicture(picture);
    if (saving.current === picture.uri) saving.current = null;
    onKept(kept);
  };
}

function SendOff({
  exiting,
  shiftY,
  onDone,
  children,
}: {
  exiting: boolean;
  shiftY: number;
  onDone: () => void;
  children: ReactNode;
}) {
  const window = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { tilt, fly } = useSendOff(exiting, reduceMotion, onDone);
  const toward = (to: number) => fly.interpolate({ inputRange: [0, 1], outputRange: [0, to] });
  const turn = Animated.add(
    tilt.interpolate({ inputRange: [0, 1], outputRange: [0, SEND_OFF_TILT_DEG] }),
    toward(SEND_OFF_END.rotateDeg - SEND_OFF_TILT_DEG)
  );
  return (
    <Animated.View
      style={{
        opacity: fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateY: shiftY },
          { translateX: toward(SEND_OFF_END.x * window.width) },
          { translateY: toward(SEND_OFF_END.y * window.height) },
          {
            rotate: turn.interpolate({
              inputRange: [-360, 360],
              outputRange: [`-360${DEG}`, `360${DEG}`],
            }),
          },
          { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, SEND_OFF_END.scale] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// The send-off hides the card's controls so it reads as a clean print, keeping their footprint so
// the Download's place stays as the polaroid's thick bottom edge.
function Fades({
  hidden,
  strip = false,
  children,
}: {
  hidden: boolean;
  strip?: boolean;
  children: ReactNode;
}) {
  return (
    <html.div style={[strip ? styles.stripSlot : styles.fadeSlot, hidden && styles.faded]}>
      {children}
    </html.div>
  );
}

const styles = css.create({
  card: (width: number, maxHeight: number) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width,
    maxHeight,
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    boxShadow: shadows.shadowPop,
    color: colors.text,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
  }),
  polaroid: { backgroundColor: fixedColors.polaroidPaper },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: dimensions.space3,
    padding: dimensions.space4,
  },
  serverContent: {
    paddingTop: dimensions.space7,
    paddingLeft: dimensions.space6,
    paddingRight: dimensions.space6,
    paddingBottom: dimensions.space6,
    overflowY: 'auto',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space2,
  },
  fadeSlot: {
    alignSelf: 'stretch',
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  stripSlot: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  faded: { opacity: 0, pointerEvents: 'none' },
});
