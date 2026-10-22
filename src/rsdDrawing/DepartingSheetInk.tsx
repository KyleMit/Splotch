import { StyleSheet } from 'react-native';
import type { DepartingInk } from '../drawing/departingInk';
import type { Drawing } from '../drawing/model';
import { PageOutline } from '../drawing/PageOutline';
import type { PresentedFrame } from '../drawing/paperPresentation';
import type { PaperBounds } from '../drawing/paperSpace';
import { Svg } from '../platform/svg';
import { DepartingInkView } from './DepartingInkView';

type Props = {
  drawing: Drawing;
  ink: DepartingInk | null;
  size: PaperBounds;
  frame: PresentedFrame;
  outline: boolean;
};

// The departing page flies the ink layer's pixels, as shipping flies its canvas. Drawing the
// cleared strokes again through react-native-svg wrapped every Crayon pass in a paper-sized filter
// that Core Image copied at half-float precision, and a scribbled page ran the iPad past its memory
// limit (issue 3035). The outline still draws as SVG above the ink, as it does on the paper.
export function DepartingSheetInk({ drawing, ink, size, frame, outline }: Props) {
  return (
    <>
      {ink ? <DepartingInkView ink={ink} width={frame.width} height={frame.height} /> : null}
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox={`${size.x} ${size.y} ${size.width} ${size.height}`}
        preserveAspectRatio="none"
      >
        {outline ? <PageOutline pageId={drawing.pageId} size={size} /> : null}
      </Svg>
    </>
  );
}
