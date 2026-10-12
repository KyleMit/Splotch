import {
  COMPACT_COLORING_PACK_MAX_EDGE_PX,
  COMPACT_COLORING_PACK_SHORT_EDGE_PX,
} from '../state/books.ts';

export const COLORING_PACK_RESOLUTIONS = ['compact', 'full'] as const;
export type ColoringPackResolution = (typeof COLORING_PACK_RESOLUTIONS)[number];

interface ColoringPackScreen {
  widthCssPx: number;
  heightCssPx: number;
  devicePixelRatio: number;
}

const COLORING_PAGE_LONG_TO_SHORT_RATIO =
  COMPACT_COLORING_PACK_MAX_EDGE_PX / COMPACT_COLORING_PACK_SHORT_EDGE_PX;

export function coloringPackResolutionForScreen({
  widthCssPx,
  heightCssPx,
  devicePixelRatio,
}: ColoringPackScreen): ColoringPackResolution {
  if (
    !Number.isFinite(widthCssPx) ||
    !Number.isFinite(heightCssPx) ||
    !Number.isFinite(devicePixelRatio) ||
    widthCssPx <= 0 ||
    heightCssPx <= 0 ||
    devicePixelRatio <= 0
  ) {
    return 'full';
  }
  const shortEdgeCssPx = Math.min(widthCssPx, heightCssPx);
  const longEdgeCssPx = Math.max(widthCssPx, heightCssPx);
  const paperLongEdgeCssPx = Math.min(
    longEdgeCssPx,
    shortEdgeCssPx * COLORING_PAGE_LONG_TO_SHORT_RATIO
  );
  const requiredLongEdgePx = paperLongEdgeCssPx * devicePixelRatio;
  return requiredLongEdgePx <= COMPACT_COLORING_PACK_MAX_EDGE_PX ? 'compact' : 'full';
}

export function currentColoringPackResolution(): ColoringPackResolution {
  return coloringPackResolutionForScreen({
    widthCssPx: window.screen.width,
    heightCssPx: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
  });
}
