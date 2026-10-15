import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from '../platform/animated';
import { useReduceMotion } from '../drawing/useReduceMotion';
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
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const id = feedback?.id;
  const kind = feedback?.kind;
  useEffect(() => {
    if (kind !== 'capture' || reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const capture = keyframeTimeline(progress, CAMERA_CAPTURE_KEYFRAMES, CAMERA_CAPTURE_MS);
    capture.start();
    return () => capture.stop();
  }, [id, kind, reduced, progress]);
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
