// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createAiPreviewLoader } from './aiPreview';

afterEach(() => {
  vi.restoreAllMocks();
});

it('does not commit a style preview that finishes after its owner is invalidated', async () => {
  const pendingExport = Promise.withResolvers<Blob | null>();
  const commit = vi.fn();
  const loader = createAiPreviewLoader(() => pendingExport.promise, commit);

  const load = loader.load();
  loader.invalidate();
  pendingExport.resolve(new Blob(['drawing']));
  await load;

  expect(commit).not.toHaveBeenCalled();
});

it('settles a style preview whose export rejected without committing it', async () => {
  const exportError = new Error('chunk load failed');
  const commit = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const loader = createAiPreviewLoader(() => Promise.reject(exportError), commit);

  await expect(loader.load()).resolves.toBeUndefined();

  expect(commit).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith('AI preview export failed:', exportError);
});
