import { useId, useMemo } from 'react';
import { Defs, G, LinearGradient, Path, Pattern, Stop } from 'react-native-svg';
import { paletteHex } from './palette';
import { BRUSHES, rainbow, rainbowLine } from './brushes';
import {
  CRAYON_BANDS,
  CRAYON_TILE_PX,
  crayonPasses,
  crayonPhase,
  crayonTexture,
  waxColor,
} from './crayon';
import { CrayonGlaze } from './CrayonGlaze';
import { StrokeShape } from './StrokeShape';
import { PAPER_HEIGHT, PAPER_WIDTH, type PaintStroke, type Stroke } from './model';

const CRAYON_TEXTURES = CRAYON_BANDS.map((band) => crayonTexture(band.coverage));
// Native painters clip translated content to a fixed tile; wrapping preserves the seeded phase.
const CRAYON_TILE_OFFSETS = [0, -CRAYON_TILE_PX];

function CrayonInk({ stroke }: { stroke: Extract<Stroke, { brush: 'crayon' }> }) {
  const id = useId();
  const width = BRUSHES.crayon.width;
  const passes = useMemo(() => crayonPasses(stroke, width), [stroke, width]);
  const color = paletteHex(stroke.color);
  return (
    <G>
      {passes.map((pass, index) => {
        const phase = crayonPhase(pass.seed);
        return (
          <G key={pass.seed}>
            <Defs>
              {CRAYON_BANDS.map((band, bandIndex) => (
                <Pattern
                  key={bandIndex}
                  id={`${id}-${index}-${bandIndex}`}
                  patternUnits="userSpaceOnUse"
                  width={CRAYON_TILE_PX}
                  height={CRAYON_TILE_PX}
                  patternContentUnits="userSpaceOnUse"
                >
                  {CRAYON_TILE_OFFSETS.flatMap((x) =>
                    CRAYON_TILE_OFFSETS.map((y) => (
                      <G key={`${x},${y}`} transform={`translate(${phase.x + x} ${phase.y + y})`}>
                        {CRAYON_TEXTURES[bandIndex].map((path, shade) => (
                          <Path key={shade} d={path} fill={waxColor(color, shade)} />
                        ))}
                      </G>
                    ))
                  )}
                </Pattern>
              ))}
            </Defs>
            <CrayonGlaze>
              {CRAYON_BANDS.map((band, bandIndex) => (
                <StrokeShape
                  key={bandIndex}
                  points={pass.points}
                  width={width * band.widthScale}
                  paint={`url(#${id}-${index}-${bandIndex})`}
                />
              ))}
            </CrayonGlaze>
          </G>
        );
      })}
    </G>
  );
}

function MagicInk({ stroke }: { stroke: Extract<Stroke, { brush: 'magic' }> }) {
  const id = useId();
  return (
    <G>
      <Defs>
        <LinearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          {...rainbowLine(stroke.rainbow, PAPER_WIDTH, PAPER_HEIGHT)}
        >
          {rainbow(stroke.rainbow).stops.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </LinearGradient>
      </Defs>
      <StrokeShape points={stroke.points} width={BRUSHES.magic.width} paint={`url(#${id})`} />
    </G>
  );
}

export function Ink({ stroke }: { stroke: PaintStroke }) {
  if (stroke.brush === 'crayon') return <CrayonInk stroke={stroke} />;
  if (stroke.brush === 'magic') return <MagicInk stroke={stroke} />;
  return (
    <StrokeShape
      points={stroke.points}
      width={BRUSHES[stroke.brush].width}
      paint={paletteHex(stroke.color)}
    />
  );
}
