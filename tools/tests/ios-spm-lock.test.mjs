import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const packageSwiftPath = 'ios/App/CapApp-SPM/Package.swift';
const packageResolvedPath =
  'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';

function lockedImporterVersion(packageName) {
  const lines = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8').split('\n');
  const start = lines.indexOf(`      '${packageName}':`);
  if (start === -1) throw new Error(`No importer entry found for ${packageName}`);
  const followingLines = lines.slice(start + 1);
  const nextEntry = followingLines.findIndex((line) => /^ {6}'\S/.test(line));
  const entryLines = followingLines.slice(0, nextEntry === -1 ? followingLines.length : nextEntry);
  const versionLine = entryLines.find((line) => /^ {8}version: /.test(line));
  const [, version] = versionLine?.match(/^ {8}version: ([^(\s]+)/) ?? [];
  if (!version) throw new Error(`No importer version found for ${packageName}`);
  return version;
}

describe('committed iOS Swift package lock', () => {
  const capacitorVersion = lockedImporterVersion('@capacitor/ios');

  it('keeps both generated SPM files tracked', () => {
    const tracked = execFileSync('git', ['ls-files', packageSwiftPath, packageResolvedPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    expect(tracked).toEqual([packageResolvedPath, packageSwiftPath]);
  });

  it('pins Package.swift to the locked @capacitor/ios version', () => {
    const packageSwift = readFileSync(join(repoRoot, packageSwiftPath), 'utf8');
    const [, pinnedVersion] =
      packageSwift.match(/capacitor-swift-pm\.git", exact: "([^"]+)"/) ?? [];
    expect(pinnedVersion).toBe(capacitorVersion);
  });

  it('resolves the locked @capacitor/ios runtime in Xcode', () => {
    const packageResolved = JSON.parse(readFileSync(join(repoRoot, packageResolvedPath), 'utf8'));
    const capacitorPin = packageResolved.pins.find((pin) => pin.identity === 'capacitor-swift-pm');
    expect(capacitorPin?.state.version).toBe(capacitorVersion);
  });
});
