// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAiPreviewLoader } from './aiPreview';

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
