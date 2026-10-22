import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ beforeImport: vi.fn() }));
vi.mock('../../src/lazyExport.ts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createLazyExport: (load) => actual.createLazyExport(() => fixture.beforeImport().then(load)),
  };
});
vi.mock('../../src/drawing/PageArtMotion.tsx', () => ({
  PageArtMotion: () => null,
}));
vi.mock('../../src/drawing/pageArtSelection.ts', () => ({
  prepareColoringPage: async () => {},
}));
vi.mock('../../src/drawing/PictureCapture.tsx', () => ({
  PictureCapture: () => null,
}));
vi.mock('../../src/rsdDrawing/RsdClearUnderlay.tsx', () => ({
  RsdClearUnderlay: () => null,
}));
vi.mock('../../src/drawing/FixedInkCapture.tsx', () => ({
  FixedInkCapture: () => null,
}));
import { pageArt } from '../../src/drawing/pageArtResource.web.ts';

it('shares the web Page Art resource and retries its real chunk wiring after rejection', async () => {
  const failed = new Error('Page Art chunk unavailable.');
  fixture.beforeImport.mockRejectedValueOnce(failed).mockResolvedValue(undefined);
  const resource = pageArt();
  expect(pageArt()).toBe(resource);
  expect(resource.current()).toBeUndefined();
  expect(fixture.beforeImport).not.toHaveBeenCalled();
  const first = resource.load();
  expect(resource.load()).toBe(first);
  await expect(first).rejects.toBe(failed);
  expect(resource.current()).toBeUndefined();
  const retry = resource.load();
  const chunk = await retry;
  expect(typeof chunk.PageArtMotion).toBe('function');
  expect(typeof chunk.prepareColoringPage).toBe('function');
  expect(resource.current()).toBe(chunk);
  expect(resource.load()).toBe(retry);
  expect(fixture.beforeImport).toHaveBeenCalledTimes(2);
});
