import { useLayoutEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  FilterMode,
  MipmapMode,
  Skia,
  SkiaPictureView,
  type SkPicture,
} from '@shopify/react-native-skia';
import type { DepartingInk } from '../drawing/departingInk';
import { showPicture } from '../drawing/skiaViewPicture';

// The paper region of the ink layer's pixels, resampled once onto the departing page's frame. The
// picture keeps its own reference to the image, so the gesture may release the snapshot first.
function departingPicture(ink: DepartingInk, width: number, height: number): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
  const { x, y, width: sourceWidth, height: sourceHeight } = ink.paper;
  canvas.drawImageRectOptions(
    ink.image,
    Skia.XYWHRect(x, y, sourceWidth, sourceHeight),
    Skia.XYWHRect(0, 0, width, height),
    FilterMode.Linear,
    MipmapMode.None,
    Skia.Paint()
  );
  return recorder.finishRecordingAsPicture();
}

// The picture reaches the mounted view through Skia's JSI setter, never as a `picture` prop:
// SkiaPictureView's constructor submits that prop at once, and an instance StrictMode constructs
// and discards would hold the page's pixels under a view id that never mounts to release them.
export function DepartingInkView({
  ink,
  width,
  height,
}: {
  ink: DepartingInk;
  width: number;
  height: number;
}) {
  const view = useRef<SkiaPictureView>(null);
  useLayoutEffect(() => {
    const mounted = view.current;
    if (!mounted) return;
    const picture = departingPicture(ink, width, height);
    try {
      showPicture(mounted, picture);
    } catch (error) {
      picture.dispose();
      throw error;
    }
    return () => picture.dispose();
  }, [ink, width, height]);
  return (
    <SkiaPictureView
      ref={view}
      testID="rsd-clear-sheet-ink"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
}
