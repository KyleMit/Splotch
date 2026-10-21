import { BUNDLED_FARM_IMAGES } from './bundledFarm/images';
import type { FarmPageId } from './bundledBooks';
import type { PaperTheme } from './theme';
import { artOrientation, type ArtOrientation, type PaperSize } from './paperSpace';

export type OutlineNode =
  | Readonly<{ kind: 'path'; d: string }>
  | Readonly<{ kind: 'ellipse'; rx: string; ry: string; transform?: string }>
  | Readonly<{ kind: 'circle'; cx: string; cy: string; r: string }>
  | Readonly<{
      kind: 'rect';
      x: string;
      y: string;
      width: string;
      height: string;
      rx?: string;
      ry?: string;
      transform?: string;
    }>;
export type BundledOutlineVariant = Readonly<{
  viewBox: string;
  ink: string;
  outline: readonly OutlineNode[];
}>;
export type BundledPageOutlines = Readonly<
  Record<ArtOrientation, Readonly<Record<PaperTheme, BundledOutlineVariant>>>
>;
export type BundledThemeImages = Readonly<Record<PaperTheme, string>>;
type BundledOrientedImages = Readonly<Record<ArtOrientation, BundledThemeImages>>;
export type BundledBookImages = Readonly<Record<FarmPageId, BundledOrientedImages>>;
// Each page's overlay SVGs as native asset modules (Vite's file paths in the Node tests).
export type BundledBookOutlineFiles = Readonly<
  Record<
    FarmPageId,
    Readonly<Record<ArtOrientation, Readonly<Record<PaperTheme, number | string>>>>
  >
>;

// The line art (bundledOutlines.ts) and the fills (bundledFarm/images.ts) come from the same
// shipped Farm files, wired up by tools/migration/gen-bundled-farm.mjs.
export function bundledFill(pageId: FarmPageId, theme: PaperTheme, paper: PaperSize): string {
  return BUNDLED_FARM_IMAGES[pageId][artOrientation(paper)][theme];
}

export function bundledOutline(
  outlines: BundledPageOutlines,
  theme: PaperTheme,
  paper: PaperSize
): BundledOutlineVariant {
  return outlines[artOrientation(paper)][theme];
}
