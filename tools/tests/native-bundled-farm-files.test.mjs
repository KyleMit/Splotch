import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_FARM_DIR,
  NATIVE_IMAGES_FILE,
  NATIVE_OUTLINE_FILES_FILE,
  NATIVE_PICKER_IMAGES_FILE,
  WEB_IMAGES_FILE,
  WEB_PICKER_IMAGES_FILE,
  bundledFarmImageFiles,
  bundledFarmOutlineFiles,
  imageFilePaths,
} from '../migration/gen-bundled-farm.mjs';
import { FARM_PAGE_IDS } from '../../src/drawing/bundledBooks.ts';
import { BUNDLED_FARM_IMAGES } from '../../src/drawing/bundledFarm/images.ts';
import {
  BUNDLED_FARM_COVERS,
  BUNDLED_FARM_SELECTORS,
} from '../../src/drawing/bundledFarm/pickerImages.ts';
import { BUNDLED_FARM_OUTLINE_FILES } from '../../src/drawing/bundledFarm/outlineFiles.ts';

// The native images modules resolve each import through React Native's Image, which Node cannot
// load; Vite hands them file paths, which nativeAssetUri returns without asking Image.
vi.mock('react-native', () => ({ Image: {} }));

// Vite, which runs these tests, imports a bundled file as its "/@fs"-prefixed absolute path; the
// native apps resolve the same import to the file they ship (nativeAssetUri).
const VITE_FILE_PREFIX = '/@fs';

function shippedPath(uri) {
  expect(uri.startsWith(`${VITE_FILE_PREFIX}/`)).toBe(true);
  return uri.slice(VITE_FILE_PREFIX.length);
}

const ART_VARIANTS = FARM_PAGE_IDS.flatMap((pageId) =>
  ['landscape', 'portrait'].flatMap((orientation) =>
    ['light', 'dark'].map((theme) => ({ pageId, orientation, theme }))
  )
);

// Both targets carry the Farm book as the shipped files themselves: the native apps as files in the
// app package, the web export as hashed URLs. No script inlines an image or the line art.
describe('the bundled Farm book ships as files', () => {
  it('imports the same shipped files on web and native, with no image inlined in a script', () => {
    const read = (file) => readFileSync(`${BUNDLED_FARM_DIR}${file}`, 'utf8');
    const [web, picker, nativeFills, nativePicker] = [
      WEB_IMAGES_FILE,
      WEB_PICKER_IMAGES_FILE,
      NATIVE_IMAGES_FILE,
      NATIVE_PICKER_IMAGES_FILE,
    ].map(read);
    for (const source of [web, picker, nativeFills, nativePicker])
      expect(source).not.toContain('data:image/');
    const { pages, selectors, covers } = bundledFarmImageFiles();
    const oriented = (files, images) =>
      ART_VARIANTS.map(({ pageId, orientation, theme }) => [
        files[pageId][orientation][theme],
        images[pageId][orientation][theme],
      ]);
    const slots = [
      ...oriented(pages, BUNDLED_FARM_IMAGES).map((slot) => [[web, nativeFills], ...slot]),
      ...oriented(selectors, BUNDLED_FARM_SELECTORS).map((slot) => [
        [picker, nativePicker],
        ...slot,
      ]),
      ...['light', 'dark'].map((theme) => [
        [picker, nativePicker],
        covers[theme],
        BUNDLED_FARM_COVERS[theme],
      ]),
    ];
    expect(slots).toHaveLength(FARM_PAGE_IDS.length * 8 + 2);
    for (const [modules, path, native] of slots) {
      for (const module of modules)
        expect(module).toContain(` from '${relative(BUNDLED_FARM_DIR, path)}';`);
      expect(shippedPath(native)).toBe(path);
    }
    // The paper's fills module, on the startup path, carries none of the picker's images.
    for (const path of [...Object.values(covers), ...imageFilePaths(selectors)]) {
      expect(web).not.toContain(relative(BUNDLED_FARM_DIR, path));
      expect(nativeFills).not.toContain(relative(BUNDLED_FARM_DIR, path));
    }
  });

  it('ships the native line art as the shipped overlay files, not as bundled strings', () => {
    const source = readFileSync(`${BUNDLED_FARM_DIR}${NATIVE_OUTLINE_FILES_FILE}`, 'utf8');
    const files = bundledFarmOutlineFiles();
    expect(Object.keys(BUNDLED_FARM_OUTLINE_FILES)).toEqual([...FARM_PAGE_IDS]);
    for (const { pageId, orientation, theme } of ART_VARIANTS) {
      const path = files[pageId][orientation][theme];
      expect(path).toMatch(/\.overlay\.svg$/);
      expect(source).toContain(` from '${relative(BUNDLED_FARM_DIR, path)}';`);
      expect(shippedPath(BUNDLED_FARM_OUTLINE_FILES[pageId][orientation][theme])).toBe(path);
    }
  });
});
