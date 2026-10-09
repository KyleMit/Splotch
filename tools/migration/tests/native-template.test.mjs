import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  assertContainedNativePath,
  readMaintainedNativeFiles,
} from '../lib/native-source-files.mjs';
import {
  assertTemplateManifest,
  assertTemplateMemberPath,
  assertNativeProvenance,
  deriveNativeSources,
  readTemplateArchive,
  sha256,
} from '../lib/native-template.mjs';
import {
  candidateTemplateTarget,
  transformTemplateMember,
} from '../lib/native-template-transforms.mjs';

const root = join(import.meta.dirname, '../../..');
const manifest = JSON.parse(
  readFileSync(join(root, 'tools/migration/inputs/native-template-manifest.json'), 'utf8')
);
const alignment = JSON.parse(
  readFileSync(join(root, CANDIDATE_DIRECTORY, 'alignment.json'), 'utf8')
);
const fixtureDirectories = [];

function directory() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-template-test-'));
  fixtureDirectories.push(path);
  return path;
}

function write(rootPath, path, bytes, mode = 0o644) {
  mkdirSync(join(rootPath, path, '..'), { recursive: true });
  writeFileSync(join(rootPath, path), bytes, { mode });
  chmodSync(join(rootPath, path), mode);
}

afterEach(() => fixtureDirectories.splice(0).forEach((path) => rmSync(path, { recursive: true })));

async function archiveFixture(paths, link = null) {
  const path = directory();
  for (const [name, bytes] of paths) write(path, name, bytes);
  if (link) symlinkSync('package.json', join(path, link));
  const names = [...paths.keys(), ...(link ? [link] : [])];
  const chunks = [];
  for await (const chunk of c({ cwd: path, gzip: true, portable: true }, names)) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const fixtureManifest = {
    schemaVersion: 1,
    template: {
      name: manifest.template.name,
      version: manifest.template.version,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    },
    registryMetadata: manifest.registryMetadata,
    archive: { ...manifest.archive, bytes: bytes.length, sha256: sha256(bytes) },
    members: [...paths].map(([name, body]) => ({
      path: name,
      type: 'file',
      mode: '0o644',
      bytes: body.length,
      sha256: sha256(body),
    })),
  };
  return { bytes, manifest: fixtureManifest };
}

function tinySources() {
  return new Map([
    [
      'package/package.json',
      Buffer.from(
        JSON.stringify({ name: manifest.template.name, version: manifest.template.version })
      ),
    ],
    ['package/LICENSE', Buffer.from('licensed template fixture\n')],
  ]);
}

describe('reviewed native template boundary', () => {
  it('binds every manifest row to the reviewed template and rejects a jointly moved identity', () => {
    expect(() => assertTemplateManifest(manifest, alignment)).not.toThrow();
    const changed = structuredClone(manifest);
    changed.template.version = '57.0.29';
    expect(() => assertTemplateManifest(changed, alignment)).toThrow('reviewed SDK alignment');
    changed.template = manifest.template;
    changed.members.push(changed.members[0]);
    expect(() => assertTemplateManifest(changed, alignment)).toThrow('Invalid template member');
  });

  it.each([
    '/package/file',
    'package/../file',
    'package/./file',
    'package//file',
    'other/file',
    'package/a\\b',
    'package/file/',
  ])('rejects an unsafe member %s', (path) => {
    expect(() => assertTemplateMemberPath('package/android/build.gradle')).not.toThrow();
    expect(() => assertTemplateMemberPath(path)).toThrow('Unsafe template member');
  });

  it('parses authenticated regular files and rejects corrupt compressed bytes', async () => {
    const fixture = await archiveFixture(tinySources());
    expect(
      [...(await readTemplateArchive(fixture.bytes, fixture.manifest))].map(([path]) => path)
    ).toEqual([...tinySources().keys()]);
    const corrupt = Buffer.from(fixture.bytes);
    corrupt[0] ^= 1;
    await expect(readTemplateArchive(corrupt, fixture.manifest)).rejects.toThrow(
      'integrity mismatch'
    );
  });

  it('binds retained original text to explicit archive bytes and preserves a UTF8 BOM', async () => {
    const sources = tinySources();
    const path = 'package/android/app/build.gradle';
    sources.set(path, Buffer.from('\uFEFFreviewed original fixture\n'));
    const fixture = await archiveFixture(sources);
    const member = fixture.manifest.members.find((row) => row.path === path);
    member.originalText = sources.get(path).toString('utf8');
    const parsed = await readTemplateArchive(fixture.bytes, fixture.manifest);
    expect(parsed.get(path)).toEqual(Buffer.from(member.originalText, 'utf8'));
    const derived = deriveNativeSources(fixture.manifest, parsed);
    expect(assertNativeProvenance(derived.provenance, fixture.manifest)).toHaveLength(2);
    member.originalText += 'unreviewed';
    await expect(readTemplateArchive(fixture.bytes, fixture.manifest)).rejects.toThrow(
      'Template original text changed'
    );
  });

  it('rejects a member omitted from the committed manifest and an archive symlink', async () => {
    const fixture = await archiveFixture(tinySources());
    const incomplete = structuredClone(fixture.manifest);
    incomplete.members.pop();
    await expect(readTemplateArchive(fixture.bytes, incomplete)).rejects.toThrow(
      'Unexpected template archive member'
    );
    const linked = await archiveFixture(tinySources(), 'package/linked');
    await expect(readTemplateArchive(linked.bytes, linked.manifest)).rejects.toThrow(
      'Unexpected template archive member'
    );
  });

  it('rejects missing expected files and member type, mode, size or hash drift', async () => {
    const fixture = await archiveFixture(tinySources());
    for (const mutation of [
      (value) => value.members.push({ ...value.members[1], path: 'package/absent' }),
      (value) => {
        value.members[1].bytes++;
      },
      (value) => {
        value.members[1].mode = '0o755';
      },
      (value) => {
        value.members[1].sha256 = 'a'.repeat(64);
      },
    ]) {
      const changed = structuredClone(fixture.manifest);
      mutation(changed);
      await expect(readTemplateArchive(fixture.bytes, changed)).rejects.toThrow();
    }
  });

  it('selects only maintained native targets and records every omitted member', () => {
    expect(candidateTemplateTarget('package/App.js')).toBeNull();
    expect(candidateTemplateTarget('package/android/app/debug.keystore')).toBeNull();
    expect(candidateTemplateTarget('package/android/gradlew.bat')).toBeNull();
    expect(candidateTemplateTarget('package/ios/.xcode.env')).toBeNull();
    expect(
      candidateTemplateTarget('package/android/app/src/main/java/com/helloworld/MainActivity.kt')
    ).toBe('android/app/src/main/java/art/splotch/migration/probe/MainActivity.kt');
    const source = tinySources();
    const value = {
      ...manifest,
      members: [...source].map(([path, bytes]) => ({
        path,
        type: 'file',
        mode: '0o644',
        bytes: bytes.length,
        sha256: sha256(bytes),
      })),
    };
    const derived = deriveNativeSources(value, source);
    expect([...derived.files.keys()]).toEqual(['TEMPLATE-LICENSE']);
    expect(derived.provenance.records).toHaveLength(source.size);
    expect(assertNativeProvenance(derived.provenance, value)).toHaveLength(1);
    derived.provenance.records.pop();
    expect(() => assertNativeProvenance(derived.provenance, value)).toThrow(
      'Native provenance replay mismatch'
    );
  });

  it('derives exactly the private-storage removal policy from the authenticated template text', () => {
    const path = 'package/android/app/src/main/AndroidManifest.xml';
    const member = manifest.members.find((row) => row.path === path);
    const transformed = transformTemplateMember(path, Buffer.from(member.originalText));
    const source = transformed.bytes.toString('utf8');
    expect(transformed.change).toBe('reviewed-network-and-private-storage-policy');
    expect(source).toContain('xmlns:tools="http://schemas.android.com/tools"');
    expect(source.match(/<uses-permission\b[^>]*\/>/g)).toEqual([
      '<uses-permission android:name="android.permission.INTERNET"/>',
      '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove"/>',
      '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove"/>',
    ]);
    expect(transformed.bytes).toEqual(
      readFileSync(join(root, CANDIDATE_DIRECTORY, 'android/app/src/main/AndroidManifest.xml'))
    );
  });

  it.each(['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'])(
    'refuses missing original %s input instead of inventing a template declaration',
    (permission) => {
      const path = 'package/android/app/src/main/AndroidManifest.xml';
      const member = manifest.members.find((row) => row.path === path);
      const declaration = `<uses-permission android:name="android.permission.${permission}" android:maxSdkVersion="32" tools:replace="android:maxSdkVersion"/>`;
      const changed = member.originalText.replace(declaration, '');
      expect(changed).not.toBe(member.originalText);
      expect(() => transformTemplateMember(path, Buffer.from(changed))).toThrow(
        'Android storage permission removal'
      );
    }
  );

  it.each(['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'])(
    'rejects joint maintained %s removal and provenance edits',
    (permission) => {
      const candidate = directory();
      const actual = join(root, CANDIDATE_DIRECTORY);
      const receipt = JSON.parse(
        readFileSync(join(actual, 'native-template-provenance.json'), 'utf8')
      );
      for (const record of receipt.records.filter((row) => row.target)) {
        write(
          candidate,
          record.target,
          readFileSync(join(actual, record.target)),
          Number(record.mode)
        );
      }
      write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
      expect(() => readMaintainedNativeFiles(candidate, manifest)).not.toThrow();
      const path = 'android/app/src/main/AndroidManifest.xml';
      const marker = `<uses-permission android:name="android.permission.${permission}" tools:node="remove"/>`;
      const original = readFileSync(join(candidate, path), 'utf8');
      expect(original).toContain(marker);
      const changed = Buffer.from(original.replace(marker, ''));
      write(candidate, path, changed);
      receipt.records.find((row) => row.target === path).targetSha256 = sha256(changed);
      write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
      expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow(
        'Native provenance replay mismatch'
      );
    }
  );

  it('rejects joint unchanged source and receipt hash edits through the maintained-file reader', () => {
    const candidate = directory();
    const actual = join(root, CANDIDATE_DIRECTORY);
    const receipt = JSON.parse(
      readFileSync(join(actual, 'native-template-provenance.json'), 'utf8')
    );
    for (const record of receipt.records.filter((record) => record.target)) {
      write(
        candidate,
        record.target,
        readFileSync(join(actual, record.target)),
        Number(record.mode)
      );
    }
    write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
    const unchanged = receipt.records.find((record) => record.target === 'android/settings.gradle');
    expect(unchanged.change).toBe('unchanged');
    expect(readMaintainedNativeFiles(candidate, manifest).get(unchanged.target)).toEqual(
      readFileSync(join(actual, unchanged.target))
    );
    const changedBytes = Buffer.concat([
      readFileSync(join(candidate, unchanged.target)),
      Buffer.from('println("joint source drift")\n'),
    ]);
    write(candidate, unchanged.target, changedBytes, Number(unchanged.mode));
    unchanged.targetSha256 = sha256(changedBytes);
    write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
    expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow(
      'Native provenance replay mismatch'
    );
  });

  it('rejects canonical escape, source symlinks, file drift and joint receipt omission', () => {
    const candidate = directory();
    const outside = directory();
    symlinkSync(outside, join(candidate, 'escaped'));
    expect(() => assertContainedNativePath(candidate, join(candidate, 'escaped'))).toThrow(
      'escapes owner'
    );
    const actual = join(root, CANDIDATE_DIRECTORY);
    const receipt = JSON.parse(
      readFileSync(join(actual, 'native-template-provenance.json'), 'utf8')
    );
    for (const record of receipt.records.filter((record) => record.target)) {
      write(
        candidate,
        record.target,
        readFileSync(join(actual, record.target)),
        Number(record.mode)
      );
    }
    write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
    expect(readMaintainedNativeFiles(candidate, manifest).size).toBe(
      receipt.records.filter((record) => record.target).length
    );
    const record = receipt.records.find((entry) => entry.target?.endsWith('gradlew'));
    const pristineRecords = [...receipt.records];
    chmodSync(join(candidate, record.target), 0o644);
    expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow(
      'Maintained native source changed'
    );
    chmodSync(join(candidate, record.target), Number(record.mode));
    write(candidate, record.target, 'modified wrapper');
    expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow(
      'Maintained native source changed'
    );
    receipt.records = receipt.records.filter((entry) => entry !== record);
    rmSync(join(candidate, record.target));
    write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
    expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow(
      'Native provenance replay mismatch'
    );
    receipt.records = pristineRecords;
    write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
    symlinkSync(join(actual, record.target), join(candidate, record.target));
    expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow('Native source symlink');
    rmSync(join(candidate, record.target));
    write(candidate, record.target, readFileSync(join(actual, record.target)), Number(record.mode));
    expect(readMaintainedNativeFiles(candidate, manifest).size).toBe(
      pristineRecords.filter((entry) => entry.target).length
    );
  });

  it('accepts actual Git umask027 checkout modes and rejects owner-executable drift', () => {
    const repository = directory();
    const checked = directory();
    const actual = join(root, CANDIDATE_DIRECTORY);
    const receipt = JSON.parse(
      readFileSync(join(actual, 'native-template-provenance.json'), 'utf8')
    );
    for (const record of receipt.records.filter((entry) => entry.target)) {
      write(
        repository,
        record.target,
        readFileSync(join(actual, record.target)),
        Number(record.mode)
      );
    }
    write(repository, 'native-template-provenance.json', JSON.stringify(receipt));
    for (const args of [
      ['init', '--quiet'],
      ['add', '--all'],
      [
        '-c',
        'user.name=Mode Control',
        '-c',
        'user.email=mode-control@example.invalid',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '--quiet',
        '-m',
        'mode control',
      ],
    ]) {
      const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    }
    const checkout = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
      import { spawnSync } from 'node:child_process';
      process.umask(0o027);
      const result = spawnSync('git', ['-C', process.argv[1], 'checkout-index', '--all',
        '--prefix=' + process.argv[2] + '/'], { encoding: 'utf8' });
      process.stderr.write(result.stderr);
      process.exit(result.status);
    `,
        repository,
        checked,
      ],
      { encoding: 'utf8' }
    );
    expect(checkout.status, checkout.stderr).toBe(0);
    const wrapper = join(checked, 'android/gradlew');
    expect(lstatSync(wrapper).mode & 0o777).toBe(0o750);
    expect(lstatSync(join(checked, 'TEMPLATE-LICENSE')).mode & 0o777).toBe(0o640);
    expect(readMaintainedNativeFiles(checked, manifest).size).toBe(45);
    chmodSync(wrapper, 0o650);
    expect(() => readMaintainedNativeFiles(checked, manifest)).toThrow(
      'Maintained native source changed: android/gradlew'
    );
    chmodSync(wrapper, 0o750);
    expect(readMaintainedNativeFiles(checked, manifest).size).toBe(45);
  });

  it('rejects generated native paths instead of hiding a build writer', () => {
    const candidate = directory();
    const actual = join(root, CANDIDATE_DIRECTORY);
    const receipt = JSON.parse(
      readFileSync(join(actual, 'native-template-provenance.json'), 'utf8')
    );
    for (const record of receipt.records.filter((entry) => entry.target)) {
      write(
        candidate,
        record.target,
        readFileSync(join(actual, record.target)),
        Number(record.mode)
      );
    }
    write(candidate, 'native-template-provenance.json', JSON.stringify(receipt));
    for (const path of [
      'android/.gradle/owned.txt',
      'android/.kotlin/owned.txt',
      'ios/.xcode.env',
      'ios/.xcode.env.local',
      'ios/Podfile.lock',
      'ios/Pods/owned.txt',
      'ios/HelloWorld.xcworkspace/owned.txt',
    ]) {
      write(candidate, path, 'generated control');
      expect(() => readMaintainedNativeFiles(candidate, manifest)).toThrow(
        'native tools require a disposable copy'
      );
      rmSync(join(candidate, path));
      let parent = join(candidate, path, '..');
      while (parent !== join(candidate, 'android') && parent !== join(candidate, 'ios')) {
        try {
          rmdirSync(parent);
        } catch {
          break;
        }
        parent = join(parent, '..');
      }
      expect(readMaintainedNativeFiles(candidate, manifest).size).toBe(45);
    }
  });
});
