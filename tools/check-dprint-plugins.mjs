// Guard for every dprint-backed command (`format:md`, `format:md:check`, and the
// formatting pass of `ruler:apply`). dprint.json names its plugins by path
// relative to cwd (`node_modules/@dprint/markdown/plugin.wasm`), so unlike the
// tools Node resolves — which walk upward and silently borrow the parent
// checkout's modules — dprint reads this checkout's node_modules or nothing.
//
// The costly case is a stale install rather than a missing one: a long-lived
// worktree merges main, picks up a bumped plugin range and the config options
// that came with it, and keeps the old plugin. dprint then reports the option it
// cannot parse ("Unknown property in configuration: wrapCodeSpans"), which reads
// as a broken config or a broken test while CI stays green because CI installs
// fresh. Naming the version gap instead removes the diagnosis step.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, parseOrFail } from './lib/proc.mjs';

const INSTALL_REMEDY = 'Run `pnpm install --frozen-lockfile` in this checkout.';
const PLUGIN_PACKAGE = /^node_modules\/(?<name>@[^/]+\/[^/]+|[^@/][^/]*)\//;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// dprint.json is JSONC — the comments carry the WHY for each option.
const readJsonc = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, ''));

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left, right) {
  for (const [index, part] of left.entries()) {
    if (part !== right[index]) return part - right[index];
  }
  return 0;
}

// The caret's upper bound is the first non-zero component incremented, so
// ^0.24.0 admits 0.24.x and ^1.2.3 admits 1.x — the distinction that decides
// whether a 0.22.1 plugin satisfies a bumped ^0.24.0 range.
function caretCeiling([major, minor, patch]) {
  if (major !== 0) return [major + 1, 0, 0];
  if (minor !== 0) return [0, minor + 1, 0];
  return [0, 0, patch + 1];
}

// Only the range syntax these plugin pins actually use. Anything else throws
// rather than passing, so a future `~` or `>=` pin earns support here instead of
// a guard that quietly stops guarding.
export function satisfiesRange(range, version) {
  const installed = parseVersion(version);
  const wanted = parseVersion(range.startsWith('^') ? range.slice(1) : range);
  if (!installed || !wanted) {
    throw new Error(`[dprint] unsupported version pin: ${range} against ${version}`);
  }
  if (!range.startsWith('^')) return range === version;
  return (
    compareVersions(installed, wanted) >= 0 && compareVersions(installed, caretCeiling(wanted)) < 0
  );
}

export function dprintPluginPackages(config) {
  return (config.plugins ?? [])
    .map((plugin) => PLUGIN_PACKAGE.exec(plugin)?.groups.name)
    .filter((name) => name !== undefined);
}

export function assertDprintPlugins(root = ROOT) {
  const manifest = readJson(join(root, 'package.json'));
  const declared = { ...manifest.devDependencies, ...manifest.dependencies };
  const problems = [];

  for (const name of dprintPluginPackages(readJsonc(join(root, 'dprint.json')))) {
    const range = declared[name];
    if (!range) {
      problems.push(`${name} is a dprint.json plugin that package.json does not declare.`);
      continue;
    }

    const installed = join(root, 'node_modules', name, 'package.json');
    if (!existsSync(installed)) {
      problems.push(`${name} is not installed, but dprint.json loads it from node_modules.`);
      continue;
    }

    const { version } = readJson(installed);
    if (!satisfiesRange(range, version)) {
      problems.push(`${name} ${version} is installed but package.json wants ${range}.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      [
        '[dprint] plugin versions do not match package.json:',
        ...problems.map((problem) => `  ${problem}`),
        INSTALL_REMEDY,
      ].join('\n')
    );
  }
}

if (isMain(import.meta.url)) parseOrFail(() => assertDprintPlugins());
