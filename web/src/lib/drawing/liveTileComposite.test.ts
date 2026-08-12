import { afterEach, describe, expect, it, vi } from 'vitest';
import { compositeVisibleLiveTiles } from './liveTileComposite';

afterEach(() => {
  vi.restoreAllMocks();
});

function appendTile(
  root: HTMLElement,
  geometry: {
    left: number;
    top: number;
    width: number;
    height: number;
    hidden?: boolean;
    declared?: { width: number; height: number };
  }
) {
  const tile = document.createElement('canvas');
  tile.dataset.liveTile = '';
  tile.style.left = `${geometry.left}px`;
  tile.style.top = `${geometry.top}px`;
  tile.width = geometry.width;
  tile.height = geometry.height;
  tile.hidden = geometry.hidden ?? false;
  if (geometry.declared) {
    tile.dataset.tileBacking = `${geometry.declared.width}x${geometry.declared.height}`;
  }
  root.append(tile);
  return tile;
}

describe('compositeVisibleLiveTiles', () => {
  // Markup the renderer did not size — every fixture here, and anything else
  // assembling tiles by hand — carries no published span to read, so the grid
  // comes from the backings themselves.
  it('falls back to the backings when no tile publishes a size', () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    const root = document.createElement('div');
    const topLeft = appendTile(root, { left: 0, top: 0, width: 40, height: 30, hidden: true });
    appendTile(root, { left: 40, top: 0, width: 60, height: 30 });
    appendTile(root, { left: 0, top: 30, width: 40, height: 70 });
    const bottomRight = appendTile(root, { left: 40, top: 30, width: 60, height: 70 });

    const rendered = compositeVisibleLiveTiles(root);

    expect(rendered.width).toBe(100);
    expect(rendered.height).toBe(100);
    expect(drawImage).not.toHaveBeenCalledWith(topLeft, expect.anything(), expect.anything());
    expect(drawImage).toHaveBeenCalledWith(bottomRight, 40, 30);
  });

  // The row a stroke misses stays hidden, so no visible tile carries its true
  // height — and until the deferred migration reaches it, each of its tiles
  // still reports the 300×150 canvas default. Sizing that row off those
  // backings pushes every later row down and reads the composite off the ink
  // (issue #966).
  it('sizes a row of all-hidden tiles from the backing the renderer published', () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    const root = document.createElement('div');
    const declared = { width: 50, height: 50 };
    appendTile(root, { left: 0, top: 0, width: 300, height: 150, hidden: true, declared });
    appendTile(root, { left: 50, top: 0, width: 300, height: 150, hidden: true, declared });
    const bottomLeft = appendTile(root, { left: 0, top: 50, width: 50, height: 50, declared });
    const bottomRight = appendTile(root, { left: 50, top: 50, width: 50, height: 50, declared });

    const rendered = compositeVisibleLiveTiles(root);

    expect(rendered.width).toBe(100);
    expect(rendered.height).toBe(100);
    expect(drawImage).toHaveBeenCalledWith(bottomLeft, 0, 50);
    expect(drawImage).toHaveBeenCalledWith(bottomRight, 50, 50);
  });
});
