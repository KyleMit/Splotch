import { edgeMargins, type EdgeFill } from '../../../../web/src/lib/drawing/magicSheetEdges';
import { paperView, type PaperSize } from './paperSpace';

// Each band reaches this far under the picture, which paints over it. A band that only met the
// picture's fractional edge would leave both antialiased edges compositing over the paper as a
// translucent seam, and the shipping sheet rounds band edges to whole sheet pixels, which can
// leave the band short of that edge by half a unit.
const BAND_UNDERLAP_UNITS = 2;
const VIEW_BOX = /^0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/;
const SVG_VIEW_BOX = /<svg [^>]*viewBox="([^"]+)"/;

export type BookFillPlacement = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  edges: readonly EdgeFill[];
}>;

export function viewBoxFrame(viewBox: string): PaperSize {
  const match = VIEW_BOX.exec(viewBox);
  if (!match) throw new Error('The coloring artwork has an unexpected frame.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function svgFrame(svg: string): PaperSize {
  const match = SVG_VIEW_BOX.exec(svg);
  if (!match) throw new Error('The coloring artwork has an unexpected frame.');
  return viewBoxFrame(match[1]);
}

// Extends a band lying before or after the picture on one axis under it; a band spanning the
// picture on that axis keeps its extent, so its strip still maps onto the picture's edge.
function underlap(
  start: number,
  extent: number,
  boxStart: number,
  boxExtent: number
): readonly [number, number] {
  const center = start + extent / 2;
  if (center < boxStart) return [start, extent + BAND_UNDERLAP_UNITS];
  if (center > boxStart + boxExtent)
    return [start - BAND_UNDERLAP_UNITS, extent + BAND_UNDERLAP_UNITS];
  return [start, extent];
}

// A book page's Magic fill covers the whole paper the way the shipping magic sheet does
// (magicBrush.ts rasterizeSheet): the fill contain-fitted and centered like its line art, and
// its edge colours, sampled a hair inside, stretched through the letterbox bands
// (magicSheetEdges.ts). Painters draw the edges first and the picture over them. Edge sources
// are in frame units; everything else is in paper units.
export function bookFillPlacement(paper: PaperSize, frame: PaperSize): BookFillPlacement {
  const { scale, left, top } = paperView(paper.width, paper.height, frame);
  const width = frame.width * scale;
  const height = frame.height * scale;
  const edges = edgeMargins(
    paper.width,
    paper.height,
    left,
    top,
    width,
    height,
    frame.width,
    frame.height
  ).map((edge) => {
    const [dx, dw] = underlap(edge.dx, edge.dw, left, width);
    const [dy, dh] = underlap(edge.dy, edge.dh, top, height);
    return { ...edge, dx, dy, dw, dh };
  });
  return { x: left, y: top, width, height, edges };
}
