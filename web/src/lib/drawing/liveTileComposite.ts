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
  // A tile's own backing lags the grid it belongs to: the renderer migrates a
  // hidden tile's backing a frame at a time, so until its turn comes a hidden
  // tile still reports the size it last held — the 300×150 canvas default
  // before the first migration. Measuring a row or column of all-hidden tiles
  // off those backings sizes it wrong and shifts every later row or column, so
  // the composite maps paper coordinates onto the wrong pixels. Read the size
  // the renderer publishes instead: `resizeTiledRenderer` writes it for every
  // tile in the same pass that hides them, so it leads the backings rather than
  // lagging them. Markup assembled without it falls back to the backings.
  // This body is serialized into the page, so neither the attribute name nor
  // its units (backing pixels, never CSS) can be shared with the writer —
  // `tiledRendererContract.test.ts` fails when the two sides drift apart.
  const declaredSpan = (tile: HTMLCanvasElement, dimension: 'width' | 'height') => {
    const [width, height] = (tile.dataset.tileBacking ?? '').split('x').map(Number);
    return dimension === 'width' ? width : height;
  };
  const currentBackingSpan = (alignedTiles: HTMLCanvasElement[], dimension: 'width' | 'height') => {
    const declared = alignedTiles
      .map((tile) => declaredSpan(tile, dimension))
      .filter((span) => span > 0);
    const spans = declared.length > 0 ? declared : alignedTiles.map((tile) => tile[dimension]);
    return Math.max(...spans);
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
