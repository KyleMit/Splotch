import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  NATIVE_GEMFILE_OWNER,
  NATIVE_GEMFILE_LOCK_OWNER,
  readCandidateGemfile,
} from '../lib/native-gemfile.mjs';
import { readTemplateManifest } from '../lib/native-template.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);
const source = readFileSync(join(candidate, NATIVE_GEMFILE_OWNER.path), 'utf8');
const lockSource = readFileSync(join(candidate, NATIVE_GEMFILE_LOCK_OWNER.path));
const fixtures = [];

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-native-gemfile-control-')));
  fixtures.push(directory);
  writeFileSync(join(directory, NATIVE_GEMFILE_LOCK_OWNER.path), lockSource);
  return directory;
}

describe('manual native Gemfile source owner', () => {
  it('binds exact proposal pins without claiming template generation or gem resolution', () => {
    expect(readCandidateGemfile(candidate)).toMatchObject({
      ...NATIVE_GEMFILE_OWNER,
      lockfile: NATIVE_GEMFILE_LOCK_OWNER,
      resolvedGemGraphQualified: false,
    });
    for (const [name, version] of [
      ['cocoapods', NATIVE_GEMFILE_OWNER.cocoapods],
      ['xcodeproj', NATIVE_GEMFILE_OWNER.xcodeproj],
    ])
      expect(source).toContain(`gem '${name}', '= ${version}'`);
    expect(source).toContain(`ruby "= ${NATIVE_GEMFILE_OWNER.ruby}"`);
    expect(readTemplateManifest(root).members.map((row) => row.path)).not.toContain(
      'package/Gemfile'
    );
  });

  it('keeps development selections and documented lock ownership bound to their source owners', () => {
    const development = readFileSync(join(candidate, 'DEVELOPMENT.md'), 'utf8');
    const ownership = readFileSync(join(candidate, 'NATIVE-SOURCES.md'), 'utf8');
    expect(development).toContain('process.stdout.write(NATIVE_CONTRACT.nodeVersion)');
    expect(development).toContain('export GEMRC=/dev/null');
    expect(development).toContain('export BUNDLE_IGNORE_CONFIG=true');
    expect(development).toContain('export BUNDLE_FROZEN=true');
    expect(ownership).toContain('NATIVE_GEMFILE_LOCK_OWNER');
    expect(ownership).not.toContain(NATIVE_GEMFILE_LOCK_OWNER.sourceSha256);
  });

  it('retains released compatibility constraints and explicit Ruby 3.4 library consumers', () => {
    expect(source).toContain("gem 'activesupport', '>= 6.1.7.5', '< 7.1.0'");
    expect(source).toContain("gem 'concurrent-ruby', '<= 1.3.4'");
    expect(source).toContain("gem 'json', '< 3'");
    for (const name of ['bigdecimal', 'logger', 'benchmark', 'mutex_m', 'nkf'])
      expect(source).toContain(`gem '${name}'\n`);
  });

  it('rejects the released incompatible xcodeproj cap and accepts exact restoration', () => {
    const directory = fixture();
    const path = join(directory, NATIVE_GEMFILE_OWNER.path);
    const pinned = `gem 'xcodeproj', '= ${NATIVE_GEMFILE_OWNER.xcodeproj}'`;
    expect(source.split(pinned)).toHaveLength(2);
    writeFileSync(path, source.replace(pinned, "gem 'xcodeproj', '< 1.26.0'"));
    expect(() => readCandidateGemfile(directory)).toThrow('Manual native Gemfile source changed');
    writeFileSync(path, source);
    expect(readCandidateGemfile(directory).sourceSha256).toBe(NATIVE_GEMFILE_OWNER.sourceSha256);
  });

  it('rejects missing or substituted manual sources', () => {
    const directory = fixture();
    expect(() => readCandidateGemfile(directory)).toThrow();
    writeFileSync(
      join(directory, NATIVE_GEMFILE_OWNER.path),
      `${source}\neval('unexpected source')\n`
    );
    expect(() => readCandidateGemfile(directory)).toThrow('Manual native Gemfile source changed');
  });

  it('rejects aliases even when their target has the correct source bytes', () => {
    const directory = fixture();
    const path = join(directory, NATIVE_GEMFILE_OWNER.path);
    const target = join(directory, 'substituted-source');
    writeFileSync(target, source);
    symlinkSync(target, path);
    expect(() => readCandidateGemfile(directory)).toThrow(
      'Manual native Gemfile is not an owned regular source'
    );
  });

  it('rejects a missing lock and accepts exact source restoration', () => {
    const directory = fixture();
    writeFileSync(join(directory, NATIVE_GEMFILE_OWNER.path), source);
    const path = join(directory, NATIVE_GEMFILE_LOCK_OWNER.path);
    rmSync(path);
    expect(() => readCandidateGemfile(directory)).toThrow();
    writeFileSync(path, lockSource);
    expect(readCandidateGemfile(directory).lockfile).toEqual(NATIVE_GEMFILE_LOCK_OWNER);
  });

  it('rejects changed resolved lock bytes without claiming graph qualification', () => {
    const directory = fixture();
    writeFileSync(join(directory, NATIVE_GEMFILE_OWNER.path), source);
    const path = join(directory, NATIVE_GEMFILE_LOCK_OWNER.path);
    writeFileSync(path, Buffer.concat([lockSource, Buffer.from('\nchanged resolution\n')]));
    expect(() => readCandidateGemfile(directory)).toThrow('Native Gemfile.lock source changed');
    writeFileSync(path, lockSource);
    expect(readCandidateGemfile(directory)).toMatchObject({
      lockfile: NATIVE_GEMFILE_LOCK_OWNER,
      resolvedGemGraphQualified: false,
    });
  });

  it.each(['symlink', 'hardlink'])('rejects a %s lock alias and accepts restoration', (kind) => {
    const directory = fixture();
    writeFileSync(join(directory, NATIVE_GEMFILE_OWNER.path), source);
    const path = join(directory, NATIVE_GEMFILE_LOCK_OWNER.path);
    const target = join(directory, 'aliased-lock');
    writeFileSync(target, lockSource);
    rmSync(path);
    const link = kind === 'symlink' ? symlinkSync : linkSync;
    link(target, path);
    expect(() => readCandidateGemfile(directory)).toThrow(
      'Native Gemfile.lock is not an owned regular source'
    );
    rmSync(path);
    writeFileSync(path, lockSource);
    expect(readCandidateGemfile(directory).lockfile).toEqual(NATIVE_GEMFILE_LOCK_OWNER);
  });

  it('rejects a directory substituted for the lock', () => {
    const directory = fixture();
    writeFileSync(join(directory, NATIVE_GEMFILE_OWNER.path), source);
    const path = join(directory, NATIVE_GEMFILE_LOCK_OWNER.path);
    rmSync(path);
    mkdirSync(path);
    expect(() => readCandidateGemfile(directory)).toThrow(
      'Native Gemfile.lock is not an owned regular source'
    );
  });
});
