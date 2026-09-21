import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { coloringPackManifestPath } from '../web/src/lib/coloringPacks/manifest.ts';
import { VERSION_JSON_FILENAME } from '../web/src/lib/pwa/versionEndpoint.ts';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

// Each bundle's version.json is emitted by the same vite.config.ts evaluation
// that supplies that bundle's __APP_VERSION__ define, so it is the bundle's own
// record of the version its JavaScript was compiled with. Comparing those
// records across bundles catches a build split between evaluations without
// guessing which string literals in minified output are the define.
const SHIPPED_CLIENT_DIR = join(ROOT, 'web/build');
const SERVER_DIRS = {
  web: join(ROOT, 'web/.netlify/server'),
  native: join(ROOT, 'web/.svelte-kit/output/server'),
};
const COLORING_MANIFEST_PATTERN = /^coloring\/manifest-.*\.json$/;
const PRECACHE_URL_PATTERN = /\burl:"([^"]+)"/g;

const coloringManifestUrl = (version) => coloringPackManifestPath(version).slice(1);

function coloringManifestUrls(bundleDir) {
  const coloringDir = join(bundleDir, 'coloring');
  if (!existsSync(coloringDir)) return [];
  return readdirSync(coloringDir)
    .map((name) => `coloring/${name}`)
    .filter((url) => COLORING_MANIFEST_PATTERN.test(url))
    .sort();
}

function onlyExpectedUrl(urls, expected) {
  return urls.length === 1 && urls[0] === expected;
}

function readVersion(versionJsonPath) {
  return JSON.parse(readFileSync(versionJsonPath, 'utf8')).version;
}

function bundleVersionProblems(bundleDir, label, version) {
  const problems = [];
  const versionJsonPath = join(bundleDir, VERSION_JSON_FILENAME);
  if (!existsSync(versionJsonPath)) {
    problems.push(`${label} ${VERSION_JSON_FILENAME} is missing`);
  } else {
    const bundleVersion = readVersion(versionJsonPath);
    if (bundleVersion !== version) {
      problems.push(`${label} ${VERSION_JSON_FILENAME} carries ${bundleVersion}, not ${version}`);
    }
  }
  const manifestUrls = coloringManifestUrls(bundleDir);
  if (!onlyExpectedUrl(manifestUrls, coloringManifestUrl(version))) {
    problems.push(
      `${label} coloring manifests are [${manifestUrls.join(', ')}], expected only ${coloringManifestUrl(version)}`
    );
  }
  return problems;
}

function serviceWorkerProblems(clientDir, version) {
  const swPath = join(clientDir, 'sw.js');
  if (!existsSync(swPath)) return [];
  const precached = [...readFileSync(swPath, 'utf8').matchAll(PRECACHE_URL_PATTERN)]
    .map((match) => match[1])
    .filter((url) => COLORING_MANIFEST_PATTERN.test(url));
  if (onlyExpectedUrl(precached, coloringManifestUrl(version))) return [];
  return [
    `sw.js precaches coloring manifests [${precached.join(', ')}], expected only ${coloringManifestUrl(version)}`,
  ];
}

export function buildVersionProblems({ clientDir, serverDir }) {
  const clientVersionJson = join(clientDir, VERSION_JSON_FILENAME);
  if (!existsSync(clientVersionJson)) return [`Client ${VERSION_JSON_FILENAME} does not exist`];
  const version = readVersion(clientVersionJson);
  return [
    ...bundleVersionProblems(clientDir, 'Client', version),
    ...bundleVersionProblems(serverDir, 'Server', version),
    ...serviceWorkerProblems(clientDir, version),
  ];
}

export async function checkBuildVersion({ native = false, log = console.log } = {}) {
  const clientDir = SHIPPED_CLIENT_DIR;
  const serverDir = SERVER_DIRS[native ? 'native' : 'web'];
  const problems = buildVersionProblems({ clientDir, serverDir });
  if (problems.length) throw new Error(problems.join('\n'));
  const version = readVersion(join(clientDir, VERSION_JSON_FILENAME));
  log(`[build-version] client, server, and coloring manifest all carry ${version}`);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { native: { type: 'boolean' } } });
  runMain(() => checkBuildVersion({ native: values.native }));
}
