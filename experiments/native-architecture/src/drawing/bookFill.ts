import { edgeMargins, type EdgeFill } from '../../../../web/src/lib/drawing/magicSheetEdges';
import { paperView, type PaperSize } from './paperSpace';

// The shipping sheet rounds band edges to whole sheet pixels. Semantic units are coarser than
// device pixels, so the bands are laid out on a quarter-unit grid: a band then meets the
// picture's fractional edge within an eighth of a unit instead of leaving a visible seam.
const EDGE_SUBUNITS_PER_UNIT = 4;
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

// A book page's Magic fill covers the whole paper the way the shipping magic sheet does
// (magicBrush.ts rasterizeSheet): the fill contain-fitted and centered like its line art, and
// its edge colours, sampled a hair inside, stretched through the letterbox bands
// (magicSheetEdges.ts). Edge sources are in frame units; everything else is in paper units.
export function bookFillPlacement(paper: PaperSize, frame: PaperSize): BookFillPlacement {
  const { scale, left, top } = paperView(paper.width, paper.height, frame);
  const width = frame.width * scale;
  const height = frame.height * scale;
  const grid = EDGE_SUBUNITS_PER_UNIT;
  const edges = edgeMargins(
    paper.width * grid,
    paper.height * grid,
    left * grid,
    top * grid,
    width * grid,
    height * grid,
    frame.width,
    frame.height
  ).map((edge) => ({
    ...edge,
    dx: edge.dx / grid,
    dy: edge.dy / grid,
    dw: edge.dw / grid,
    dh: edge.dh / grid,
  }));
  return { x: left, y: top, width, height, edges };
}
