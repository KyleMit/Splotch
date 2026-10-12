// @vitest-environment happy-dom
import { act, createElement, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCrayonTileReadiness } from '../../experiments/native-architecture/src/drawing/useCrayonTileReadiness.tsx';
const state = vi.hoisted(() => ({
  nativeImages: [],
  svgTiles: [],
  autoNativeTiles: true,
  autoSvgTiles: true,
}));
vi.mock('react-native', async () => {
  const { nativeRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  const { CRAYON_TILE_PX } =
    await import('../../experiments/native-architecture/src/drawing/crayon.ts');
  return nativeRasterSdk(state, CRAYON_TILE_PX);
});
vi.mock('react-native-svg', async () => {
  const { svgRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgRasterSdk(state);
});
let root, host, error;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  error = vi.fn();
  state.nativeImages.length = 0;
  state.svgTiles.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
it('settles duplicate texture identities and repeated decode callbacks without render updates', async () => {
  let commits = 0;
  function Tiles() {
    const tiles = useCrayonTileReadiness(['same-tile', 'same-tile'], error);
    return createElement('div', { 'data-ready': tiles.ready }, tiles.decode);
  }
  await act(async () =>
    root.render(
      createElement(Profiler, { id: 'tiles', onRender: () => commits++ }, createElement(Tiles))
    )
  );
  expect(host.querySelector('[data-ready="true"]')).not.toBeNull();
  await act(async () => {
    state.nativeImages.at(-1).onLoad();
    state.svgTiles.at(-1).onLoad();
  });
  const settled = commits;
  await act(async () => {
    state.nativeImages.at(-1).onLoad();
    state.svgTiles.at(-1).onLoad();
  });
  expect(commits).toBe(settled);
  expect(error).not.toHaveBeenCalled();
});
