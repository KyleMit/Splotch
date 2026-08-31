import { expect, it } from 'vitest';

import {
  createHistoryBaseTiles,
  historyBaseContextsAreLost,
  historyBaseContextsNeedRecovery,
  rebindHistoryBaseContexts,
} from './tiledSurfaces';
import { installTiledRendererTestHarness } from './tiledRendererTestHarness';

installTiledRendererTestHarness();

it('rebinds reset history-base state with each tile-local transform', () => {
  const tiles = createHistoryBaseTiles(400, 400);
  const tile = tiles[5];
  tile.ctx.lineCap = 'butt';
  tile.ctx.lineJoin = 'miter';
  tile.ctx.setTransform(1, 0, 0, 1, 0, 0);

  expect(historyBaseContextsNeedRecovery(tiles)).toBe(true);
  expect(rebindHistoryBaseContexts(tiles)).toBe(true);
  expect(tile.ctx.lineCap).toBe('round');
  expect(tile.ctx.lineJoin).toBe('round');
  expect(tile.ctx.getTransform()).toMatchObject({ e: -tile.x, f: -tile.y });
  expect(historyBaseContextsNeedRecovery(tiles)).toBe(false);
});

it('defers history-base rebinding while a context reports itself lost', () => {
  const tiles = createHistoryBaseTiles(400, 400);
  let lost = true;
  Object.assign(tiles[0].ctx, { isContextLost: () => lost });

  expect(historyBaseContextsAreLost(tiles)).toBe(true);
  lost = false;
  expect(historyBaseContextsAreLost(tiles)).toBe(false);
});
