import { afterEach, describe, expect, it, vi } from 'vitest';
import { compositeVisibleLiveTiles } from './liveTileComposite';

afterEach(() => {
  vi.restoreAllMocks();
});

function appendTile(
  root: HTMLElement,
  geometry: { left: number; top: number; width: number; height: number; hidden?: boolean }
) {
  const tile = document.createElement('canvas');
  tile.dataset.liveTile = '';
  tile.style.left = `${geometry.left}px`;
  tile.style.top = `${geometry.top}px`;
  tile.width = geometry.width;
  tile.height = geometry.height;
  tile.hidden = geometry.hidden ?? false;
  root.append(tile);
  return tile;
}

describe('compositeVisibleLiveTiles', () => {
  it('ignores stale hidden backings when visible tiles carry the current geometry', () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    const root = document.createElement('div');
    const staleHidden = appendTile(root, {
      left: 0,
      top: 0,
      width: 140,
      height: 130,
      hidden: true,
    });
    appendTile(root, { left: 40, top: 0, width: 60, height: 30 });
    appendTile(root, { left: 0, top: 30, width: 40, height: 70 });
    const bottomRight = appendTile(root, { left: 40, top: 30, width: 60, height: 70 });

    const rendered = compositeVisibleLiveTiles(root);

    expect(rendered.width).toBe(100);
    expect(rendered.height).toBe(100);
    expect(drawImage).not.toHaveBeenCalledWith(staleHidden, expect.anything(), expect.anything());
    expect(drawImage).toHaveBeenCalledWith(bottomRight, 40, 30);
  });
});
