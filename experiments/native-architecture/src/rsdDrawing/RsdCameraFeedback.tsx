import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from '../platform/animated';
import type { ScreenshotFeedback } from '../useSavePicture';
import { keyframeTimeline, keyframeValue } from './keyframeMotion';

import { CAMERA_CAPTURE_MS, CAMERA_CAPTURE_KEYFRAMES } from './cameraKeyframes';

export function RsdCameraFeedback({
  feedback,
  children,
}: {
  feedback: ScreenshotFeedback | null;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const elapsedMs =
      feedback?.kind === 'capture' ? performance.now() - feedback.startedAt : CAMERA_CAPTURE_MS;
    if (feedback?.kind !== 'capture' || feedback.reduced || elapsedMs >= CAMERA_CAPTURE_MS) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    // The event clock survives drawer remounts and a delayed web chunk; neither starts a new cue.
    const capture = keyframeTimeline(
      progress,
      CAMERA_CAPTURE_KEYFRAMES,
      CAMERA_CAPTURE_MS,
      0,
      elapsedMs
    );
    capture.start();
    return () => capture.stop();
  }, [feedback, progress]);
  const rotate = keyframeValue(
    progress,
    CAMERA_CAPTURE_KEYFRAMES,
    (frame) => frame.rotate
  ).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] });
  return (
    <Animated.View
      testID="rsd-camera-feedback"
      style={{
        transform: [
          { scale: keyframeValue(progress, CAMERA_CAPTURE_KEYFRAMES, (frame) => frame.scale) },
          { rotate },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
