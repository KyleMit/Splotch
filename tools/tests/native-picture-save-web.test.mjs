// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pictureSave } from '../../experiments/native-architecture/src/platform/pictureSave.web.ts';
import {
  DRAWING_BASENAME,
  pictureFilename,
} from '../../experiments/native-architecture/src/export/pictureFilename.ts';
import { keepPicture } from '../../experiments/native-architecture/src/keepPicture.ts';
import { DRAWING_BASENAME as SHIPPING_BASENAME } from '../../web/src/lib/saveNaming.ts';
import { timestamp } from '../../web/src/lib/savedFile.ts';
import { saveFailureCopy } from '../../web/src/lib/drawing/saveFailureCopy.ts';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// The web export resolves platform/pictureSave to its .web sibling.
vi.mock(
  '../../experiments/native-architecture/src/platform/pictureSave.ts',
  () => import('../../experiments/native-architecture/src/platform/pictureSave.web.ts')
);

const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG = btoa(String.fromCharCode(...PNG_BYTES));
const SAVED_AT = new Date(2026, 9, 13, 9, 5, 7);

let downloads;
let blobs;
let revoked;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAVED_AT);
  downloads = [];
  blobs = [];
  revoked = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob);
    return `blob:picture-${blobs.length}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revoked.push(url));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloads.push({
      href: this.href,
      download: this.download,
      attached: document.body.contains(this),
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function surface(png) {
  return { capturePng: vi.fn(async () => png) };
}

describe('saving a picture on the web', () => {
  it('downloads the PNG under the shipping file name, then lets the object URL go', async () => {
    expect(await pictureSave.save(PNG)).toBe('downloads');
    expect(downloads).toEqual([
      { href: 'blob:picture-1', download: 'splotch-2026-10-13_09-05-07.png', attached: true },
    ]);
    expect(blobs[0].type).toBe('image/png');
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual(PNG_BYTES);
    expect(revoked).toEqual(['blob:picture-1']);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('names the file the way the shipping save does', () => {
    expect(DRAWING_BASENAME).toBe(SHIPPING_BASENAME);
    expect(pictureFilename(new Date())).toBe(`${SHIPPING_BASENAME}-${timestamp()}.png`);
  });

  it('keeps a picture by downloading it, with no failure for the banner', async () => {
    const paper = surface(PNG);
    expect(await keepPicture({ strokes: [] }, paper)).toEqual({
      notice: 'Picture downloaded.',
      failure: null,
    });
    expect(downloads).toHaveLength(1);
  });

  it('hands a download that could not start to the banner in the shipping words', async () => {
    URL.createObjectURL.mockImplementation(() => {
      throw new Error('blocked');
    });
    const kept = await keepPicture({ strokes: [] }, surface(PNG));
    expect(kept.failure).toEqual(saveFailureCopy('failed', 1, 'web'));
    expect(downloads).toEqual([]);
  });

  it('reports a capture that produced nothing as a failed save, not an error', async () => {
    const kept = await keepPicture({ strokes: [] }, surface(undefined));
    expect(kept.failure).toEqual(saveFailureCopy('failed', 1, 'web'));
    const thrown = { capturePng: vi.fn(async () => Promise.reject(new Error('lost'))) };
    expect((await keepPicture({ strokes: [] }, thrown)).failure).toEqual(
      saveFailureCopy('failed', 1, 'web')
    );
    expect(downloads).toEqual([]);
  });
});
