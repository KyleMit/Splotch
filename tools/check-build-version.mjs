import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { coloringPackManifestPath } from '../web/src/lib/coloringPacks/manifest.ts';
import { VERSION_JSON_FILENAME } from '../web/src/lib/pwa/versionEndpoint.ts';
import { filesRecursively } from './lib/filesystem.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const OUTPUT_DIR = join(ROOT, 'web/.svelte-kit/output');
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

function bundleContainsVersionLiteral(bundleDir, version) {
  const literals = [`"${version}"`, `'${version}'`, `\`${version}\``];
  return filesRecursively(bundleDir)
    .filter((path) => path.endsWith('.js'))
    .some((path) => {
      const source = readFileSync(path, 'utf8');
      return literals.some((literal) => source.includes(literal));
    });
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
  if (!bundleContainsVersionLiteral(bundleDir, version)) {
    problems.push(`${label} JavaScript never inlines __APP_VERSION__ ${version}`);
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

export function buildVersionProblems(outputDir) {
  const clientDir = join(outputDir, 'client');
  const serverDir = join(outputDir, 'server');
  const clientVersionJson = join(clientDir, VERSION_JSON_FILENAME);
  if (!existsSync(clientVersionJson)) return [`Client ${VERSION_JSON_FILENAME} does not exist`];
  const version = readVersion(clientVersionJson);
  return [
    ...bundleVersionProblems(clientDir, 'Client', version),
    ...bundleVersionProblems(serverDir, 'Server', version),
    ...serviceWorkerProblems(clientDir, version),
  ];
}

export async function checkBuildVersion({ outputDir = OUTPUT_DIR, log = console.log } = {}) {
  const problems = buildVersionProblems(outputDir);
  if (problems.length) throw new Error(problems.join('\n'));
  const version = readVersion(join(outputDir, 'client', VERSION_JSON_FILENAME));
  log(`[build-version] client, server, coloring manifest, and service worker all carry ${version}`);
}

if (isMain(import.meta.url)) runMain(checkBuildVersion);
