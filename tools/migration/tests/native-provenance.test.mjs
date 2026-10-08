import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { assertNativeSourceContract } from '../lib/native-source-contract.mjs';
import { readCandidateEntry, readMaintainedNativeFiles } from '../lib/native-source-files.mjs';
import { expectedNativeProvenance, readTemplateManifest, sha256 } from '../lib/native-template.mjs';

const root = join(import.meta.dirname, '../../..');
const actual = join(root, CANDIDATE_DIRECTORY);
const manifest = readTemplateManifest(root);
const fixtureDirectories = [];
const REPLAY_FAILURE = 'Native provenance replay mismatch';
const JOINT_TRANSFORM_MUTATIONS = [
  ['android/app/build.gradle', 'println("joint source drift")\n'],
  ['android/app/proguard-rules.pro', '# joint source drift\n'],
  ['android/app/src/main/AndroidManifest.xml', '<!-- joint source drift -->\n'],
  [
    'android/app/src/main/java/art/splotch/migration/probe/MainActivity.kt',
    '// joint source drift\n',
  ],
  [
    'android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt',
    '// joint source drift\n',
  ],
  ['android/gradle.properties', '# joint source drift\n'],
  ['android/gradle/wrapper/gradle-wrapper.properties', '# joint source drift\n'],
  ['ios/HelloWorld.xcodeproj/project.pbxproj', '// joint source drift\n'],
  ['ios/HelloWorld/AppDelegate.swift', '// joint source drift\n'],
  ['ios/HelloWorld/Images.xcassets/AppIcon.appiconset/Contents.json', ' \n'],
  ['ios/HelloWorld/Images.xcassets/Contents.json', ' \n'],
  ['ios/HelloWorld/Info.plist', '<!-- joint source drift -->\n'],
  ['ios/Podfile', '# joint source drift\n'],
  ['ios/Podfile.properties.json', ' \n'],
];

function directory() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-provenance-test-'));
  fixtureDirectories.push(path);
  return path;
}

function write(rootPath, path, bytes, mode = 0o644) {
  mkdirSync(join(rootPath, path, '..'), { recursive: true });
  writeFileSync(join(rootPath, path), bytes, { mode });
}

afterEach(() => fixtureDirectories.splice(0).forEach((path) => rmSync(path, { recursive: true })));

function maintainedFixture() {
  const candidate = directory();
  const receipt = JSON.parse(readFileSync(join(actual, 'native-template-provenance.json'), 'utf8'));
  for (const record of receipt.records.filter((row) => row.target)) {
    write(candidate, record.target, readFileSync(join(actual, record.target)), Number(record.mode));
  }
  write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
  const files = readMaintainedNativeFiles(candidate, manifest);
  assertSemanticFiles(files);
  return { candidate, receipt, files };
}

function assertSemanticFiles(files) {
  const { packageManifest, indexSource } = readCandidateEntry(actual);
  assertNativeSourceContract(files, packageManifest, indexSource);
}

function jointMutation(target, suffix) {
  const value = maintainedFixture();
  const record = value.receipt.records.find((row) => row.target === target);
  const bytes = Buffer.concat([value.files.get(target), Buffer.from(suffix)]);
  value.files.set(target, bytes);
  expect(() => assertSemanticFiles(value.files)).not.toThrow();
  write(value.candidate, target, bytes, Number(record.mode));
  record.targetSha256 = sha256(bytes);
  write(value.candidate, 'native-template-provenance.json', JSON.stringify(value.receipt));
  return value;
}

function manifestFixture(mutate) {
  const fixtureRoot = directory();
  const changed = structuredClone(manifest);
  mutate(changed);
  write(
    fixtureRoot,
    'tools/migration/inputs/native-template-manifest.json',
    JSON.stringify(changed)
  );
  write(
    fixtureRoot,
    `${CANDIDATE_DIRECTORY}/alignment.json`,
    readFileSync(join(actual, 'alignment.json'))
  );
  const metadataPath = `tools/migration/inputs/${manifest.template.name}-${manifest.template.version}.metadata.json.txt`;
  write(fixtureRoot, metadataPath, readFileSync(join(root, metadataPath)));
  return fixtureRoot;
}

async function invertedReceiptReader() {
  const modules = directory();
  let templateSource = readFileSync(join(root, 'tools/migration/lib/native-template.mjs'), 'utf8');
  const guard = 'isDeepStrictEqual(provenance, expectedNativeProvenance(manifest))';
  expect(templateSource.split(guard)).toHaveLength(2);
  templateSource = templateSource.replace(guard, 'isDeepStrictEqual(provenance, provenance)');
  for (const [specifier, url] of [
    ['tar', import.meta.resolve('tar')],
    [
      '../../lib/native-candidate.mjs',
      pathToFileURL(join(root, 'tools/lib/native-candidate.mjs')).href,
    ],
    [
      './archive-inventory.mjs',
      pathToFileURL(join(root, 'tools/migration/lib/archive-inventory.mjs')).href,
    ],
    [
      './native-template-transforms.mjs',
      pathToFileURL(join(root, 'tools/migration/lib/native-template-transforms.mjs')).href,
    ],
  ]) {
    const declaration = `from '${specifier}'`;
    expect(templateSource.split(declaration)).toHaveLength(2);
    templateSource = templateSource.replace(declaration, `from '${url}'`);
  }
  write(modules, 'native-template.mjs', templateSource);
  let readerSource = readFileSync(
    join(root, 'tools/migration/lib/native-source-files.mjs'),
    'utf8'
  );
  for (const [specifier, path] of [
    ['../../lib/native-candidate.mjs', 'tools/lib/native-candidate.mjs'],
    ['./native-source-contract.mjs', 'tools/migration/lib/native-source-contract.mjs'],
  ]) {
    const declaration = `from '${specifier}'`;
    expect(readerSource.split(declaration)).toHaveLength(2);
    readerSource = readerSource.replace(
      declaration,
      `from '${pathToFileURL(join(root, path)).href}'`
    );
  }
  write(modules, 'native-source-files.mjs', readerSource);
  return (await import(pathToFileURL(join(modules, 'native-source-files.mjs')).href))
    .readMaintainedNativeFiles;
}

describe('native provenance replay boundary', () => {
  it('derives the complete receipt and positively reads unchanged and transformed maintained files', () => {
    const value = maintainedFixture();
    expect(value.receipt).toEqual(expectedNativeProvenance(manifest));
    for (const target of ['android/settings.gradle', 'android/app/build.gradle']) {
      expect(value.files.get(target)).toEqual(readFileSync(join(actual, target)));
    }
    expect(
      value.receipt.records
        .filter((row) => row.target && row.change !== 'unchanged')
        .map((row) => row.target)
        .sort()
    ).toEqual(JOINT_TRANSFORM_MUTATIONS.map(([target]) => target).sort());
  });

  it.each(JOINT_TRANSFORM_MUTATIONS)(
    'rejects semantic-preserving joint source/receipt drift in %s',
    (target, suffix) => {
      const value = jointMutation(target, suffix);
      expect(() => readMaintainedNativeFiles(value.candidate, manifest)).toThrow(REPLAY_FAILURE);
    }
  );

  it('proves the Groovy joint-edit control passes when the actual checker trusts the receipt', async () => {
    const [target, suffix] = JOINT_TRANSFORM_MUTATIONS[0];
    const value = jointMutation(target, suffix);
    expect(() => readMaintainedNativeFiles(value.candidate, manifest)).toThrow(REPLAY_FAILURE);
    const invertedReader = await invertedReceiptReader();
    expect(invertedReader(value.candidate, manifest).get(target)).toEqual(value.files.get(target));
  });

  it.each([
    ['missing', (receipt) => receipt.records.pop()],
    [
      'duplicate',
      (receipt) => {
        receipt.records[1] = receipt.records[0];
      },
    ],
    [
      'unknown source',
      (receipt) => {
        receipt.records[0].source = 'package/unknown';
      },
    ],
    [
      'source digest',
      (receipt) => {
        receipt.records[0].sourceSha256 = 'a'.repeat(64);
      },
    ],
    [
      'wrong recipe',
      (receipt) => {
        receipt.records.find((row) => row.target).change = 'unreviewed';
      },
    ],
    [
      'missing recipe',
      (receipt) => {
        delete receipt.records.find((row) => row.target).change;
      },
    ],
    [
      'wrong target',
      (receipt) => {
        receipt.records.find((row) => row.target).target = 'android/unknown';
      },
    ],
    [
      'wrong mode',
      (receipt) => {
        const record = receipt.records.find((row) => row.target);
        record.mode = record.mode === '0o755' ? '0o644' : '0o755';
      },
    ],
    [
      'extra field',
      (receipt) => {
        receipt.records[0].unreviewed = true;
      },
    ],
    ['row order', (receipt) => receipt.records.reverse()],
    [
      'root field',
      (receipt) => {
        receipt.unreviewed = true;
      },
    ],
  ])('rejects a %s receipt mutation through the real maintained-file reader', (_name, mutate) => {
    const value = maintainedFixture();
    mutate(value.receipt);
    write(value.candidate, 'native-template-provenance.json', JSON.stringify(value.receipt));
    expect(() => assertSemanticFiles(value.files)).not.toThrow();
    expect(() => readMaintainedNativeFiles(value.candidate, manifest)).toThrow(REPLAY_FAILURE);
  });

  it.each([
    [
      'missing transformed text',
      (value) => {
        delete value.members.find((row) => row.originalText !== undefined).originalText;
      },
      'Invalid template member shape',
    ],
    [
      'extra unchanged text',
      (value) => {
        value.members.find((row) => row.path === 'package/LICENSE').originalText = 'unreviewed';
      },
      'Invalid template member shape',
    ],
    [
      'extra omitted text',
      (value) => {
        value.members.find((row) => row.path === 'package/App.js').originalText = 'unreviewed';
      },
      'Invalid template member shape',
    ],
    [
      'non-string text',
      (value) => {
        value.members.find((row) => row.originalText !== undefined).originalText = 7;
      },
      'Invalid template original text',
    ],
    [
      'invalid UTF8 text',
      (value) => {
        value.members.find((row) => row.originalText !== undefined).originalText = '\uD800';
      },
      'Template original text changed',
    ],
    [
      'wrong byte length',
      (value) => {
        value.members.find((row) => row.originalText !== undefined).bytes++;
      },
      'Template original text changed',
    ],
    [
      'wrong original digest',
      (value) => {
        value.members.find((row) => row.originalText !== undefined).sha256 = 'a'.repeat(64);
      },
      'Template original text changed',
    ],
    [
      'input-independent bad text',
      (value) => {
        value.members.find((row) => row.path === 'package/android/app/build.gradle').originalText +=
          '\n';
      },
      'Template original text changed',
    ],
    [
      'input-dependent text swap',
      (value) => {
        const first = value.members.find(
          (row) => row.path === 'package/ios/HelloWorld/Images.xcassets/Contents.json'
        );
        const second = value.members.find(
          (row) =>
            row.path === 'package/ios/HelloWorld/Images.xcassets/AppIcon.appiconset/Contents.json'
        );
        [first.originalText, second.originalText] = [second.originalText, first.originalText];
      },
      'Template original text changed',
    ],
  ])('rejects %s at the real reviewed-manifest reader', (_name, mutate, failure) => {
    expect(() => readTemplateManifest(manifestFixture(mutate))).toThrow(failure);
  });

  it.each(['package/android/app/build.gradle', 'package/ios/.xcode.env'])(
    'requires every transformation and omission map member: %s',
    (path) => {
      const fixtureRoot = manifestFixture((value) => {
        const member = value.members.find((row) => row.path === path);
        member.path = 'package/unreviewed-map-replacement';
        delete member.originalText;
      });
      expect(() => readTemplateManifest(fixtureRoot)).toThrow(
        'Required template recipe member is absent'
      );
    }
  );

  it('binds member count independently of its retained unpacked byte total', () => {
    const fixtureRoot = manifestFixture((value) => {
      const removed = value.members.find((row) => row.path === 'package/.gitattributes');
      value.members = value.members.filter((row) => row !== removed);
      value.members.find((row) => row.path === 'package/LICENSE').bytes += removed.bytes;
      expect(value.members.reduce((sum, member) => sum + member.bytes, 0)).toBe(361355);
      expect(value.members).toHaveLength(58);
    });
    expect(() => readTemplateManifest(fixtureRoot)).toThrow(
      'Reviewed registry metadata member totals changed'
    );
  });

  it('binds unpacked byte total independently of its retained member count', () => {
    const fixtureRoot = manifestFixture((value) => {
      value.members.find((row) => row.path === 'package/LICENSE').bytes++;
      expect(value.members).toHaveLength(59);
      expect(value.members.reduce((sum, member) => sum + member.bytes, 0)).toBe(361356);
    });
    expect(() => readTemplateManifest(fixtureRoot)).toThrow(
      'Reviewed registry metadata member totals changed'
    );
  });
});
