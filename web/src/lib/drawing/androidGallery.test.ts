// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_IMAGE_BASENAME, DRAWING_BASENAME, extensionForImageType } from '$lib/saveNaming';
import {
  ANDROID_GALLERY_CHUNK_CHARS,
  ANDROID_GALLERY_IMAGE_TYPES,
  saveToAndroidGallery,
} from './androidGallery';

const plugin = vi.hoisted(() => ({
  beginImage: vi.fn(),
  appendImageData: vi.fn(),
  discardImage: vi.fn(),
  saveImage: vi.fn(),
}));
const { saveImage } = plugin;
vi.mock('$lib/plugins/photoLibrary', () => ({ PhotoLibrary: plugin }));

const UPLOAD_ID = 'upload-1';

function appendedData(): string {
  return plugin.appendImageData.mock.calls.map(([options]) => options.data).join('');
}

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const pluginSource = sourceFile(
  '../../../../android/app/src/main/java/art/splotch/app/PhotoLibraryPlugin.java'
);

beforeEach(() => {
  for (const method of Object.values(plugin)) method.mockReset();
  plugin.beginImage.mockResolvedValue({ uploadId: UPLOAD_ID });
  plugin.appendImageData.mockResolvedValue(undefined);
  plugin.discardImage.mockResolvedValue(undefined);
  saveImage.mockResolvedValue(undefined);
});

describe('saveToAndroidGallery', () => {
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ])('sends %s bytes with a matching .%s display name', async (type, extension) => {
    await saveToAndroidGallery(`data:${type};base64,QUJD`, type, DRAWING_BASENAME);

    expect(appendedData()).toBe('QUJD');
    expect(saveImage).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      mimeType: type,
      displayName: expect.stringMatching(
        new RegExp(`^splotch-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.${extension}$`)
      ),
    });
  });

  it('sends a large image as bounded slices, in order, before saving the upload', async () => {
    const data = 'QUJD'.repeat((ANDROID_GALLERY_CHUNK_CHARS * 2.5) / 4);
    await saveToAndroidGallery(`data:image/png;base64,${data}`, 'image/png', DRAWING_BASENAME);

    const slices = plugin.appendImageData.mock.calls.map(([options]) => options);
    expect(slices).toHaveLength(3);
    for (const slice of slices) {
      expect(slice.uploadId).toBe(UPLOAD_ID);
      expect(slice.data.length).toBeLessThanOrEqual(ANDROID_GALLERY_CHUNK_CHARS);
    }
    expect(appendedData()).toBe(data);
    expect(plugin.beginImage.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.appendImageData.mock.invocationCallOrder[0]
    );
    expect(saveImage.mock.invocationCallOrder[0]).toBeGreaterThan(
      plugin.appendImageData.mock.invocationCallOrder.at(-1)!
    );
  });

  it('slices on base64 quantum boundaries', () => {
    expect(ANDROID_GALLERY_CHUNK_CHARS % 4).toBe(0);
  });

  it('discards, and does not save, an upload whose slice the plugin refused', async () => {
    const failure = new Error('appendImageData needs a begun uploadId and data');
    plugin.appendImageData.mockRejectedValue(failure);

    await expect(
      saveToAndroidGallery('data:image/png;base64,QUJD', 'image/png', 'splotch')
    ).rejects.toBe(failure);
    expect(plugin.discardImage).toHaveBeenCalledWith({ uploadId: UPLOAD_ID });
    expect(saveImage).not.toHaveBeenCalled();
  });

  it('reports the append failure even when the discard also fails', async () => {
    const failure = new Error('appendImageData needs a begun uploadId and data');
    plugin.appendImageData.mockRejectedValue(failure);
    plugin.discardImage.mockRejectedValue(new Error('bridge gone'));

    await expect(
      saveToAndroidGallery('data:image/png;base64,QUJD', 'image/png', 'splotch')
    ).rejects.toBe(failure);
  });

  it('leaves a completed upload to saveImage rather than discarding it', async () => {
    await saveToAndroidGallery('data:image/png;base64,QUJD', 'image/png', 'splotch');

    expect(plugin.discardImage).not.toHaveBeenCalled();
  });

  it('reads the MIME essence from a type that carries parameters', async () => {
    await saveToAndroidGallery('data:image/webp;base64,QUJD', ' Image/WebP ; q=1', 'splotch-ai');

    expect(saveImage).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/webp' }));
  });

  it.each(['', 'image/gif', 'application/octet-stream'])(
    'rejects the unsupported type "%s" without reaching the plugin',
    async (type) => {
      await expect(saveToAndroidGallery('data:;base64,QUJD', type, 'splotch')).rejects.toThrow(
        'photo library cannot store'
      );
      expect(plugin.beginImage).not.toHaveBeenCalled();
      expect(saveImage).not.toHaveBeenCalled();
    }
  );

  it('rejects when the native save rejects', async () => {
    const failure = new Error('Saving the image to the photo library failed');
    saveImage.mockRejectedValue(failure);

    await expect(
      saveToAndroidGallery('data:image/png;base64,QUJD', 'image/png', 'splotch')
    ).rejects.toBe(failure);
  });
});

// PhotoLibraryPlugin.java validates what this module sends, and Java cannot import the TS
// vocabulary, so both sides are read here and must agree.
describe('PhotoLibraryPlugin.java contract', () => {
  it('declares every method the TS side calls', () => {
    const javaMethods = [
      ...pluginSource.matchAll(/@PluginMethod\s+public void (\w+)\(PluginCall call\)/g),
    ].map(([, name]) => name);

    expect(javaMethods.sort()).toEqual(Object.keys(plugin).sort());
  });

  it('accepts exactly the TS image types, each with the TS file extension', () => {
    const javaExtensions = Object.fromEntries(
      [...pluginSource.matchAll(/case "(image\/[a-z]+)":\s*return "([a-z]+)";/g)].map(
        ([, type, extension]) => [type, extension]
      )
    );

    expect(javaExtensions).toEqual(
      Object.fromEntries(
        ANDROID_GALLERY_IMAGE_TYPES.map((type) => [type, extensionForImageType(type)])
      )
    );
  });

  it('accepts the display names the TS side generates', async () => {
    const pattern = pluginSource.match(/displayName\.matches\("([^"]+)" \+ extension\)/)?.[1];
    expect(pattern, 'PhotoLibraryPlugin validates displayName with a pattern').toBeDefined();
    const javaPattern = pattern!.replaceAll('\\\\', '\\');

    for (const baseName of [DRAWING_BASENAME, AI_IMAGE_BASENAME]) {
      for (const type of ANDROID_GALLERY_IMAGE_TYPES) {
        saveImage.mockClear();
        await saveToAndroidGallery(`data:${type};base64,QUJD`, type, baseName);
        const { displayName } = saveImage.mock.calls[0][0];
        expect(displayName).toMatch(new RegExp(`^${javaPattern}${extensionForImageType(type)}$`));
      }
    }
  });
});
