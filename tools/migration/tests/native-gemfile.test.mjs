import {
  mkdtempSync,
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
import { NATIVE_GEMFILE_OWNER, readCandidateGemfile } from '../lib/native-gemfile.mjs';
import { readTemplateManifest } from '../lib/native-template.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);
const source = readFileSync(join(candidate, NATIVE_GEMFILE_OWNER.path), 'utf8');
const fixtures = [];

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-native-gemfile-control-')));
  fixtures.push(directory);
  return directory;
}

describe('manual native Gemfile source owner', () => {
  it('binds exact proposal pins without claiming template generation or gem resolution', () => {
    expect(readCandidateGemfile(candidate)).toMatchObject({
      ...NATIVE_GEMFILE_OWNER,
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
});
