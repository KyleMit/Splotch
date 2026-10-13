import { useId, type ReactNode } from 'react';
import { Defs, G, Mask, Rect } from 'react-native-svg';
import { InkArtwork } from './Ink';
import { useInkPaper } from './InkPaper';
import { PAPER_WIDTH, PAPER_HEIGHT, semanticWidth } from './paperSpace';
import { RecordedShape7, RecordedSolid7 } from './RecordedPaint7';
import { RecordedWax7 } from './RecordedWax7';
import type { Stroke } from './model';
import { recordedSceneUnits7, type RecordedPaintPlan7 } from './recordedPaintPlan7';

export function RecordedSceneContent7({
  plan,
  resources,
}: {
  plan: RecordedPaintPlan7;
  resources: readonly Stroke[];
}) {
  const id = 'erase-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const paper = useInkPaper();
  const masks: ReactNode[] = [];
  let scene: ReactNode = null;
  for (const [index, unit] of recordedSceneUnits7(plan).entries()) {
    if (unit.kind === 'wax') {
      scene = (
        <>
          {scene}
          <RecordedWax7 key={index} paints={unit.paints} />
        </>
      );
      continue;
    }
    const paint = unit.paint;
    if (paint.style.brush === 'eraser') {
      const mask = id + '-' + index;
      masks.push(
        <Mask
          key={mask}
          id={mask}
          style={{ maskType: 'luminance' }}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={PAPER_WIDTH}
          height={PAPER_HEIGHT}
        >
          <Rect width={PAPER_WIDTH} height={PAPER_HEIGHT} fill="white" />
          <RecordedShape7
            op={paint.op}
            width={semanticWidth(paint.style.width, paper)}
            paint="black"
          />
        </Mask>
      );
      scene = (
        <G key={mask} mask={'url(#' + mask + ')'}>
          {scene}
        </G>
      );
    } else if (paint.style.brush === 'crayon')
      scene = (
        <>
          {scene}
          <RecordedWax7 key={index} paints={[paint]} />
        </>
      );
    else
      scene = (
        <>
          {scene}
          <RecordedSolid7 key={index} paint={paint} />
        </>
      );
  }
  return (
    <InkArtwork strokes={resources}>
      <Defs>{masks}</Defs>
      {scene}
    </InkArtwork>
  );
}
