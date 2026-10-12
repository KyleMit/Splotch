// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createAiPreviewLoader } from './aiPreview';

afterEach(() => {
  vi.restoreAllMocks();
});

it('does not settle a style preview that finishes after its owner is invalidated', async () => {
  const pendingExport = Promise.withResolvers<Blob | null>();
  const commit = vi.fn();
  const fail = vi.fn();
  const loader = createAiPreviewLoader(() => pendingExport.promise, commit, fail);

  const load = loader.load();
  loader.invalidate();
  pendingExport.resolve(new Blob(['drawing']));
  await load;

  expect(commit).not.toHaveBeenCalled();
  expect(fail).not.toHaveBeenCalled();
});

it('commits a style preview whose export succeeded', async () => {
  const drawing = new Blob(['drawing']);
  const commit = vi.fn();
  const fail = vi.fn();
  const loader = createAiPreviewLoader(async () => drawing, commit, fail);

  await loader.load();

  expect(commit).toHaveBeenCalledExactlyOnceWith(drawing);
  expect(fail).not.toHaveBeenCalled();
});

it('fails a style preview whose export rejected instead of committing it', async () => {
  const exportError = new Error('chunk load failed');
  const commit = vi.fn();
  const fail = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const loader = createAiPreviewLoader(() => Promise.reject(exportError), commit, fail);

  await expect(loader.load()).resolves.toBeUndefined();

  expect(commit).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledOnce();
  expect(console.error).toHaveBeenCalledWith('AI preview export failed:', exportError);
});

it('fails a style preview whose export produced nothing', async () => {
  const commit = vi.fn();
  const fail = vi.fn();
  const loader = createAiPreviewLoader(async () => null, commit, fail);

  await loader.load();

  expect(commit).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledOnce();
});

it('does not fail a superseded style preview whose export rejected', async () => {
  const pendingExport = Promise.withResolvers<Blob | null>();
  const fail = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const loader = createAiPreviewLoader(() => pendingExport.promise, vi.fn(), fail);

  const load = loader.load();
  loader.invalidate();
  pendingExport.reject(new Error('chunk load failed'));
  await load;

  expect(fail).not.toHaveBeenCalled();
});
