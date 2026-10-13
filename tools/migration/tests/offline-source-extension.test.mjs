import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import {
  readOfflineSourceExtension,
  replayOfflineSourceExtension,
} from '../lib/offline-library-source-extension.mjs';
import { replayProductSourceExtension } from '../lib/native-product-source-extension.mjs';
import { aiNativeAdditionRecords } from '../lib/native-ai-source-extension.mjs';
import { sha256 } from '../lib/native-template.mjs';
import { readMaintainedNativeFiles } from '../lib/native-source-files.mjs';
import { readTemplateManifest } from '../lib/native-template.mjs';
import rsdConfig from '../rsd-drawing-vitest.config.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, 'experiments/native-architecture');
const directories = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true }))
);

it('replays every finite extension from retained baseline bytes into the actual production files', () => {
  const extension = readOfflineSourceExtension();
  expect(extension.entries).toHaveLength(8);
  for (const entry of extension.entries) {
    const baseline = entry.baseline ? Buffer.from(entry.baseline.text) : undefined;
    expect(sha256(replayOfflineSourceExtension(entry.target, baseline))).toBe(entry.sha256);
    expect(replayProductSourceExtension(entry.target, baseline)).toEqual(
      readFileSync(join(candidate, entry.target))
    );
  }
  const manifest = readTemplateManifest(root);
  expect(readMaintainedNativeFiles(candidate, manifest).size).toBe(
    48 + aiNativeAdditionRecords(manifest).length
  );
});

it.each(readOfflineSourceExtension().entries.filter((entry) => entry.baseline))(
  'rejects retained baseline drift in $target before applying the feature extension',
  (entry) => {
    const changed = Buffer.from(entry.baseline.text);
    changed[0] ^= 1;
    expect(() => replayOfflineSourceExtension(entry.target, changed)).toThrow('baseline changed');
  }
);

it('rejects joint extension input and output edits through the actual authenticated reader', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-offline-extension-')));
  directories.push(directory);
  mkdirSync(join(directory, 'lib'));
  mkdirSync(join(directory, 'inputs'));
  const input = readOfflineSourceExtension();
  input.entries[0].edits[0].after +=
    '<uses-permission android:name="android.permission.CAMERA"/>\n';
  writeFileSync(
    join(directory, 'inputs/offline-library-source-extension.json'),
    JSON.stringify(input)
  );
  writeFileSync(
    join(directory, 'lib/offline-library-source-extension.mjs'),
    readFileSync(join(root, 'tools/migration/lib/offline-library-source-extension.mjs'))
  );
  const reader = await import(
    pathToFileURL(join(directory, 'lib/offline-library-source-extension.mjs')).href
  );
  expect(() => reader.readOfflineSourceExtension()).toThrow('input changed');
  const moduleSource = readFileSync(
    join(directory, 'lib/offline-library-source-extension.mjs'),
    'utf8'
  );
  const guard = 'sha256(bytes) !== INPUT_SHA256';
  expect(moduleSource.split(guard)).toHaveLength(2);
  writeFileSync(
    join(directory, 'lib/inverted-extension.mjs'),
    moduleSource.replace(guard, 'false')
  );
  const inverted = await import(pathToFileURL(join(directory, 'lib/inverted-extension.mjs')).href);
  expect(() => inverted.readOfflineSourceExtension()).not.toThrow();
});

it('roots the actual RSD native tool suite at tools and rejects the inherited wrong depth', () => {
  expect(rsdConfig.root).toBe(join(root, 'tools'));
  const inheritedWrongRepoRoot = join(root, 'tools');
  const wrongToolsRoot = join(inheritedWrongRepoRoot, 'tools');
  for (const file of rsdConfig.test.include) {
    expect(existsSync(join(rsdConfig.root, file))).toBe(true);
    expect(existsSync(join(wrongToolsRoot, file))).toBe(false);
  }
  const source = readFileSync(join(root, 'tools/migration/rsd-drawing-vitest.config.mjs'), 'utf8');
  expect(source).toContain(
    `const repoRoot = join(import.meta.dirname, ${Array(2).fill("'..'").join(', ')});`
  );
  expect(source).toContain("root: join(repoRoot, 'tools')");
});
