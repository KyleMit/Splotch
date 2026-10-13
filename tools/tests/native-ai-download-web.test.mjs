// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rgbaPng } from './native-png-fixtures.mjs';
const storage = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../experiments/native-architecture/src/platform/aiStorage.web.ts', () => ({
  readAiPictureBytes: storage.read,
}));
import {
  shareAiPicture,
  aiPictureSharePresentation,
} from '../../experiments/native-architecture/src/platform/aiShare.web.ts';
const bytes = rgbaPng(2, 2, 255);
const picture = { uri: `data:image/png;base64,${bytes.toString('base64')}`, mime: 'image/png' };
let clicks;
beforeEach(() => {
  clicks = [];
  storage.read.mockReset().mockResolvedValue(bytes);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicks.push({ href: this.href, name: this.download, attached: this.isConnected });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  expect(document.querySelector('a')).toBeNull();
});
it('requests a saved image download with its owned MIME filename and truthful completion copy', async () => {
  await shareAiPicture(picture, () => true);
  expect(storage.read).toHaveBeenCalledExactlyOnceWith(picture);
  expect(clicks).toEqual([
    { href: picture.uri, name: expect.stringMatching(/^splotch-ai-\d+\.png$/), attached: true },
  ]);
  expect(aiPictureSharePresentation).toEqual({
    label: 'Download AI picture',
    complete: 'Download requested. Your AI picture stays saved here.',
  });
});
it('does not create a download when the store rejects missing, corrupt or unowned bytes', async () => {
  storage.read.mockRejectedValue(new Error('unowned'));
  await expect(shareAiPicture(picture, () => true)).rejects.toThrow('unowned');
  expect(clicks).toEqual([]);
});
it('rejects a remote URL even if a broken storage adapter returns bytes', async () => {
  await expect(
    shareAiPicture({ ...picture, uri: 'https://example.com/picture.png' }, () => true)
  ).rejects.toThrow('Reopen');
  expect(clicks).toEqual([]);
});
it('checks authorization and selected-picture ownership again after storage readback', async () => {
  let current = true;
  storage.read.mockImplementation(async () => {
    current = false;
    return bytes;
  });
  await expect(shareAiPicture(picture, () => current)).rejects.toThrow('cancelled');
  expect(clicks).toEqual([]);
  await expect(shareAiPicture(picture, () => false)).rejects.toThrow('cancelled');
  expect(storage.read).toHaveBeenCalledOnce();
});
it('holds one delivery lease and releases it after a failed read so an explicit retry can work', async () => {
  let fail;
  storage.read.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  const first = shareAiPicture(picture, () => true).catch((error) => error.message);
  await expect(shareAiPicture(picture, () => true)).rejects.toThrow('Another');
  fail(new Error('unconfirmed'));
  expect(await first).toBe('unconfirmed');
  await shareAiPicture(picture, () => true);
  expect(clicks).toHaveLength(1);
});
