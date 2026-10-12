import { useInkPaper } from './InkPaper';
import { semanticWidth, textureScale } from './paperSpace';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { OfflineMagicFill } from '../offlineLibrary/artwork';
import { createContext, useContext, useId, useMemo, type ReactNode } from 'react';
import { Defs, G, LinearGradient, Path, Pattern, Rect, Stop, Use, Image } from 'react-native-svg';
import { paintAppearance, paletteHex } from './palette';
import { BundledMagicFill } from './BundledBookArtwork';
import { isFarmPageId } from './bundledBooks';
import { COLORING_FILLS } from './pages';
import { InkAppearanceScope, useInkAppearance } from './InkAppearance';
import { rainbow, rainbowLine } from './brushes';
import { CRAYON_BANDS, CRAYON_TILE_PX, crayonPasses, crayonPhase } from './crayon';
import { crayonResourceUri } from './crayonTiles';
import { useCrayonTileResources } from './useCrayonTileReadiness';
import { CrayonGlaze } from './CrayonGlaze';
import { PAPER_HEIGHT, PAPER_WIDTH, type PaintStroke, type Stroke } from './model';
import { StrokeShape } from './StrokeShape';

const CrayonDefinitionScope = createContext<string | null>(null);
const BundledMagicPatternScope = createContext<string | null>(null);
// Native painters clip translated content to a fixed tile; wrapping preserves the seeded phase.
const CRAYON_TILE_OFFSETS = [0, -CRAYON_TILE_PX];

function CrayonInk({ stroke }: { stroke: Extract<Stroke, { brush: 'crayon' }> }) {
  const theme = useContext(InkAppearanceScope)?.theme ?? 'light';
  const paint = paintAppearance(stroke.color, theme);
  const id = `art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const paper = useInkPaper();
  const width = semanticWidth(stroke.width, paper);
  const texel = textureScale(paper);
  const passes = useMemo(() => crayonPasses(stroke, width, texel), [stroke, width, texel]);
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
                  width={CRAYON_TILE_PX * texel}
                  height={CRAYON_TILE_PX * texel}
                  patternContentUnits="userSpaceOnUse"
                >
                  <G transform={`scale(${texel})`}>
                    {CRAYON_TILE_OFFSETS.flatMap((x) =>
                      CRAYON_TILE_OFFSETS.map((y) => (
                        <G key={`${x},${y}`} transform={`translate(${phase.x + x} ${phase.y + y})`}>
                          <Use href={`#${textureId}-wax-${paint.definitionId}-${bandIndex}`} />
                        </G>
                      ))
                    )}
                  </G>
                </Pattern>
              ))}
            </Defs>
            <CrayonGlaze mode={paint.glaze}>
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
  const id = `art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { pageId, theme } = useInkAppearance();
  const width = semanticWidth(stroke.width, useInkPaper());
  const bundledPattern = useContext(BundledMagicPatternScope);
  const fill =
    pageId === 'blank' || isFarmPageId(pageId) || isOfflinePageId(pageId)
      ? null
      : COLORING_FILLS[pageId];
  if (bundledPattern) {
    return <StrokeShape points={stroke.points} width={width} paint={`url(#${bundledPattern})`} />;
  }
  return (
    <G>
      <Defs>
        {fill ? (
          <Pattern
            id={id}
            x={0}
            y={0}
            width={PAPER_WIDTH}
            height={PAPER_HEIGHT}
            patternUnits="userSpaceOnUse"
            patternContentUnits="userSpaceOnUse"
          >
            <Rect
              width={PAPER_WIDTH}
              height={PAPER_HEIGHT}
              fill={paletteHex(fill.background[theme])}
            />
            {fill.regions.map((region, index) => (
              <Path
                key={index}
                d={region.path}
                fill={paletteHex(region.colors[theme])}
                stroke="none"
              />
            ))}
          </Pattern>
        ) : (
          <LinearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            {...rainbowLine(stroke.rainbow, PAPER_WIDTH, PAPER_HEIGHT)}
          >
            {rainbow(stroke.rainbow).stops.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </LinearGradient>
        )}
      </Defs>
      <StrokeShape points={stroke.points} width={width} paint={`url(#${id})`} />
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
  const id = `art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const appearance = useContext(InkAppearanceScope);
  const tileResources = useCrayonTileResources(strokes, appearance?.theme ?? 'light');
  const bookPage =
    appearance && (isFarmPageId(appearance.pageId) || isOfflinePageId(appearance.pageId))
      ? appearance.pageId
      : null;
  const bookPattern =
    bookPage && strokes.some((stroke) => stroke.brush === 'magic') ? `${id}-book-fill` : null;
  const colors = new Map<string, string>();
  for (const stroke of strokes) {
    if (stroke.brush !== 'crayon') continue;
    const paint = paintAppearance(stroke.color, appearance?.theme ?? 'light');
    colors.set(paint.definitionId, paint.hex);
  }
  return (
    <CrayonDefinitionScope.Provider value={id}>
      <BundledMagicPatternScope.Provider value={bookPattern}>
        <Defs>
          {bookPattern && bookPage && appearance ? (
            <Pattern
              id={bookPattern}
              x={0}
              y={0}
              width={PAPER_WIDTH}
              height={PAPER_HEIGHT}
              patternUnits="userSpaceOnUse"
              patternContentUnits="userSpaceOnUse"
            >
              {isOfflinePageId(bookPage) ? (
                <OfflineMagicFill pageId={bookPage} theme={appearance.theme} />
              ) : (
                <BundledMagicFill pageId={bookPage} theme={appearance.theme} />
              )}
            </Pattern>
          ) : null}
          {Array.from(colors).flatMap(([colorId, hex]) =>
            CRAYON_BANDS.map((_, bandIndex) => (
              <Image
                key={`${colorId}-${bandIndex}`}
                id={`${id}-wax-${colorId}-${bandIndex}`}
                href={crayonResourceUri(tileResources, hex, bandIndex)}
                width={CRAYON_TILE_PX}
                height={CRAYON_TILE_PX}
                preserveAspectRatio="none"
              />
            ))
          )}
        </Defs>
        {children}
      </BundledMagicPatternScope.Provider>
    </CrayonDefinitionScope.Provider>
  );
}

export function Ink({ stroke }: { stroke: PaintStroke }) {
  const width = semanticWidth(stroke.width, useInkPaper());
  const theme = useContext(InkAppearanceScope)?.theme ?? 'light';
  if (stroke.brush === 'crayon') return <CrayonInk stroke={stroke} />;
  if (stroke.brush === 'magic') return <MagicInk stroke={stroke} />;
  return (
    <StrokeShape
      points={stroke.points}
      width={width}
      paint={paintAppearance(stroke.color, theme).hex}
    />
  );
}
