import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { assertDevelopmentPlatforms } from '../lib/native-config.mjs';

const root = join(import.meta.dirname, '../../..');
const require = createRequire(join(root, CANDIDATE_DIRECTORY, 'package.json'));
const { getConfig } = require('@expo/config');
const fixtures = [];

function platforms(value) {
  const path = mkdtempSync(join(tmpdir(), 'splotch-development-platforms-'));
  fixtures.push(path);
  writeFileSync(
    join(path, 'package.json'),
    readFileSync(join(root, CANDIDATE_DIRECTORY, 'package.json'))
  );
  writeFileSync(
    join(path, 'app.json'),
    JSON.stringify({ expo: { name: 'fixture', slug: 'fixture', platforms: value } })
  );
  assertDevelopmentPlatforms(JSON.parse(readFileSync(join(path, 'app.json'))).expo.platforms);
  return getConfig(path, { skipSDKVersionRequirement: true }).exp.platforms;
}

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('the drawing development platform declaration', () => {
  it('consumes the actual Expo-configured three-platform declaration', () => {
    const config = getConfig(join(root, CANDIDATE_DIRECTORY), { skipSDKVersionRequirement: true });
    expect(() => assertDevelopmentPlatforms(config.exp.platforms)).not.toThrow();
    expect(() => assertDevelopmentPlatforms(platforms(['android', 'ios', 'web']))).not.toThrow();
  });

  it.each(
    [
      ['android', 'ios'],
      ['android', 'web'],
      ['ios', 'web'],
      ['android', 'ios', 'web', 'web'],
      ['android', 'ios', 'web', 'foreign'],
    ].map((value) => ({ value }))
  )('rejects a changed declaration %# through the configured consumer', ({ value }) => {
    expect(() => assertDevelopmentPlatforms(platforms(value))).toThrow('development platforms');
  });
});
