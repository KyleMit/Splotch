import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const packageSwiftPath = 'ios/App/CapApp-SPM/Package.swift';
const packageResolvedPath =
  'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';

// Capacitor owns both tracked SPM files, so manual fixes are overwritten. The CLI derives the
// manifest's runtime pin and plugin graph from installed packages; Xcode then derives the remote
// resolution. Regenerate the manifest with `npm run cap:sync` and refresh the resolution with
// `npm run ios:build`.
// ios-spm-lock.test.mjs is the durable enforcement point because the generated files cannot carry
// repository instructions beyond Capacitor's own warning banner.
const generatePackageSwiftScript = `
process.argv.push('--json'); // Keep CLI diagnostics on stderr and stdout reserved for the manifest.
const { loadConfig } = require('./node_modules/@capacitor/cli/dist/config.js');
const { logger } = require('./node_modules/@capacitor/cli/dist/log.js');
const { getPlugins, getPluginType } = require('./node_modules/@capacitor/cli/dist/plugin.js');
const { getIOSPlugins } = require('./node_modules/@capacitor/cli/dist/ios/common.js');
const {
  checkPluginsForPackageSwift,
  generatePackageText,
} = require('./node_modules/@capacitor/cli/dist/util/spm.js');

(async () => {
  logger.info = () => {}; // Keep successful discovery silent; warnings still explain exclusions.
  const config = await loadConfig();
  const plugins = await getIOSPlugins(await getPlugins(config, 'ios'));
  const spmPlugins = await checkPluginsForPackageSwift(config, plugins);
  const cordovaPlugins = plugins.filter((plugin) => getPluginType(plugin, 'ios') === 1);
  process.stdout.write(await generatePackageText(config, [...spmPlugins, ...cordovaPlugins]));
})();
`;

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

function generatedPackageSwift() {
  return execFileSync(process.execPath, ['--eval', generatePackageSwiftScript], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
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
    expect([...tracked].sort()).toEqual([packageResolvedPath, packageSwiftPath].sort());
  });

  it("matches the manifest generated from Capacitor's installed iOS plugin graph", () => {
    const packageSwift = readFileSync(join(repoRoot, packageSwiftPath), 'utf8');
    expect(packageSwift).toBe(generatedPackageSwift());
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
