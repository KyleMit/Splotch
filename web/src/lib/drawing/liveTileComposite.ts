/**
 * Diagnostics/test seam for `/dev/engine` and Playwright pixel readers. Playwright serializes the
 * function body into the page through `evaluateHandle`, so it cannot reference module-scope values.
 */
export function compositeVisibleLiveTiles(root: ParentNode = document): HTMLCanvasElement {
  const tiles = Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]'));
  const rendered = document.createElement('canvas');
  if (tiles.length === 0) return rendered;

  const lefts = [...new Set(tiles.map((tile) => Number.parseFloat(tile.style.left)))].sort(
    (first, second) => first - second
  );
  const tops = [...new Set(tiles.map((tile) => Number.parseFloat(tile.style.top)))].sort(
    (first, second) => first - second
  );
  const currentBackingSpan = (alignedTiles: HTMLCanvasElement[], dimension: 'width' | 'height') => {
    const visibleTiles = alignedTiles.filter((tile) => !tile.hidden);
    const candidates = visibleTiles.length > 0 ? visibleTiles : alignedTiles;
    return Math.max(...candidates.map((tile) => tile[dimension]));
  };
  const columnWidths = lefts.map((left) =>
    currentBackingSpan(
      tiles.filter((tile) => Number.parseFloat(tile.style.left) === left),
      'width'
    )
  );
  const rowHeights = tops.map((top) =>
    currentBackingSpan(
      tiles.filter((tile) => Number.parseFloat(tile.style.top) === top),
      'height'
    )
  );
  const columnOffsets = columnWidths.map((_, index) =>
    columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0)
  );
  const rowOffsets = rowHeights.map((_, index) =>
    rowHeights.slice(0, index).reduce((sum, height) => sum + height, 0)
  );

  rendered.width = columnWidths.reduce((sum, width) => sum + width, 0);
  rendered.height = rowHeights.reduce((sum, height) => sum + height, 0);
  const target = rendered.getContext('2d')!;
  for (const tile of tiles) {
    if (tile.hidden) continue;
    const column = lefts.indexOf(Number.parseFloat(tile.style.left));
    const row = tops.indexOf(Number.parseFloat(tile.style.top));
    target.drawImage(tile, columnOffsets[column], rowOffsets[row]);
  }
  return rendered;
}
