// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAiPreviewLoader } from './aiPreview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('revokes a style preview that finishes after its owner is invalidated', async () => {
  const pendingExport = deferred<Blob | null>();
  const commit = vi.fn();
  const loader = createAiPreviewLoader(() => pendingExport.promise, commit);

  const load = loader.load();
  loader.invalidate();
  pendingExport.resolve(new Blob(['drawing']));
  await load;

  expect(commit).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late-preview');
});
