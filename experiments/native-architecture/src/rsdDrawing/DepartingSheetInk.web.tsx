import { StyleSheet } from 'react-native';
import type { DepartingInk } from '../drawing/departingInk';
import { InkScene } from '../drawing/InkScene';
import type { Drawing } from '../drawing/model';
import { PageOutline } from '../drawing/PageOutline';
import type { PresentedFrame } from '../drawing/paperPresentation';
import type { PaperBounds } from '../drawing/paperSpace';
import { Svg } from '../platform/svg';

type Props = {
  drawing: Drawing;
  ink: DepartingInk | null;
  size: PaperBounds;
  frame: PresentedFrame;
  outline: boolean;
};

// The browser draws the departing page's strokes as SVG; the native renderer flies the ink layer's
// pixels instead (DepartingSheetInk.tsx).
export function DepartingSheetInk({ drawing, size, outline }: Props) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={`${size.x} ${size.y} ${size.width} ${size.height}`}
      preserveAspectRatio="none"
    >
      <InkScene checkpoint={null} strokes={drawing.strokes} onImageLoad={() => {}} />
      {outline ? <PageOutline pageId={drawing.pageId} size={size} /> : null}
    </Svg>
  );
}
