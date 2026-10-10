import { useId } from 'react';
import { Defs, G, Image, Mask, Rect } from 'react-native-svg';
import { BRUSHES } from './brushes';
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
  const firstErase = strokes.findIndex((stroke) => stroke.brush === 'eraser');
  const endErase =
    firstErase < 0
      ? -1
      : strokes.findIndex((stroke, index) => index > firstErase && stroke.brush !== 'eraser');
  const before = firstErase < 0 ? strokes : strokes.slice(0, firstErase);
  const erasers =
    firstErase < 0 ? [] : strokes.slice(firstErase, endErase < 0 ? strokes.length : endErase);
  const after = endErase < 0 ? [] : strokes.slice(endErase);
  if (after.some((stroke) => stroke.brush === 'eraser'))
    throw new Error('Ink must be checkpointed before another eraser layer.');
  const base = (
    <>
      {checkpoint ? (
        <Image
          href={`data:image/png;base64,${checkpoint.base64}`}
          x={0}
          y={0}
          width={PAPER_WIDTH}
          height={PAPER_HEIGHT}
          preserveAspectRatio="none"
          onLoad={onImageLoad}
        />
      ) : null}
      {before.map((stroke, index) =>
        stroke.brush === 'eraser' ? null : <Ink key={index} stroke={stroke} />
      )}
    </>
  );
  return (
    <InkArtwork strokes={strokes}>
      {erasers.length ? (
        <>
          <Defs>
            <Mask
              id={id}
              style={{ maskType: 'luminance' }}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={PAPER_WIDTH}
              height={PAPER_HEIGHT}
            >
              <Rect width={PAPER_WIDTH} height={PAPER_HEIGHT} fill="white" />
              {erasers.map((stroke, index) => (
                <StrokeShape
                  key={index}
                  points={stroke.points}
                  width={BRUSHES.eraser.width}
                  paint="black"
                />
              ))}
            </Mask>
          </Defs>
          <G mask={`url(#${id})`}>{base}</G>
        </>
      ) : (
        base
      )}
      {after.map((stroke, index) =>
        stroke.brush === 'eraser' ? null : <Ink key={index} stroke={stroke} />
      )}
    </InkArtwork>
  );
}
