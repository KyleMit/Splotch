import { createContext, useContext } from 'react';
import Svg, { Ellipse, Image, Path, Rect } from 'react-native-svg';
import { BUNDLED_BOOK_ART, type BundledPageArt } from './bundledBookAssets';
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
  const art: BundledPageArt = BUNDLED_BOOK_ART[pageId][theme];
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

export function BundledMagicFill({
  pageId,
  theme,
  size,
}: {
  pageId: FarmPageId;
  theme: PaperTheme;
  size: PaperSize;
}) {
  const onLoad = useContext(BundledFillLoadScope);
  return (
    <Image
      href={BUNDLED_BOOK_ART[pageId][theme].fill}
      x={0}
      y={0}
      width={size.width}
      height={size.height}
      preserveAspectRatio={BUNDLED_ART_FIT}
      onLoad={() => onLoad?.()}
    />
  );
}
