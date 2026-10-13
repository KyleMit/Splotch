import { useInkPaper } from './InkPaper';
import { semanticWidth } from './paperSpace';
import { useId, type ReactNode } from 'react';
import { Defs, G, Image, Mask, Rect } from 'react-native-svg';
import type { InkCheckpoint } from './checkpoints';
import { Ink, InkArtwork } from './Ink';
import { PAPER_WIDTH, PAPER_HEIGHT, type Stroke } from './model';
import { StrokeShape } from './StrokeShape';

type Props = {
  checkpoint: InkCheckpoint | null;
  strokes: readonly Stroke[];
  onImageLoad: () => void;
};

export function InkScene({ checkpoint, strokes, onImageLoad }: Props) {
  const id = useId();
  const paper = useInkPaper();
  const masks: ReactNode[] = [];
  let scene: ReactNode = checkpoint ? (
    <Image
      href={`data:image/png;base64,${checkpoint.base64}`}
      x={0}
      y={0}
      width={PAPER_WIDTH}
      height={PAPER_HEIGHT}
      preserveAspectRatio="none"
      onLoad={onImageLoad}
    />
  ) : null;
  for (let index = 0; index < strokes.length;) {
    const start = index;
    const erased = strokes[start].brush === 'eraser';
    while (index < strokes.length && (strokes[index].brush === 'eraser') === erased) index += 1;
    const run = strokes.slice(start, index);
    if (erased) {
      const maskId = `${id}-erase-${start}`;
      masks.push(
        <Mask
          key={maskId}
          id={maskId}
          style={{ maskType: 'luminance' }}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={PAPER_WIDTH}
          height={PAPER_HEIGHT}
        >
          <Rect width={PAPER_WIDTH} height={PAPER_HEIGHT} fill="white" />
          {run.map((stroke, offset) => (
            <StrokeShape
              key={start + offset}
              points={stroke.points}
              width={semanticWidth(stroke.width, paper)}
              paint="black"
            />
          ))}
        </Mask>
      );
      scene = (
        <G key={maskId} mask={`url(#${maskId})`}>
          {scene}
        </G>
      );
    } else {
      scene = (
        <>
          {scene}
          {run.map((stroke, offset) =>
            stroke.brush === 'eraser' ? null : <Ink key={start + offset} stroke={stroke} />
          )}
        </>
      );
    }
  }
  return (
    <InkArtwork strokes={strokes}>
      <Defs>{masks}</Defs>
      {scene}
    </InkArtwork>
  );
}
