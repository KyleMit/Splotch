// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pictureSave } from '../../experiments/native-architecture/src/platform/pictureSave.web.ts';
import {
  AI_IMAGE_BASENAME,
  DRAWING_BASENAME,
  pictureFilename,
} from '../../experiments/native-architecture/src/export/pictureFilename.ts';
import { keepAiPicture } from '../../experiments/native-architecture/src/ai/keepAiPicture.ts';
import { keepPicture } from '../../experiments/native-architecture/src/keepPicture.ts';
import { saveFailureCopy as nativeSaveFailureCopy } from '../../experiments/native-architecture/src/export/pictureSave.ts';
import {
  AI_IMAGE_BASENAME as SHIPPING_AI_BASENAME,
  DRAWING_BASENAME as SHIPPING_BASENAME,
} from '../../web/src/lib/saveNaming.ts';
import { timestamp } from '../../web/src/lib/savedFile.ts';
import { saveFailureCopy } from '../../web/src/lib/drawing/saveFailureCopy.ts';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// The web export resolves platform/pictureSave to its .web sibling.
vi.mock(
  '../../experiments/native-architecture/src/platform/pictureSave.ts',
  () => import('../../experiments/native-architecture/src/platform/pictureSave.web.ts')
);
vi.mock(
  '../../experiments/native-architecture/src/platform/aiPictureBase64.ts',
  () => import('../../experiments/native-architecture/src/platform/aiPictureBase64.web.ts')
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
  return { exportPng: vi.fn(async () => png) };
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

  it('downloads an AI picture in its own format under the shipping AI file name', async () => {
    expect(AI_IMAGE_BASENAME).toBe(SHIPPING_AI_BASENAME);
    const format = { baseName: AI_IMAGE_BASENAME, mime: 'image/webp' };
    expect(
      await keepAiPicture({ uri: `data:image/webp;base64,${PNG}`, mime: 'image/webp' })
    ).toEqual({
      outcome: 'downloads',
      base64: PNG,
      format,
    });
    expect(downloads).toEqual([
      { href: 'blob:picture-1', download: 'splotch-ai-2026-10-13_09-05-07.webp', attached: true },
    ]);
    expect(blobs[0].type).toBe('image/webp');
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual(PNG_BYTES);
  });

  it('reports an AI picture it cannot read as a failed save with nothing to retry', async () => {
    const kept = await keepAiPicture({ uri: 'blob:elsewhere', mime: 'image/png' });
    expect(kept).toEqual({
      outcome: 'failed',
      base64: null,
      format: { baseName: AI_IMAGE_BASENAME, mime: 'image/png' },
    });
    expect(downloads).toEqual([]);
  });

  it('keeps a picture by downloading it, with the PNG it captured', async () => {
    const paper = surface(PNG);
    expect(await keepPicture({ strokes: [] }, paper)).toEqual({
      outcome: 'downloads',
      pngBase64: PNG,
    });
    expect(downloads).toHaveLength(1);
  });

  it('holds the PNG of a download that could not start, for Try again', async () => {
    URL.createObjectURL.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(await keepPicture({ strokes: [] }, surface(PNG))).toEqual({
      outcome: 'failed',
      pngBase64: PNG,
    });
    expect(downloads).toEqual([]);
  });

  it('reports a capture that produced nothing as a failed save with no picture to retry', async () => {
    expect(await keepPicture({ strokes: [] }, surface(undefined))).toEqual({
      outcome: 'failed',
      pngBase64: null,
    });
    const thrown = { exportPng: vi.fn(async () => Promise.reject(new Error('lost'))) };
    expect(await keepPicture({ strokes: [] }, thrown)).toEqual({
      outcome: 'failed',
      pngBase64: null,
    });
    expect(downloads).toEqual([]);
  });

  it('words a failed web save in the shipping banner copy, with no Settings to send a parent to', () => {
    expect(saveFailureCopy('denied', 1, 'web')).toEqual(nativeSaveFailureCopy('denied', 1, 'web'));
    expect(nativeSaveFailureCopy('denied', 1, 'web').detail).not.toContain('Settings');
  });
});
