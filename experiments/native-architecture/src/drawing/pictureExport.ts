import { MAX_PNG_PIXELS } from './pngLimits';
import {
  paperBounds,
  paperSize,
  type PaperReference,
  type PaperSize,
  type PaperBounds,
  type PaperProjection,
} from './paperSpace';
import { PAPER_THEMES, type PaperTheme } from './theme';

// The saved picture is the shipping export (web/src/lib/drawing/exportScale.ts): never below 2x,
// so a 1x screen still saves crisp grain and line art. native-picture-export.test.mjs holds
// this module to the shipping export's scale, size, paper colors and grain.
const MIN_EXPORT_SCALE = 2;

// A saved picture's pixel grid, its CSS-to-pixel scale (the grain tile's too), and its paper.
export type PictureExport = Readonly<{ size: PaperSize; scale: number; paper: string }>;

function exportScale(pixelRatio: number): number {
  return Math.max(pixelRatio || 1, MIN_EXPORT_SCALE);
}

// Shipping snapshots the paper's backing pixels, rounded at its backing scale, back into CSS
// pixels at the export scale (engine.ts snapshotStrokes).
function exportLength(cssLength: number, backingScale: number, scale: number): number {
  return Math.round((Math.round(cssLength * backingScale) / backingScale) * scale);
}

// A paper with no adopted CSS size (a version-5 picture's canonical sheet) has one CSS pixel per
// unit, the scale its ink widths are drawn at.
function exportSize(paper: PaperReference, scale: number, extent?: PaperSize): PaperSize {
  if (paper.kind === 'adopted')
    return {
      width: exportLength(extent?.width ?? paper.cssWidth, paper.backingScale, scale),
      height: exportLength(extent?.height ?? paper.cssHeight, paper.backingScale, scale),
    };
  const units = paperSize(paper);
  return { width: Math.round(units.width * scale), height: Math.round(units.height * scale) };
}

export function pictureExport(
  paper: PaperReference,
  theme: PaperTheme,
  pixelRatio: number,
  extent?: PaperSize
): PictureExport {
  const scale = exportScale(pixelRatio);
  return { size: exportSize(paper, scale, extent), scale, paper: PAPER_THEMES[theme].paper };
}

export function boundedRasterSize(size: PaperSize, nativeScale = 1): PaperSize {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const scale = Math.min(1, Math.sqrt(MAX_PNG_PIXELS / (width * height)) / nativeScale);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function paperRasterSize(
  { paper, extent }: PaperProjection,
  rasterScale = paper.kind === 'adopted' ? paper.backingScale : 1,
  nativeScale = 1
): PaperSize {
  const size = paper.kind === 'adopted' ? extent : paperSize(paper);
  const scale = paper.kind === 'adopted' ? rasterScale : 1;
  return boundedRasterSize({ width: size.width * scale, height: size.height * scale }, nativeScale);
}

// A rounded capture grid contain-fits the semantic bounds. Its inverse includes the padding,
// so replaying the PNG cannot rescale old ink differently on the two axes.
export function paperRasterBounds(projection: PaperProjection, raster: PaperSize): PaperBounds {
  const bounds = paperBounds(projection);
  const scale = Math.min(raster.width / bounds.width, raster.height / bounds.height);
  const width = raster.width / scale;
  const height = raster.height / scale;
  return {
    x: bounds.x - (width - bounds.width) / 2,
    y: bounds.y - (height - bounds.height) / 2,
    width,
    height,
  };
}
