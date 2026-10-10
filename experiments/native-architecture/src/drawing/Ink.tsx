import { createContext, useContext, useId, useMemo, type ReactNode } from 'react';
import { Defs, G, LinearGradient, Path, Pattern, Stop, Use } from 'react-native-svg';
import { paletteHex } from './palette';
import { rainbow, rainbowLine } from './brushes';
import {
  CRAYON_BANDS,
  CRAYON_TILE_PX,
  crayonPasses,
  crayonPhase,
  crayonTexture,
  waxColor,
} from './crayon';
import { CrayonGlaze } from './CrayonGlaze';
import { PAPER_HEIGHT, PAPER_WIDTH, type PaintStroke, type Stroke } from './model';
import { StrokeShape } from './StrokeShape';

const CRAYON_TEXTURES = CRAYON_BANDS.map((band) =>
  crayonTexture(band.coverage)
    .map((path, shade) => ({ path, shade }))
    .filter(({ path }) => path.length > 0)
);
const CrayonDefinitionScope = createContext<string | null>(null);
// Native painters clip translated content to a fixed tile; wrapping preserves the seeded phase.
const CRAYON_TILE_OFFSETS = [0, -CRAYON_TILE_PX];

function CrayonInk({ stroke }: { stroke: Extract<Stroke, { brush: 'crayon' }> }) {
  const id = useId();
  const width = stroke.width;
  const passes = useMemo(() => crayonPasses(stroke, width), [stroke, width]);
  const textureId = useContext(CrayonDefinitionScope);
  if (textureId === null) throw new Error('Crayon Ink requires an InkArtwork definition scope');
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
                        {CRAYON_TEXTURES[bandIndex].map(({ shade }) => (
                          <Use
                            key={shade}
                            href={`#${textureId}-wax-${stroke.color}-${bandIndex}-${shade}`}
                          />
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
      <StrokeShape points={stroke.points} width={stroke.width} paint={`url(#${id})`} />
    </G>
  );
}

export function InkArtwork({
  strokes,
  children,
}: {
  strokes: readonly Stroke[];
  children: ReactNode;
}) {
  const id = useId();
  const colors = [
    ...new Set(strokes.flatMap((stroke) => (stroke.brush === 'crayon' ? [stroke.color] : []))),
  ];
  return (
    <CrayonDefinitionScope.Provider value={id}>
      <Defs>
        {colors.flatMap((color) =>
          CRAYON_TEXTURES.flatMap((paths, bandIndex) =>
            paths.map(({ path, shade }) => (
              <Path
                key={`${color}-${bandIndex}-${shade}`}
                id={`${id}-wax-${color}-${bandIndex}-${shade}`}
                d={path}
                fill={waxColor(paletteHex(color), shade)}
              />
            ))
          )
        )}
      </Defs>
      {children}
    </CrayonDefinitionScope.Provider>
  );
}

export function Ink({ stroke }: { stroke: PaintStroke }) {
  if (stroke.brush === 'crayon') return <CrayonInk stroke={stroke} />;
  if (stroke.brush === 'magic') return <MagicInk stroke={stroke} />;
  return (
    <StrokeShape points={stroke.points} width={stroke.width} paint={paletteHex(stroke.color)} />
  );
}
