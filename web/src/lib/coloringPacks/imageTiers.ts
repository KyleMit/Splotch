export const RESPONSIVE_COLORING_TIERS = {
  overlay: {
    directory: 'max-1152px',
    maxEdgePx: 1152,
    widths: {
      portrait: { candidate: 768, source: 1024 },
      landscape: { candidate: 1152, source: 1536 },
    },
  },
  thumbnail: {
    directory: 'max-240px',
    maxEdgePx: 240,
    widths: {
      cover: { candidate: 240, source: 400 },
      selector: { portrait: 160, landscape: 240 },
    },
  },
} as const;
export const COMPACT_COLORING_PACK_MAX_EDGE_PX = RESPONSIVE_COLORING_TIERS.overlay.maxEdgePx;
export const COMPACT_COLORING_PACK_SHORT_EDGE_PX =
  RESPONSIVE_COLORING_TIERS.overlay.widths.portrait.candidate;
