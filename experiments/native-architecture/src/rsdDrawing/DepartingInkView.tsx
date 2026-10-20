import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  FilterMode,
  MipmapMode,
  Skia,
  SkiaPictureView,
  type SkPicture,
} from '@shopify/react-native-skia';
import type { DepartingInk } from '../drawing/departingInk';

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

export function DepartingInkView({
  ink,
  width,
  height,
}: {
  ink: DepartingInk;
  width: number;
  height: number;
}) {
  const picture = useMemo(() => departingPicture(ink, width, height), [ink, width, height]);
  useEffect(() => () => picture.dispose(), [picture]);
  return (
    <SkiaPictureView
      testID="rsd-clear-sheet-ink"
      picture={picture}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
}
