import { paperSize, type PaperReference, type PaperSize } from './paperSpace';
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
