import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BOOKS, bookPackAssetPaths } from '../../web/src/lib/state/books.ts';
import {
  androidColoringPackName,
  PLAY_COLORING_PACK_BOOK_IDS,
} from '../lib/android-coloring-packs.mjs';
import { prepareAndroidColoringPacks } from '../prepare-android-coloring-packs.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Android Play coloring-pack configuration', () => {
  it('keeps the canary book and asset-pack name aligned across build and runtime boundaries', () => {
    expect(PLAY_COLORING_PACK_BOOK_IDS).toEqual(['dinosaur']);
    const packName = androidColoringPackName(PLAY_COLORING_PACK_BOOK_IDS[0]);
    expect(packName).toBe('coloring_dinosaur');
    expect(read('android/settings.gradle')).toContain(`include ':${packName}'`);
    expect(read('android/app/build.gradle')).toContain(`assetPacks = [":${packName}"]`);
    expect(read(`android/coloring-packs/${packName}/build.gradle`)).toContain(
      `packName = "${packName}"`
    );
    expect(
      read('android/app/src/play/java/art/splotch/app/DistributionColoringPackSource.java')
    ).toContain(`DINOSAUR_PACK_NAME = "${packName}"`);

    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts['android:bundle']).toContain('-PsplotchPlayAssetDelivery=true');
    expect(packageJson.scripts['android:bundle:generic']).not.toContain(
      '-PsplotchPlayAssetDelivery=true'
    );
  });

  it('copies exactly the catalog assets into the generated asset-pack tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-android-pack-'));
    temporaryDirectories.push(root);
    const dinosaur = BOOKS.find((book) => book.id === 'dinosaur');
    expect(dinosaur).toBeDefined();
    const logicalPaths = bookPackAssetPaths(dinosaur);
    const stale = join(
      root,
      'android',
      'coloring-packs',
      'coloring_dinosaur',
      'src',
      'main',
      'assets',
      'stale.webp'
    );
    mkdirSync(dirname(stale), { recursive: true });
    writeFileSync(stale, 'stale');

    for (const logicalPath of logicalPaths) {
      const source = join(root, 'web', 'static', logicalPath);
      mkdirSync(dirname(source), { recursive: true });
      writeFileSync(source, logicalPath);
    }

    prepareAndroidColoringPacks({ root, books: [dinosaur] });
    expect(existsSync(stale)).toBe(false);

    const assetRoot = join(
      root,
      'android',
      'coloring-packs',
      'coloring_dinosaur',
      'src',
      'main',
      'assets'
    );
    for (const logicalPath of logicalPaths) {
      expect(readFileSync(join(assetRoot, logicalPath), 'utf8')).toBe(logicalPath);
    }
  });
});
