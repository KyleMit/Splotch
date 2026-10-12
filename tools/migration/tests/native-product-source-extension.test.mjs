import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
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
  readProductSourceExtension,
  replayProductSourceExtension,
} from '../lib/native-product-source-extension.mjs';
import { readAiSourceExtension } from '../lib/native-ai-source-extension.mjs';
import { readOfflineSourceExtension } from '../lib/offline-library-source-extension.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, 'experiments/native-architecture');
const directories = [];
const TARGETS = [
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt',
  'ios/HelloWorld.xcodeproj/project.pbxproj',
  'src/platform/drawingFiles.ts',
  'src/platform/drawingFiles.web.ts',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryEnvironment.kt',
  'ios/HelloWorld/SplotchLibraryEnvironment.m',
  'ios/HelloWorld/SplotchLibraryEnvironment.swift',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt',
  'ios/HelloWorld/SplotchAIEnvironment.swift',
  'ios/HelloWorld/SplotchAIEnvironment.m',
  'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
  'ios/HelloWorld/SplotchAIJournal.swift',
];

afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true }))
);

it('replays the finite joined production targets and retains both native module registrations', () => {
  const recipe = readProductSourceExtension();
  expect(recipe.entries.map((entry) => entry.target)).toEqual(TARGETS);
  for (const entry of recipe.entries) {
    expect(
      replayProductSourceExtension(
        entry.target,
        entry.baseline ? Buffer.from(entry.baseline.text) : undefined
      )
    ).toEqual(readFileSync(join(candidate, entry.target)));
  }
  const application = readFileSync(join(candidate, TARGETS[1]), 'utf8');
  expect(application.split('add(SplotchLibraryPackage())')).toHaveLength(2);
  expect(application.split('add(SplotchAIEnvironmentPackage())')).toHaveLength(2);
  const project = readFileSync(join(candidate, TARGETS[2]), 'utf8');
  for (const name of ['SplotchLibraryEnvironment', 'SplotchAIEnvironment']) {
    expect(project).toContain(`HelloWorld/${name}.swift`);
    expect(project).toContain(`HelloWorld/${name}.m`);
  }
  expect(project.split('/* SplotchAIJournal.swift in Sources */ =')).toHaveLength(2);
  expect(project.split('path = HelloWorld/SplotchAIJournal.swift;')).toHaveLength(2);
  expect(project.split('\t\t\t\tA12870000000000000000002,')).toHaveLength(2);
  expect(project.split('\t\t\t\tA12870000000000000000001,')).toHaveLength(2);
});

it('retains each original native module body exactly rather than composing its implementation', () => {
  const originals = [...readOfflineSourceExtension().entries, ...readAiSourceExtension().entries];
  for (const entry of originals.filter((entry) => !entry.baseline)) {
    expect(replayProductSourceExtension(entry.target)).toEqual(Buffer.from(entry.text));
  }
});

it.each(readProductSourceExtension().entries.filter((entry) => entry.baseline))(
  'rejects changed baseline bytes for joined target $target',
  (entry) => {
    const baseline = Buffer.from(entry.baseline.text);
    baseline[0] ^= 1;
    expect(() => replayProductSourceExtension(entry.target, baseline)).toThrow('baseline changed');
  }
);

it.each(readProductSourceExtension().entries.filter((entry) => !entry.baseline))(
  'refuses to overwrite an existing addition at $target',
  (entry) => {
    expect(() => replayProductSourceExtension(entry.target, Buffer.from(entry.text))).toThrow(
      'addition exists'
    );
  }
);

async function changedRecipe(mutate, invertDigest = false) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-product-extension-')));
  directories.push(directory);
  mkdirSync(join(directory, 'inputs'));
  mkdirSync(join(directory, 'lib'));
  for (const name of ['native-ai-source-extension', 'offline-library-source-extension']) {
    for (const [folder, extension] of [
      ['inputs', 'json'],
      ['lib', 'mjs'],
    ]) {
      copyFileSync(
        join(root, `tools/migration/${folder}/${name}.${extension}`),
        join(directory, `${folder}/${name}.${extension}`)
      );
    }
  }
  const recipe = structuredClone(readProductSourceExtension());
  mutate(recipe);
  writeFileSync(
    join(directory, 'inputs/native-product-source-extension.json'),
    JSON.stringify(recipe)
  );
  let source = readFileSync(
    join(root, 'tools/migration/lib/native-product-source-extension.mjs'),
    'utf8'
  );
  const guard = 'sha256(bytes) !== INPUT_SHA256';
  expect(source.split(guard)).toHaveLength(2);
  source = invertDigest ? source.replace(guard, 'false') : source;
  writeFileSync(join(directory, 'lib/native-product-source-extension.mjs'), source);
  return import(pathToFileURL(join(directory, 'lib/native-product-source-extension.mjs')).href);
}

function removeAiRegistration(recipe) {
  recipe.entries[1].edits[0].after = recipe.entries[1].edits[0].after.replace(
    '          add(SplotchAIEnvironmentPackage())\n',
    ''
  );
}

it('rejects jointly edited registration and recipe bytes and proves the digest guard owns rejection', async () => {
  const actual = await changedRecipe(removeAiRegistration);
  expect(() => actual.readProductSourceExtension()).toThrow('recipe changed');
  const inverted = await changedRecipe(removeAiRegistration, true);
  expect(() => inverted.readProductSourceExtension()).not.toThrow();
});

it.each([
  ['omission', (recipe) => recipe.entries.pop()],
  ['duplicate', (recipe) => recipe.entries.push(recipe.entries[0])],
  [
    'unlisted source',
    (recipe) => {
      recipe.entries[0].target = 'android/unlisted.kt';
    },
  ],
])('rejects %s independently of the digest guard', async (_label, mutate) => {
  const reader = await changedRecipe(mutate, true);
  expect(() => reader.readProductSourceExtension()).toThrow('inventory changed');
});
