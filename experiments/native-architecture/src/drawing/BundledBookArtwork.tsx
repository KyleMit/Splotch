import { createContext, useContext, useId } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Image, Path, Rect } from 'react-native-svg';
import { bundledFill, bundledOutline } from './bundledBookAssets';
import { useBundledPageOutlines } from './bundledOutlines';
import { bookFillPlacement, viewBoxFrame } from './bookFill';
import type { FarmPageId } from './bundledBooks';
import type { PaperTheme } from './theme';
import type { PaperSize } from './paperSpace';

export const BundledFillLoadScope = createContext<(() => void) | null>(null);
const BUNDLED_ART_FIT = 'xMidYMid meet';

export function BundledBookOutline({
  pageId,
  theme,
  size,
}: {
  pageId: FarmPageId;
  theme: PaperTheme;
  size: PaperSize;
}) {
  const outlines = useBundledPageOutlines(pageId);
  if (!outlines) return null;
  const art = bundledOutline(outlines, theme, size);
  return (
    <Svg
      width={size.width}
      height={size.height}
      viewBox={art.viewBox}
      preserveAspectRatio={BUNDLED_ART_FIT}
      fill={art.ink}
    >
      {art.outline.map((node, index) => {
        if (node.kind === 'path') return <Path key={index} d={node.d} />;
        if (node.kind === 'ellipse')
          return <Ellipse key={index} rx={node.rx} ry={node.ry} transform={node.transform} />;
        if (node.kind === 'circle')
          return <Circle key={index} cx={node.cx} cy={node.cy} r={node.r} />;
        return (
          <Rect
            key={index}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={node.rx}
            ry={node.ry}
            transform={node.transform}
          />
        );
      })}
    </Svg>
  );
}

// Each letterbox band painted with the fill's stretched edge strip, then the fill contain-fitted
// like its line art over the bands' underlap (bookFillPlacement).
export function BookMagicFill({
  href,
  frame,
  size,
}: {
  href: string;
  frame: PaperSize;
  size: PaperSize;
}) {
  const id = `fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const onLoad = useContext(BundledFillLoadScope);
  const placement = bookFillPlacement(size, frame);
  return (
    <G>
      {placement.edges.length > 0 ? (
        <Defs>
          {placement.edges.map((edge, index) => (
            <ClipPath key={index} id={`${id}-${index}`}>
              <Rect x={edge.dx} y={edge.dy} width={edge.dw} height={edge.dh} />
            </ClipPath>
          ))}
        </Defs>
      ) : null}
      {placement.edges.map((edge, index) => {
        const scaleX = edge.dw / edge.sw;
        const scaleY = edge.dh / edge.sh;
        return (
          <G key={index} clipPath={`url(#${id}-${index})`}>
            <Image
              href={href}
              x={edge.dx - edge.sx * scaleX}
              y={edge.dy - edge.sy * scaleY}
              width={frame.width * scaleX}
              height={frame.height * scaleY}
              preserveAspectRatio="none"
            />
          </G>
        );
      })}
      <Image
        href={href}
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        preserveAspectRatio="none"
        onLoad={() => onLoad?.()}
      />
    </G>
  );
}

export function BundledMagicFill({
  pageId,
  theme,
  size,
}: {
  pageId: FarmPageId;
  theme: PaperTheme;
  size: PaperSize;
}) {
  const outlines = useBundledPageOutlines(pageId);
  if (!outlines) return null;
  return (
    <BookMagicFill
      href={bundledFill(pageId, theme, size)}
      frame={viewBoxFrame(bundledOutline(outlines, theme, size).viewBox)}
      size={size}
    />
  );
}
