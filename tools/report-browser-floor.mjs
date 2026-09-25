import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import browserslist from 'browserslist';
import { features } from 'web-features';
import { BROWSER_TARGETS } from '../web/browserTargets.ts';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

// Read-only evidence for the audit-compatibility skill: how many users the
// declared floor reaches next to Baseline Widely Available, which web/src
// sites probe for a platform feature, and where a named web-features feature
// sits relative to the floor. It reports; every keep/raise/delete judgment
// stays with the auditor.

const SOURCE_ROOT = join(ROOT, 'web', 'src');
const REGISTER_DOC = join(ROOT, 'docs', 'COMPATIBILITY.md');
const REGISTER_HEADING = '## API risk register';

// Server endpoints and dev harnesses never ship to a floor browser, so their
// probes say nothing about the floor.
const EXCLUDED_SOURCE_DIRS = ['lib/server', 'routes/api', 'routes/dev'];
const SOURCE_EXTENSIONS = /\.(?:ts|svelte)$/;
const TEST_FILE = /\.(?:test|spec)\.ts$/;

// browserslist names each engine's desktop and mobile data separately; the
// floor's one version per engine family applies to both.
const BROWSERSLIST_AGENTS = {
  chrome: ['chrome', 'and_chr'],
  edge: ['edge'],
  firefox: ['firefox', 'and_ff'],
  safari: ['safari'],
  ios: ['ios_saf'],
};

// web-features support keys, keyed by the floor engine that governs each.
const WEB_FEATURES_ENGINES = {
  chrome: ['chrome', 'chrome_android'],
  edge: ['edge'],
  firefox: ['firefox', 'firefox_android'],
  safari: ['safari'],
  ios: ['safari_ios'],
};

// Globals whose absence means "not running in a browser document" rather than
// "an old browser": SSR, a worker, or the unit-test environment. A probe that
// names only these is an environment guard, never a compatibility fallback.
const ENVIRONMENT_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'globalThis',
  'self',
  'matchMedia',
  'requestAnimationFrame',
  'localStorage',
  'Image',
  'Worker',
]);

// DOM properties that are null by spec in ordinary use, so an optional chain
// through them is a null check rather than a feature probe.
const NULLABLE_DOM_MEMBERS = new Set([
  'activeElement',
  'fullscreenElement',
  'parentElement',
  'defaultView',
]);

// Lower-case browser globals a feature probe can name bare. Capitalized
// identifiers (constructors) qualify without being listed.
const LOWERCASE_PLATFORM_GLOBALS = new Set([
  ...ENVIRONMENT_GLOBALS,
  'screen',
  'caches',
  'crypto',
  'indexedDB',
  'requestIdleCallback',
  'createImageBitmap',
  'queueMicrotask',
  'structuredClone',
]);

const TYPEOF_PROBE =
  /typeof\s+([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*[!=]==\s*'(?:undefined|function)'/g;
const IN_PROBE = /'([\w$]+)'\s+in\s+(navigator|window|document|globalThis|self|screen)\b/g;
const OPTIONAL_ROOT_CHAIN = /\b(?:navigator|window|document|screen)(?:\??\.[\w$]+)+/g;
// `x.method?.(`: calling a method only where the engine has it.
const OPTIONAL_CALL = /([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\?\.\(/g;
const BUILD_DEFINE = /^__[A-Z_]+__$/;

// Every interface member web-features tracks (`api.Element.getAnimations`),
// so an optional call is only reported when it names a real platform method
// rather than an app callback (`callbacks.onStrokeEnd?.()`).
const PLATFORM_METHODS = new Set(
  Object.values(features).flatMap((feature) =>
    (feature.compat_features ?? [])
      .map((key) => key.split('.'))
      .filter((parts) => parts[0] === 'api' && parts.length === 3)
      .map((parts) => parts[2])
  )
);

export function parseBrowserTarget(target) {
  const match = /^([a-z]+)(\d+(?:\.\d+)*)$/.exec(target);
  if (!match || !(match[1] in BROWSERSLIST_AGENTS)) {
    throw new Error(`Unrecognized browser target: ${target}`);
  }
  return { engine: match[1], version: match[2] };
}

export function floorQuery(targets) {
  return targets
    .map(parseBrowserTarget)
    .flatMap(({ engine, version }) =>
      BROWSERSLIST_AGENTS[engine].map((agent) => `${agent} >= ${version}`)
    )
    .join(', ');
}

export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// The oldest version of each floor engine that Baseline Widely Available
// reaches, read back out of browserslist's own resolution of that query.
export function baselineWidelyAvailableFloor(resolved) {
  const floor = {};
  for (const [engine, agents] of Object.entries(BROWSERSLIST_AGENTS)) {
    const desktop = agents[0];
    const versions = resolved
      .map((entry) => entry.split(' '))
      .filter(([agent]) => agent === desktop)
      .map(([, version]) => version.split('-')[0]);
    if (versions.length) floor[engine] = versions.sort(compareVersions)[0];
  }
  return floor;
}

function coverage(query) {
  return browserslist.coverage(browserslist(query));
}

function caniuseDataVersion() {
  const requireFromBrowserslist = createRequire(
    createRequire(import.meta.url).resolve('browserslist')
  );
  return requireFromBrowserslist('caniuse-lite/package.json').version;
}

export function usageReport() {
  const targets = BROWSER_TARGETS;
  const floor = Object.fromEntries(
    targets.map(parseBrowserTarget).map(({ engine, version }) => [engine, version])
  );
  const baselineFloor = baselineWidelyAvailableFloor(browserslist('baseline widely available'));
  const current = coverage(floorQuery(targets));
  const raises = Object.entries(baselineFloor)
    .filter(([engine, version]) => floor[engine] && compareVersions(version, floor[engine]) > 0)
    .map(([engine, version]) => {
      const raised = targets.map((target) =>
        parseBrowserTarget(target).engine === engine ? `${engine}${version}` : target
      );
      return {
        engine,
        from: floor[engine],
        to: version,
        lost: current - coverage(floorQuery(raised)),
      };
    });
  return {
    caniuseLite: caniuseDataVersion(),
    floor,
    current,
    baselineFloor,
    baselineWidelyAvailable: coverage('baseline widely available'),
    raises,
  };
}

function probeRoot(expression) {
  return expression.split('.')[0];
}

function isPlatformProbe(expression) {
  const root = probeRoot(expression);
  if (BUILD_DEFINE.test(root)) return false;
  return LOWERCASE_PLATFORM_GLOBALS.has(root) || /^[A-Z]/.test(root) || expression.includes('.');
}

// The object an optional chain allows to be missing: everything before its
// last `?.`. `window.screen?.orientation?.angle` probes `window.screen.orientation`.
function optionallyProbedObject(chain) {
  const cut = chain.lastIndexOf('?.');
  if (cut === -1) return null;
  const probed = chain.slice(0, cut).replaceAll('?', '');
  const lastMember = probed.split('.').at(-1);
  return NULLABLE_DOM_MEMBERS.has(lastMember) ? null : probed;
}

export function probesInLine(line) {
  const probes = [];
  for (const [, expression] of line.matchAll(TYPEOF_PROBE)) {
    const plain = expression.replaceAll('?', '');
    if (isPlatformProbe(plain)) probes.push(plain);
  }
  for (const [, member, root] of line.matchAll(IN_PROBE)) probes.push(`${root}.${member}`);
  for (const [chain] of line.matchAll(OPTIONAL_ROOT_CHAIN)) {
    const probed = optionallyProbedObject(chain);
    if (probed) probes.push(probed);
  }
  for (const [, callee] of line.matchAll(OPTIONAL_CALL)) {
    const method = callee.split(/\??\./).at(-1);
    if (callee.includes('.') && PLATFORM_METHODS.has(method)) {
      probes.push(`${callee.replaceAll('?', '')}()`);
    }
  }
  return [...new Set(probes)];
}

// `window.matchMedia()` probes the same global as `typeof matchMedia`.
function probedGlobal(probe) {
  return probe.replace(/\(\)$/, '').replace(/^(?:window|globalThis|self)\./, '');
}

export function classifyProbes(probes) {
  return probes.every((probe) => ENVIRONMENT_GLOBALS.has(probedGlobal(probe)))
    ? 'environment'
    : 'feature';
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const rel = relative(SOURCE_ROOT, path);
    if (entry.isDirectory()) {
      return EXCLUDED_SOURCE_DIRS.includes(rel) ? [] : sourceFiles(path);
    }
    return SOURCE_EXTENSIONS.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : [];
  });
}

export function registerSection(doc) {
  const start = doc.indexOf(REGISTER_HEADING);
  if (start === -1) throw new Error(`${REGISTER_HEADING} not found in docs/COMPATIBILITY.md`);
  const end = doc.indexOf('\n## ', start + REGISTER_HEADING.length);
  return doc.slice(start, end === -1 ? undefined : end);
}

const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/;

export function probeSites(file, source, registerText) {
  const registered = registerText.includes(`\`${file}\``);
  return source.split('\n').flatMap((line, index) => {
    if (COMMENT_LINE.test(line)) return [];
    const probes = probesInLine(line);
    if (!probes.length) return [];
    return [{ file, line: index + 1, probes, kind: classifyProbes(probes), registered }];
  });
}

export function guardInventory() {
  const registerText = registerSection(readFileSync(REGISTER_DOC, 'utf8'));
  return sourceFiles(SOURCE_ROOT).flatMap((path) =>
    probeSites(relative(SOURCE_ROOT, path), readFileSync(path, 'utf8'), registerText)
  );
}

// web-features ids are not interface names (`DOMMatrix` lives under
// `dom-geometry`), so a miss falls back to the features whose compat keys
// mention the term.
export function featuresMentioning(term) {
  const needle = term.toLowerCase();
  return Object.entries(features)
    .filter(([, feature]) =>
      (feature.compat_features ?? []).some((key) => key.toLowerCase().includes(needle))
    )
    .map(([id]) => id);
}

export function featureStatus(id) {
  const feature = features[id];
  if (!feature) return { id, missing: true, suggestions: featuresMentioning(id) };
  if (feature.kind !== 'feature')
    return { id, redirect: feature.redirect_target ?? feature.redirect_targets };
  const aboveFloor = [];
  for (const { engine, version } of BROWSER_TARGETS.map(parseBrowserTarget)) {
    for (const key of WEB_FEATURES_ENGINES[engine]) {
      const since = feature.status.support[key];
      if (!since) aboveFloor.push(`${key} never`);
      else if (compareVersions(since.replace(/^≤/, ''), version) > 0)
        aboveFloor.push(`${key} ${since}`);
    }
  }
  return {
    id,
    name: feature.name,
    baseline: feature.status.baseline,
    baselineLowDate: feature.status.baseline_low_date,
    support: feature.status.support,
    aboveFloor,
  };
}

const percent = (value) => `${value.toFixed(2)}%`;

function printUsage(report) {
  console.log('## Usage (caniuse-lite global data — not Splotch installs)\n');
  console.log(`caniuse-lite ${report.caniuseLite}`);
  console.log(
    `Declared floor: ${BROWSER_TARGETS.join(', ')} → ${percent(report.current)} of global users`
  );
  const baseline = Object.entries(report.baselineFloor)
    .map(([engine, version]) => `${engine}${version}`)
    .join(', ');
  console.log(
    `Baseline Widely Available: ${baseline} → ${percent(report.baselineWidelyAvailable)}`
  );
  if (!report.raises.length) {
    console.log('Every floor engine is already at or above Baseline Widely Available.');
    return;
  }
  console.log('\nCost of raising one engine to its Baseline Widely Available version:\n');
  console.log('| Engine | From | To | Global users lost |');
  console.log('| --- | --- | --- | --- |');
  for (const raise of report.raises) {
    console.log(`| ${raise.engine} | ${raise.from} | ${raise.to} | ${percent(raise.lost)} |`);
  }
}

function printInventory(sites) {
  const featureSites = sites.filter((site) => site.kind === 'feature');
  console.log('\n## Runtime feature probes in shipped web/src\n');
  console.log(
    `${sites.length - featureSites.length} environment-only guards (SSR, worker, test globals) omitted.\n`
  );
  console.log('| Site | Probes | File cited in register |');
  console.log('| --- | --- | --- |');
  for (const site of featureSites) {
    const cited = site.registered ? 'yes' : '**no**';
    console.log(`| \`${site.file}:${site.line}\` | ${site.probes.join(', ')} | ${cited} |`);
  }
}

function printFeatures(ids) {
  console.log('\n## web-features lookups against the floor\n');
  for (const id of ids) {
    const status = featureStatus(id);
    if (status.missing) {
      const hint = status.suggestions.length
        ? `; compat keys mentioning it: ${status.suggestions.join(', ')}`
        : '';
      console.log(`- ${id}: not a web-features id${hint}`);
    } else if (status.redirect) console.log(`- ${id}: moved to ${status.redirect}`);
    else {
      const verdict = status.aboveFloor.length
        ? `above floor: ${status.aboveFloor.join(', ')}`
        : 'within floor';
      console.log(
        `- ${id} (${status.name}): Baseline ${status.baseline}${status.baselineLowDate ? ` since ${status.baselineLowDate}` : ''} — ${verdict}`
      );
    }
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { feature: { type: 'string', multiple: true } } });
  runMain(async () => {
    printUsage(usageReport());
    printInventory(guardInventory());
    if (values.feature?.length) printFeatures(values.feature);
  });
}
