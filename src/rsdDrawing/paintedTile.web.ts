// The web greys a tile through its own CSS filter, so nothing is painted into the tile's colors.
export function paintedTile(_filter: string | undefined, { paper }: { paper: string }) {
  return { filter: undefined, badge: null, ring: paper };
}
